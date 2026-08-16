# ロードマップ5 Frontend認証・共通UI 実装計画

## 1. 目的

FieldFlow Frontendへ、Backendの認証APIと接続するログイン、認証状態管理、Token更新、初回・通常パスワード変更、ログアウトを実装する。
画面を表示できることだけでなく、Access Tokenを安全に扱い、同時に複数のAPIが`401 Unauthorized`になった場合もRefreshを1回だけ実行し、未認証・初回パスワード未変更・権限不足の利用者を適切な画面へ案内できる共通基盤を作る。

対応Issueは [#15 Frontend認証・共通UIを実装する](https://github.com/Hiroyuki-12/FieldFlow/issues/15) とする。

実装状況: Frontend実装、単体・画面統合テスト、品質チェック、実Backendを使ったブラウザ確認まで完了。実装後理解度チェック、ユーザー確認、commit、push、PR作成は未実施。

## 2. 実装対象

### 2.1 認証画面

| 画面ID | Route | 認証状態 | 概要 |
| --- | --- | --- | --- |
| SCR-01 | `/login` | 未認証 | ログインIDとパスワードを送信し、通常ユーザーはホーム、初回ユーザーは初回パスワード変更へ進める |
| SCR-02 | `/change-password/initial` | 初回変更前 | 現在の仮パスワードと新パスワードを送信し、成功後は全Tokenを破棄して再ログインを求める |
| SCR-03 | `/password` | 認証済み | 自分の現在パスワードと新パスワードを送信し、成功後は再ログインを求める |
| SCR-04 | `/session-expired` | 認証失効後 | Refresh失敗により操作を継続できないことと再ログイン方法を表示する |
| SCR-90 | `/forbidden` | 認証済み | Role不足で利用できない画面であることを表示する |
| SCR-91 | `/:pathMatch(.*)*` | すべて | 存在しないURLであることを表示する |

ログインとパスワード変更では、送信中の二重送信を防ぐ。入力エラーは該当入力と関連付け、APIの認証失敗はログインID・パスワードのどちらが誤っているかを推測できない共通メッセージで表示する。

### 2.2 APIクライアント

- Axiosの`baseURL`へ`VITE_API_BASE_URL`を使用し、画面や機能別APIへ環境固有URLを直書きしない。
- Refresh Cookieを送受信できるよう、認証APIを含むリクエストで`withCredentials: true`を使用する。
- Access Tokenがある場合だけ`Authorization: Bearer <token>`を付与する。
- Login、Refresh、Logout、`/auth/me`、パスワード変更の型付き関数を用意する。
- Backendのエラー形式を画面用の安全なエラーへ変換し、Token、Cookie、パスワードを例外メッセージや画面へ含めない。
- Refresh自身の`401`を再びRefreshしないよう、Token更新には認証Interceptorを通らない専用クライアントを使う。

### 2.3 401とRefreshの一重化

保護APIが`401`を返した場合は次の順で処理する。

1. 元リクエストが再試行済みか、認証入口APIではないかを確認する。
2. 実行中のRefresh Promiseがなければ、`POST /auth/refresh`を1回だけ開始する。
3. 同時に`401`となった他リクエストは、同じPromiseの完了を待つ。
4. Refresh成功時はPinia StoreのAccess TokenとUserを置換する。
5. 各元リクエストへ新しいAccess Tokenを付け、最大1回だけ再試行する。
6. Refresh失敗時は認証情報を一度だけ破棄し、SCR-04へ遷移する。

無限再試行を防ぐため、再試行済みフラグをAxiosのリクエスト設定へ持たせる。ログイン失敗など、認証入口APIの`401`は自動Refreshの対象にしない。

## 3. Pinia認証Store

認証Storeは、画面をまたいで必要な最小限の認証状態だけを保持する。

| State | 内容 |
| --- | --- |
| `accessToken` | APIへ付与する短命Token。メモリだけに保持する |
| `user` | `id`、`name`、`loginId`、`role`、`mustChangePassword` |
| `status` | 起動確認中、未認証、認証済みを区別する |
| `refreshPromise` | 同時Refreshを1回へまとめるための実行中Promise |

主なActionは、ログイン、起動時のSession復元、Refresh、ログアウト、パスワード変更、認証情報破棄とする。
Access TokenやUserを`localStorage`、`sessionStorage`、IndexedDBへ保存しない。ブラウザ再読み込み時はJavaScriptから読めないHttpOnly Refresh CookieをBackendへ送り、新しいAccess TokenとUserを取得して認証状態を復元する。

起動直後のRefresh失敗は、Cookieを持たない通常の未ログイン状態としてSCR-01へ進める。認証済みでAPI操作中にRefreshが失敗した場合だけSCR-04を表示し、通常の初回アクセスとSession切れを区別する。

## 4. Router Guard

Route Metaへ認証・Role・初回変更中の利用可否を宣言し、共通Guardで判定する。

| 現在状態 | 遷移先 | 判定 |
| --- | --- | --- |
| 未認証 | 認証必須Route | `/login`へ移動し、安全なアプリ内遷移先だけを保持する |
| 認証済み | `/login` | `/`へ移動する |
| `mustChangePassword=true` | 初回変更以外の認証必須Route | `/change-password/initial`へ移動する |
| `mustChangePassword=false` | 初回変更Route | `/`へ移動する |
| Role不足 | 管理者専用Route | `/forbidden`へ移動する |
| 条件を満たす | 要求Route | 遷移を許可する |

URLのRole制御は利用者を正しい画面へ案内するためのFrontend制御であり、セキュリティの最終判断はBackendのJWT GuardとRole Guardが行う。

## 5. 共通レイアウト

- 認証済み画面へ共通Header、メインナビゲーション、現在ユーザー、Role表示、パスワード変更、ログアウトを提供する。
- 管理ナビゲーションは`ADMIN`だけに表示する。ただしロードマップ6〜8で実画面を追加するまでは、未実装機能への操作可能なリンクを表示しない。
- モバイルではメニューを開閉でき、開閉状態を`aria-expanded`で伝える。
- 本文へ移動するスキップリンク、視認できるフォーカス、44px程度の操作領域を用意する。
- モックの配色・余白・認証画面構成をVueとTailwind CSSへ移植し、モック専用のデモアカウント入力や説明は本実装へ持ち込まない。
- ホームの業務機能はロードマップ10で実装するため、本Issueでは認証後の入口と後続機能の実装予定が分かる最小表示に留める。

## 6. セキュリティとエラー処理

- Access TokenはPiniaのメモリだけに保持し、永続ブラウザストレージへ保存しない。
- Refresh TokenはFrontendで読み取らず、HttpOnly CookieとしてブラウザとBackendに管理させる。
- ログアウトはBackendへ通知した後、成功・失敗にかかわらずFrontendの認証情報を破棄する。通信失敗時はサーバーSessionが残る可能性を画面へ安全に通知する。
- パスワード変更成功時はBackendが全Sessionを失効するため、FrontendもAccess Tokenを破棄してログインへ戻す。
- `401`は未認証・Session失効、`403`は認証済みだが権限不足として画面を分ける。
- 予期しないAPIエラーや通信断は、技術的な内部情報を表示せず、再試行方法が分かる日本語メッセージへ変換する。
- ログイン後の戻り先はアプリ内Pathだけを許可し、外部URLへ移動できるOpen Redirectを防ぐ。

## 7. 依存パッケージ

既存のVue、Vue Router、Pinia、Vitest、Vue Testing Libraryに加え、次を互換性確認後にlockfileへ固定する。

- `axios`: API通信、Request・Response Interceptor
- `msw`: 実HTTPに近い単体・画面統合テスト用のAPI Mock

パッケージ追加後は`npm audit`も確認し、既知の脆弱性と対応判断を記録する。

## 8. テスト計画

### 8.1 APIクライアント・Store単体テスト

- Login、Refresh、Logout、`me`、パスワード変更のMethod、URL、本文、Cookie送信設定
- ログイン成功時のToken・User保持と通常／初回変更の遷移判定
- Access Tokenが永続Storageへ保存されないこと
- 起動時Refresh成功によるSession復元と、失敗時の未認証化
- 同時に複数APIが`401`になってもRefreshが1回だけであること
- Refresh後に各リクエストが新Tokenで1回だけ再試行されること
- Refresh失敗時の認証情報破棄とSession切れ通知
- Logoutとパスワード変更成功後の認証情報破棄

### 8.2 Router Guard単体テスト

- 未認証ユーザーの保護Route拒否
- 認証済みユーザーのLogin画面拒否
- 初回変更ユーザーのRoute制限
- `WORKER`による`ADMIN` Routeの拒否とSCR-90遷移
- 許可されたRouteと404 Routeの表示
- 外部形式の戻り先を採用しないこと

### 8.3 Vue Testing Library・MSW画面統合テスト

- Login入力、送信中表示、二重送信防止、正常遷移、共通認証エラー
- 初回パスワード変更の一致・文字数検証、成功後の再ログイン案内
- 通常パスワード変更とLogout
- Session切れ、403、404画面から安全な画面へ戻れること
- 共通レイアウトのユーザー・Role表示、管理者だけのNavigation、モバイルメニュー
- 入力のLabel、エラー関連付け、`aria-live`、キーボード操作に必要な属性

### 8.4 品質チェック

```bash
cd frontend && npm run typecheck
cd frontend && npm run lint
cd frontend && npm test -- --run
cd frontend && npm run build
cd frontend && npm audit
```

## 9. 実装順序

1. 実装前理解度チェックで、Token保存場所、Refresh一重化、Frontend GuardとBackend認可の違いを確認する。
2. AxiosとMSWの互換バージョンを確認し、依存をlockfileへ固定する。
3. 認証API型、エラー変換、認証用・業務用Axios Clientを追加する。
4. Pinia認証Storeと、起動時Session復元を追加する。
5. 401 Interceptor、Refresh一重化、1回だけの再試行を追加する。
6. Router定義と未認証・初回変更・Role Guardを追加する。
7. Login、初回・通常パスワード変更、Session切れ、403、404画面を追加する。
8. 共通レイアウトと認証後ホームを追加する。
9. Vitest、Vue Testing Library、MSWのテストを追加する。
10. Frontend品質チェックと必要な手動表示確認を実施し、設計書との差異を修正する。
11. 実装後理解度チェックとユーザー確認を行う。
12. ユーザー承認後にcommit、push、PR作成へ進む。

## 10. 対象外

- ユーザー管理、作業カテゴリ管理、道具管理のAPIと画面
- 日別表の作成・取得・更新と、完成版ホーム・日別チェック画面
- アプリ全体のJSONログ、requestId、例外Filter、一般APIレート制限の完成
- Playwright E2E、k6性能試験
- AWS、Terraform、CD

## 11. 完了条件

- Issue #15の受け入れ条件を満たす。
- SCR-01〜04、SCR-90、SCR-91と共通レイアウトが設計どおり動作する。
- Access TokenとUserはPiniaのメモリだけにあり、Refresh TokenをJavaScriptから扱わない。
- 同時`401`時のRefresh一重化、最大1回の再試行、失敗時の認証破棄がテストで保証される。
- 未認証、初回変更、Role不足をRouter Guardで案内し、Backend認可が最終防衛線である構成を維持する。
- Frontendの型チェック、lint、単体・画面統合テスト、build、`npm audit`が成功する。
- 実装内容と設計理由をユーザーが自分の言葉で説明できる。

## 12. 実装前理解度チェック

次の内容をユーザー自身の言葉で説明し、理解度60%以上を確認してからFrontend認証の本番コードを実装する。

1. Frontend認証で何を実現するか。
2. Access TokenをPiniaのメモリ、Refresh TokenをHttpOnly Cookieへ分ける理由。
3. 複数APIが同時に`401`となったとき、Refreshを1回へまとめる理由と処理の流れ。
4. Router GuardとBackendのJWT・Role Guardの役割の違い。

## 13. 実装・確認結果

- Axios共通Client、型付き認証API、画面向けエラー変換、Pinia認証Storeを実装した。
- Access TokenはPiniaのメモリだけに保持し、再読み込み時はHttpOnly Refresh CookieでSessionを復元する構成にした。
- 同時に複数APIが`401`になった場合のRefresh一重化、新Tokenでの最大1回再試行、同時失敗時のSession切れ通知一重化を実装した。
- 未認証、初回パスワード変更、Role、Login済み状態を判定するRouter Guardと、安全なアプリ内戻り先判定を実装した。
- SCR-01〜04、SCR-90、SCR-91、認証後ホーム、レスポンシブな共通レイアウトを実装した。
- Axios `1.19.0`とMSW `2.15.0`をlockfileへ固定した。依存監査で検出した推移依存`nanoid`を`3.3.18`へ更新し、脆弱性0件を確認した。
- Frontendテストは6 files、15 testsが成功した。MSWでLogin、Session復元、同時401、Refresh成功・失敗を実HTTPに近い境界で確認した。
- 型チェック、lint、テスト、本番build、`npm audit`がすべて成功した。
- MySQL 8.4、Backend 8080、Frontend 5173を接続し、Login、初回変更への強制遷移、入力不一致、再読み込み後のSession復元、モバイルメニュー、404、Session切れ、Logoutをブラウザで確認した。
- 360px幅で横スクロールが発生せず、主要操作とエラー表示が収まることを確認した。
- 実際のパスワード変更確定はユーザーの資格情報を変更するため自動実行せず、Backend結合テストとFrontendのMSW・入力検証で確認した。
