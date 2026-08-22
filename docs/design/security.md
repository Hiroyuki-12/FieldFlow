# セキュリティ設計

## 1. 認証Token

| 対象 | 方針 |
| --- | --- |
| Access Token | JWT、15分、レスポンス本文で返しVueのメモリだけに保存 |
| Refresh Token | 256bit以上のランダム値、7日、HttpOnly Cookie、DBはハッシュだけ |
| 署名鍵 | 32byte以上、Cloudflare SecretsまたはSSM Parameter Store SecureStringから注入 |
| ローテーション | Refresh成功ごとに旧セッションを失効し、新Tokenへ置換 |
| 複数端末 | 端末ごとにrefresh_sessionsを作成 |

JWTクレームは`sub`（userId）、`role`、`mustChangePassword`、`authVersion`、`iat`、`exp`、`jti`に限定し、氏名や秘密情報を含めない。GuardはDBの利用状態と`authVersion`を確認し、利用停止・パスワード変更・仮パスワード再発行時はDB値を加算して既存Access Tokenも失効させる。

## 2. Cookie・CSRF・CORS

- 公開環境は同一オリジンから画面と`/api/*`を配信する。CloudflareではWorker、AWSではCloudFrontを入口とする。
- Refresh Cookieは`HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`とする。
- Refresh・Logoutは`Origin`ヘッダーが許可オリジンと一致することも検証する。
- ローカルだけ`http://localhost:5173`から`http://localhost:8080`を許可し、資格情報付きCORSのワイルドカードを使わない。
- 通常APIはAuthorizationヘッダーを使うため、Cookieだけで業務更新を認可しない。

## 3. パスワード

- Argon2idを使用し、最低19MiB・2 iterations・parallelism 1を基準に、Cloudflare ContainerとFargateの各実行環境で応答時間を計測して安全側へ調整する。
- パスワードは12〜128文字。文字種の強制や定期変更は行わず、既知の弱いパスワードは拒否できる構造にする。
- 仮パスワードは暗号学的乱数で16文字生成し、レスポンスに一度だけ含める。
- パスワード、仮パスワード、ハッシュ、Authorization、Cookieをログ・例外・分析イベントへ出さない。

## 4. 認可

- NestJS Guardで認証、初回パスワード変更、ロールの順に判定する。
- Controllerに`ADMIN`を宣言し、Serviceでも対象ユーザー・状態などの業務ルールを検証する。
- IDを変更して他リソースを操作するIDORを防ぐため、すべてのIDをDBで検証する。
- 401は未認証、403は認証済みだが権限不足として使い分ける。

## 5. 攻撃対策

- DTOを`whitelist`と`forbidNonWhitelisted`で検証し、未定義項目を拒否する。
- TypeORMのパラメータバインドを使用し、入力からSQL文字列を組み立てない。
- Vueの通常エスケープを使い、`v-html`へユーザー入力を渡さない。
- Helmet 8.3.0のHTTPセキュリティヘッダーを設定する。本番ではCSPとHSTSを有効にし、非本番ではHTTPのSwagger UIを動かすためこの2項目だけ無効にする。
- ログインはアカウント単位で5回失敗後15分制限し、IP単位のレート制限も併用する。成功時に失敗回数をリセットする。
- ログインはIP単位20回/15分、一般APIは同一IPから600回/1分を初期値とする。health APIは公開基盤の死活監視を妨げないよう除外する。
- レート制限はMVPのCloudflare Container最大1インスタンス、またはECS 1タスク構成に合わせてプロセス内Memoryで保持する。複数インスタンス・タスクへ拡張する場合はRedis等の共有Storageへ変更する。
- JSONとURL encodedのリクエスト本文を100KBまでに制限し、超過はrequestId付き413で拒否する。
- `TRUST_PROXY_HOPS`はローカル直結で0、CloudFront→ALB→ECSで2とする。CloudflareはWorker→Container間で実際に付与される転送ヘッダーとHop数をデプロイ時に確認して確定する。実際より広くProxyを信頼して送信元IPを偽装されないよう、許可値を0〜2に限定する。

## 6. 公開環境・秘密情報

### Cloudflare公開環境

- 利用者→WorkerはHTTPSを強制し、Workerを画面とAPIの単一入口にする。Containerへの直接アクセス経路を公開しない。
- DB接続情報、JWT鍵、Cookie・Origin検証値はCloudflare Secretsで管理し、`wrangler.toml`やGitHubへ平文で保存しない。
- Aiven MySQLはTLS証明書を検証して接続し、公開アプリ用の最小権限DBユーザーを使用する。
- Cloudflare API Tokenは対象Account・Workerへ必要な権限だけを付与し、アカウント全体を操作できるGlobal API KeyをCIへ保存しない。

### AWS課題環境

- ユーザー→CloudFrontはHTTPSを強制する。独自ドメイン未取得のMVPではCloudFront既定証明書を使う。
- ALB直アクセスはCloudFrontが付ける`X-Origin-Verify`秘密ヘッダーで拒否する。
- Fargate 8080はALB Security Groupからだけ、RDS 3306はFargate Security Groupからだけ許可する。
- DBパスワード、JWT鍵、Origin検証値をSSM SecureStringで管理し、Terraform stateと`tfvars`を公開しない。
- ECS Task RoleとExecution Roleを分け、ECR pull、Logs、SSM読取を必要最小限にする。

## 7. セキュリティテスト

- 401/403、Token改ざん・期限切れ、Refresh再利用、利用停止、初回変更Guardを結合テストする。
- SQL Injection、XSS用入力、過剰プロパティ、レート超過、Cookie属性を確認する。
- `npm audit`などの依存確認結果は参考情報として扱い、更新はテストを通したPRで行う。

## 8. 参照資料

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
