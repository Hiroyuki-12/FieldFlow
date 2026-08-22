# ロードマップ13 ログ・運用・セキュリティ強化 実装計画

## 1. 目的

FieldFlow Backendへ、画面で発生したエラーをrequestIdから追跡できるJSON構造化ログ、共通例外処理、認証・管理操作イベント、秘密情報マスキング、一般APIのレート制限を実装する。

対応Issueは [#31 ロードマップ13 ログ・運用・セキュリティを強化する](https://github.com/Hiroyuki-12/FieldFlow/issues/31) とする。

ロードマップ13着手時点ではロードマップ12のUI・アクセシビリティ仕上げは未実装だったが、本IssueはBackendの横断基盤を対象とし、画面構成へ依存しないため先行して実装した。

## 2. requestId・JSONログ

- HTTPリクエストごとにBackendでUUID形式のrequestIdを生成し、利用者が送った値をそのまま信頼しない。
- requestIdを`AsyncLocalStorage`で非同期処理へ伝播し、アクセスログ、例外ログ、認証・管理操作ログを同じIDで検索できるようにする。
- requestIdは`X-Request-Id`レスポンスヘッダーとエラー本文へ返す。
- ログは1イベント1行のJSONとし、`timestamp`、`level`、`service`、`environment`、`requestId`、`event`を共通項目にする。
- HTTP完了ログへMethod、テンプレート化したPath、Status、処理時間、認証済みuserIdを含める。Query、URL中の実ID、リクエスト・レスポンス本文は記録しない。
- `LOG_LEVEL`を起動時に検証し、本番では不要なdebugログを抑止できるようにする。

## 3. 例外処理・マスキング

- グローバル例外FilterでHTTPエラーを共通形式へ揃え、既存の`code`、`message`、安全な`details`を維持する。
- 500は利用者へ共通メッセージだけを返し、stack trace、SQL、内部例外メッセージをレスポンスへ含めない。
- 401、403、409、429、500のStatusとrequestIdをログへ残す。業務競合とレート超過はwarn、500はerrorとする。
- password、temporaryPassword、passwordHash、Access/Refresh Token、Authorization、Cookie、JWT鍵、DBパスワード、secretを再帰的にマスキングする。
- 認証情報が自由文へ混入する事故を避けるため、業務イベントは許可したメタデータだけを構造化して記録する。

## 4. 認証・管理操作イベント

- ログイン成功・失敗、Refresh成功・無効・再利用検知、Logout、パスワード変更を記録する。
- ユーザーの存在やログインIDを認証失敗ログへ出さず、成功後に確定したuserIdだけを利用する。
- ユーザー、カテゴリ、道具の作成・変更・状態変更と仮パスワード再発行を記録する。
- 管理操作はactorUserId、targetType、targetId、action、resultだけを記録し、変更本文や仮パスワードを記録しない。

## 5. レート制限・HTTP防御

- `ThrottlerGuard`をグローバルGuardの先頭へ置き、一般APIをIP単位で制限する。
- ログインは既存の20回/15分制限を維持し、アカウント単位の5回失敗後15分ロックと別の防御層として扱う。
- ALBの死活監視を妨げないようhealth APIはレート制限対象外とする。
- 現在のECS想定台数は1台のためインメモリ保存を使用する。複数台へ拡張する場合はRedis等の共有Storageを再検討する。
- `TRUST_PROXY_HOPS`を環境変数化し、ローカル直結と将来のCloudFront・ALB経由で送信元IPを正しく扱えるようにする。
- HelmetによるHTTPセキュリティヘッダーと、明示したリクエストサイズ上限を適用する。

## 6. テスト計画

- requestId生成、非同期伝播、レスポンスヘッダーとの一致を確認する。
- loggerのJSON形式、Level、共通項目、秘密キーの再帰マスキングを単体テストする。
- アクセスログがテンプレート化Pathを使い、Query、実ID、Bodyを含めないことを確認する。
- 例外Filterが既存の409 `details.currentItem`を維持し、500の内部情報を隠すことを確認する。
- 401、403、409、429、500のレスポンスとログレベルをHTTP結合テストで確認する。
- ログイン成功・失敗、Refresh再利用、Logout、パスワード変更のイベントと秘密値非出力を認証結合テストで確認する。
- 管理操作ログにactorUserIdとtargetIdが含まれ、DTOや仮パスワードが含まれないことをController単体テストで確認する。
- Helmetの主要ヘッダー、healthのレート制限除外、一般APIの429を確認する。

## 7. 対象外

- CloudWatch Logs、Alarm、SNS、ECS、ALBなどAWSリソースの作成
- Redis等を使った複数ECSタスク間のレート制限共有
- 利用者向けの業務監査履歴画面・監査テーブル
- Playwright E2E、k6性能試験
- FrontendのUI・アクセシビリティ全体仕上げ

## 8. 完了条件

- Issue #31の受け入れ条件を満たす。
- 画面へ返したrequestIdから、HTTP・例外・認証・管理操作ログを追跡できる。
- 既存APIの業務エラーコードと安全な復旧情報を壊さない。
- パスワード、Token、Cookie、認証Header、リクエスト本文がログへ出ない。
- BackendとFrontendのlint、型チェック、単体・結合・画面テスト、buildが成功する。
- `git diff --check`が成功する。
- 標準portでFrontendとBackendが応答し、401、429、500の代表的な動作を確認できる。

## 9. 実装後の動作確認・理解チェック

ユーザーの希望に合わせ、実装前の理解度チェックは行わない。実装完了後に、requestIdを使ったログ追跡、JSONログ、秘密情報マスキング、例外レスポンス、レート制限を実際に確認しながら理解度チェックを行う。

## 10. 実装結果

2026-08-22にIssue #31の計画作成、Backend実装、設計資料更新、自動テスト、規定ポートでの疎通確認を完了した。

### 10.1 ログ・例外処理

- `ApplicationLogger`でNestの起動ログとアプリケーションイベントを1イベント1行のJSONへ統一した。`LOG_LEVEL`で出力閾値を変更できる。
- BackendがリクエストごとにUUID v4のrequestIdを生成し、`AsyncLocalStorage`、`X-Request-Id`、エラー本文へ伝播するようにした。利用者が送信した`X-Request-Id`は採用しない。
- HTTP完了ログへMethod、Route Template、Status、処理時間、認証済みuserIdを記録した。Query、URL中の実ID、リクエスト・レスポンス本文は記録しない。
- グローバル例外Filterで401、403、409、413、429、500をrequestId・timestamp付き共通形式へ変換した。既存の業務`code`と409復旧用`details.currentItem`は維持し、500の内部メッセージ、SQL、stack traceは隠した。
- password、Token、Authorization、Cookie、secret等のキーを再帰的にマスキングし、DBパスワード・JWT鍵・初期管理者パスワードの既知値が自由文へ混入した場合も出力前に置換するようにした。

### 10.2 認証・管理操作イベント

- Login成功・失敗、Refresh成功・無効・再利用、Logout、パスワード変更を、本文やTokenを渡さない固定項目の認証イベントとして記録した。
- 認証失敗イベントはloginIdや失敗理由を含めず、ユーザーの存在・停止・ロック状態をログから推測できない形にした。
- ユーザー、カテゴリ、道具の作成・変更・状態変更、仮パスワード再発行を`management_operation`として記録した。actorUserId、targetType、targetId、action、resultだけを渡し、DTOと仮パスワードを記録しない。

### 10.3 HTTP防御・レート制限

- `ThrottlerGuard`を全APIへ適用し、一般APIを同一IPから600回/1分、Loginを20回/15分に制限した。既存のアカウント単位5回失敗後15分ロックは別の防御層として維持した。
- ALBの監視を妨げないようhealth APIをレート制限対象外にした。MVPのECS 1タスク構成ではMemory Storageを使い、複数タスク化時は共有Storageを再検討する。
- Helmet 8.3.0をlockfileへ固定し、HTTPセキュリティヘッダーを追加した。JSONとURL encodedの本文上限を100KBへ固定し、超過をrequestId付き413にした。
- `TRUST_PROXY_HOPS`を0〜2で起動時検証し、ローカル直結は0、将来のCloudFront→ALB→ECSは2とした。

### 10.4 自動確認結果

- Backend: typecheck、lint、22 suite・65件の単体テスト、build成功。
- Testcontainers MySQL・Supertest: 8 suite・54件の結合テスト成功。専用8件で401、403、409、413、429、500、requestId、JSONログ、Helmet、レート制限除外、秘密値非出力を確認した。
- 認証結合テストでLogin成功・失敗、Refresh再利用、Logout、パスワード変更のイベントと、パスワード・生Token非出力を確認した。
- Frontend: typecheck、lint、15 suite・69件のVitest／MSWテスト、build成功。
- Helmet追加時のnpm監査で脆弱性0件を確認した。
- `git diff --check`成功。

### 10.5 稼働確認結果

- 既存のFieldFlow Frontend、Backend、MySQLが規定port `5173`、`8080`、`3306`で稼働し、各Nodeプロセスの作業ディレクトリが本Repositoryの`frontend/`、`backend/`であることを確認した。
- Frontendと`GET /api/health`がHTTP 200、未認証の`GET /api/v1/tools`がHTTP 401を返した。
- healthと401の両方でUUID形式の`X-Request-Id`、Helmetの主要Headerを確認した。401ではHeaderとエラー本文のrequestId一致、timestamp、`X-RateLimit-Limit: 600`を確認した。
- 429と500は本番用Endpointへ不要な負荷・障害を発生させず、専用HTTP結合テストでレスポンスとJSONログを確認した。
