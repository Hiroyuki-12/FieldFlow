# ロードマップ4 Backend認証・認可 実装計画

## 1. 目的

FieldFlow Backendへ、短命なJWT Access TokenとローテーションするRefresh Tokenを使った認証・認可基盤を実装する。
ログインできることだけでなく、Tokenの盗難・再利用、利用停止、初回パスワード未変更、権限不足をBackendで拒否し、後続の業務APIが同じ仕組みを再利用できる状態を作る。

対応Issueは [#13 Backend認証・認可を実装する](https://github.com/Hiroyuki-12/FieldFlow/issues/13) とする。

実装状況: Backend実装とローカル品質チェック完了。ユーザー確認、commit、push、PR作成は未実施。

## 2. 実装対象

### 2.1 認証API

| ID | Method / Path | 認証方法 | 概要 |
| --- | --- | --- | --- |
| AUTH-01 | `POST /api/v1/auth/login` | 不要 | ID・パスワードを検証し、Access TokenとRefresh Cookieを発行する |
| AUTH-02 | `POST /api/v1/auth/refresh` | Refresh Cookie | Refresh Sessionをローテーションし、新しいTokenを発行する |
| AUTH-03 | `POST /api/v1/auth/logout` | Refresh Cookie | 現在端末のRefresh Sessionだけを失効する |
| AUTH-04 | `GET /api/v1/auth/me` | Access Token | ログイン中ユーザーの公開可能な情報を返す |
| AUTH-05 | `PATCH /api/v1/auth/password` | Access Token | パスワードを変更し、全端末の既存Sessionを失効する |

### 2.2 認証・認可の共通部品

- `JwtAuthGuard`: JWTの署名・期限に加えて、DB上の利用状態と`authVersion`を確認する。
- `MustChangePasswordGuard`: 初回パスワード変更前のユーザーによる業務API利用を拒否する。
- `RolesGuard`: Controllerへ宣言した`ADMIN`、`WORKER`の権限を検証する。
- `@Public()`、`@Roles()`、`@CurrentUser()`など、後続APIでも利用するデコレータを用意する。
- Guardは「JWT認証 → 初回パスワード変更 → Role」の順で適用する。
- APIは原則として認証必須にし、health、login、refresh、logoutだけを明示的に公開する。

## 3. TokenとSessionの設計

### 3.1 Access Token

- JWTとして発行し、有効期間は15分とする。
- クレームは`sub`、`role`、`mustChangePassword`、`authVersion`、`iat`、`exp`、`jti`に限定する。
- APIレスポンス本文で返し、Frontendではメモリだけに保持する前提とする。
- Guardで毎回Userを確認し、利用停止や`authVersion`変更を既存JWTへ即時反映する。

### 3.2 Refresh Token

- `crypto.randomBytes`で256bit以上のランダム値を生成する。
- Token本体はHttpOnly Cookieだけへ設定し、DBにはSHA-256ハッシュだけを保存する。
- 有効期間は7日、CookieのPathは`/api/v1/auth`とする。
- 本番Cookieは`HttpOnly; Secure; SameSite=Lax`、ローカルではHTTPSなしで検証できるよう`Secure`を環境変数で制御する。
- RefreshとLogoutでは`Origin`が許可Originと一致することを確認する。

### 3.3 Refreshローテーション

Refresh処理はTransaction内で対象Sessionをロックし、次の順で行う。

1. CookieのTokenをハッシュ化してRefresh Sessionを検索する。
2. 利用状態、有効期限、ユーザー状態を検証する。
3. 現在Sessionを失効する。
4. 新しいRefresh Sessionを作成する。
5. 旧Sessionの`replacedBySessionId`へ新Session IDを記録する。
6. 新しいAccess TokenとRefresh Cookieを返す。

ローテーション済みSessionのTokenが再利用された場合は、Token盗難の可能性があるため、そのユーザーの全Refresh Sessionを失効する。
Logout済みSessionには`replacedBySessionId`がないため、再送されても他端末までは失効しない。

## 4. パスワードとログイン試行制限

- Argon2idの設定を共通化し、Seed、ログイン、パスワード変更で同じ安全設定を利用する。
- loginIdは前後空白を除去し、小文字へ正規化して検索する。
- ユーザー不存在、パスワード不一致、利用停止の失敗メッセージを統一する。
- ユーザー不存在でもダミーハッシュを検証し、応答時間から存在を推測しにくくする。
- アカウント単位で5回連続失敗した場合は15分間ロックし、成功時に失敗回数をリセットする。
- IP単位でも認証エンドポイントを制限する。一般API全体のレート制限はロードマップ13で仕上げる。
- パスワード、Cookie、Authorization、Token、ハッシュをログや例外へ含めない。

## 5. パスワード変更時の全端末失効

パスワード変更はTransaction内で次を実行する。

1. 現在のパスワードをArgon2idで検証する。
2. 新しいパスワードをArgon2idでハッシュ化する。
3. `mustChangePassword=false`へ更新する。
4. `authVersion`を加算する。
5. ユーザーの有効なRefresh Sessionをすべて失効する。
6. `204 No Content`を返し、Frontendへ再ログインを要求する。

`authVersion`をJWTとDBの両方で比較することで、Refresh Tokenだけでなく発行済みAccess Tokenも無効化する。

## 6. 環境変数・依存パッケージ

以下を起動時に検証する。秘密値や本番用の実値はGitへ含めない。

- JWT署名鍵（32byte以上）
- Access Token有効期間
- Refresh Token有効期間
- Cookieの`Secure`設定
- 許可Origin

JWT、Cookie解析、認証エンドポイントのIP制限に必要なNestJS互換パッケージをlockfileへ固定する。

## 7. テスト計画

### 7.1 単体テスト

- Auth Serviceのログイン、Refresh、Logout、`me`、パスワード変更
- Token生成・ハッシュ化・JWTクレーム
- パスワード検証とloginId正規化
- JWT、初回パスワード変更、Role Guard
- Cookie設定とOrigin検証
- 認証用環境変数の不足・不正値

### 7.2 Testcontainers結合テスト

- 正常ログインとHttpOnly Cookie属性
- 誤った認証情報の共通エラー、利用停止ユーザーの拒否
- 5回失敗後のアカウントロックと成功時リセット
- 改ざん・期限切れJWT、`authVersion`不一致
- Refresh成功、期限切れ、ローテーション
- ローテーション済みToken再利用時の全Session失効
- 複数端末Sessionと現在端末だけのLogout
- `/auth/me`の認証要否とレスポンス項目
- 初回パスワード変更前のAPI制限
- パスワード変更後の全Refresh Sessionと旧Access Tokenの失効
- 不正Originと未定義DTOプロパティの拒否
- DB・レスポンス・テスト出力へ平文パスワードやTokenが残らないこと

### 7.3 品質チェック

```bash
cd backend && npm run typecheck
cd backend && npm run lint
cd backend && npm test
cd backend && npm run test:integration
cd backend && npm run build
```

## 8. 実装順序

1. 認証用の環境変数、依存パッケージ、共通暗号処理を追加する。
2. DTO、認証ユーザー型、Token/Cookie処理を追加する。
3. Auth ServiceへLoginとRefresh Session管理を実装する。
4. Controllerへ5つの認証APIを実装する。
5. JWT、初回パスワード変更、Role Guardをグローバル適用する。
6. 単体テストを追加する。
7. Testcontainers認証API結合テストを追加する。
8. 品質チェックを実行し、実装と設計書の差異を修正する。
9. 実装と動作確認の結果を使って、理解度チェックとユーザー確認を行う。
10. ユーザー承認後にcommit、push、PR作成へ進む。

## 9. 対象外

- Frontendのログイン画面、Pinia、Axios interceptor、Router Guard
- ユーザー管理APIと管理画面
- 全API共通の例外Filter、requestId、JSON監査ログの完成
- Playwright E2E、k6性能試験
- Cloudflare・Aiven公開、AWS・Terraform・CD

## 10. 完了条件

- Issue #13の受け入れ条件を満たす。
- AUTH-01〜05が設計どおり動作する。
- 後続APIが共通Guardとデコレータを再利用できる。
- Token、Cookie、パスワード、ハッシュがログへ出力されない。
- Backendの型チェック、lint、単体テスト、結合テスト、buildがすべて成功する。
- 実装内容と設計理由をユーザーが自分の言葉で説明できる。

## 11. 実装後理解度チェック

ユーザーとの合意により、先に実装と動作確認を行う。その後、実際のAPIレスポンスとDB上のSession変化を見ながら、次の内容をユーザー自身の言葉で説明し、理解度60%以上を確認する。

1. Backend認証で何を実現するか。
2. Access TokenとRefresh Tokenを分け、それぞれ異なる場所へ保存する理由。
3. Refresh Tokenのローテーションと再利用検知が防ぐ被害。
4. `authVersion`と3種類のGuardの役割。

## 12. 実装・確認結果

- AUTH-01〜05、Refreshローテーション、再利用検知、端末単位Logout、全端末失効を実装した。
- JWT、初回パスワード変更、Role Guardをグローバル適用し、healthと認証入口だけを明示的に公開した。
- 既存の`users`と`refresh_sessions`で要件を満たせるため、追加Migrationは作成していない。
- Backend単体テストは11 suites、26 testsが成功した。
- Testcontainers MySQL 8.4の結合テストは3 suites、14 testsが成功した。
- 型チェック、対象ファイルのlint、build、`npm audit`が成功し、脆弱性は0件となった。
