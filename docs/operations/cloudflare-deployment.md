# Cloudflare・Render・Aiven公開環境 運用手順

## 1. 目的と承認ゲート

Workers Static Assets、Workers Free、Render Free Web Service、Aiven for MySQL 8.4でFieldFlowを公開し、安全に更新・復旧する手順である。

次の操作は外部状態または費用へ影響するため、実行直前に対象、料金、影響範囲を説明し、ユーザーの明示承認を得る。

- Render account／Free Web Serviceの作成、plan変更、停止、削除
- Render Secretsの登録・更新、manual deploy、rollback
- Cloudflare Secretの登録・更新
- AivenへのMigration・Seed
- `wrangler deploy`、Worker rollback、公開停止

秘密値はchat、Git、shell history、command引数、標準出力、build／application logへ記録しない。Dashboardのmask入力、CLIの対話入力、または安全な一時実行環境から渡す。

## 2. 費用と無料枠

実行当日に公式料金とlimitを再確認する。2026年8月時点の開始構成:

| 対象       | 開始構成                                | 費用と主な制限                                                                         |
| ---------- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| Cloudflare | Workers Static Assets + Workers Free    | 0 USD。asset requestは無料・無制限。Workerは100,000 requests/day、CPU 10 ms/invocation |
| Render     | Free Web Service、Singapore、1 instance | 0 USD。workspace合計750 hours/month、15分idleで停止、再起動約1分、ephemeral filesystem |
| Aiven      | 作成済みMySQL 8.4 Free                  | 0 USD。1 node、1 GB RAM、1 GB disk、最大76接続、SLAなし                                |

Renderはoutbound bandwidth、build pipeline、service発信trafficにも無料枠／停止条件がある。支払方法を登録した場合は超過課金の条件も確認する。Workers PaidとCloudflare Containersは使用しない。

参照先:

- [Static Assets billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Render Free services](https://render.com/docs/free)
- [Aiven for MySQL free tier](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier)

## 3. Local品質check

```bash
cd frontend
npm ci
npm run typecheck
npm run lint
npm test -- --run
npm run build

cd ../backend
npm ci
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
docker build --tag fieldflow-backend:roadmap-16 .

cd ../cloudflare
npm ci
npm run typecheck
npm test
npm run check:deploy
```

`check:deploy`はWorker bundleとVue Assetsをdry-runで検証し、外部公開を変更しない。Backend imageはRenderと同じ`backend/Dockerfile`をlocal buildして検証する。

## 4. Aiven確認

作成済み`fieldflow-mysql`が`Running`か確認する。passwordとCAは表示・copy・downloadが必要な時点で取り扱い範囲を再確認する。

MySQL clientで確認する場合、passwordをcommand引数へ含めず対話入力する。

```bash
mysql --host=<AIVEN_HOST> --port=<AIVEN_PORT> --user=<AIVEN_USER> --password --ssl-mode=VERIFY_IDENTITY --ssl-ca=<CA_FILE> <AIVEN_DATABASE>
```

`SELECT VERSION();`、`SELECT @@max_connections;`、TLS cipherを確認する。公開作業記録には接続情報や証明書本文を貼らない。

## 5. Migrationと初期Seed

MigrationはRender通常起動と分離し、build済みJavaScriptから一回だけ実行する。

1. `npm run build`
2. `npm run migration:show:prod`
3. 未適用内容を確認して`npm run migration:run:prod`
4. 再度`npm run migration:show:prod`
5. Seed専用初期管理者情報を一時注入して`npm run seed:run:prod`
6. Seed終了後に初期管理者passwordをprocess環境から除去

Migration失敗時はRender／Workerをdeployしない。公開DBで`migration:revert`、破壊的Seed、`TRUNCATE`を即実行せず、失敗したMigrationとDB状態を確認する。

## 6. Render Free Web Service作成

承認後、repository rootの`render.yaml`からBlueprintを作成する。

- service: `fieldflow-api`
- runtime: Docker
- plan: Free
- region: Singapore（作成後変更不可）
- health: `/api/health`
- auto deploy: Off

Blueprintの`sync: false`項目は初回作成画面で入力する。入力値そのものをchatや作業logへ書かない。

| Render key                                                | 内容                                                 |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `CORS_ORIGIN`                                             | Cloudflareの実際のHTTPS公開Origin                    |
| `INGRESS_PROXY_SECRET`                                    | Workerと共有する32byte以上の乱数                     |
| `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD` | Aiven connection情報                                 |
| `DB_TLS_CA_BASE64`                                        | Aiven CA PEMのBase64。変換結果をterminalへ表示しない |

`JWT_ACCESS_SECRET`はBlueprintの`generateValue: true`でRenderに生成させる。初期管理者passwordはRenderへ登録しない。

初回deploy後、Render Dashboardで次を確認する。

1. buildが`backend/Dockerfile`を使用している
2. serviceがFree／Singaporeである
3. healthが成功し`Live`になっている
4. application logにpassword、Token、CA、connection URIが出ていない
5. Render URLの`/api/health`は200、共有鍵なしの`/api/v1/*`は403

## 7. Cloudflare Secretとdeploy

Renderの`INGRESS_PROXY_SECRET`と同じ値を、承認後にCloudflareへ対話入力する。

```bash
cd cloudflare
npx wrangler secret put RENDER_PROXY_SECRET
```

`wrangler.jsonc`の`RENDER_BACKEND_ORIGIN`が実際のRender HTTPS Originと一致することを確認する。値は公開URLなのでGit管理できるが、passwordやqueryを含めない。

承認後、Migration成功・Render health成功を条件にdeployする。

```bash
npm run deploy
```

deploy出力でCloudflare公開URLを確認し、そのOriginがRenderの`CORS_ORIGIN`と完全一致することを確認する。不一致なら公開smoke前にRender Secretを修正してmanual deployする。

## 8. 公開smoke確認

公開Originは`https://fieldflow.fieldflow-portfolio.workers.dev`、内部接続先のRender Originは`https://fieldflow-api-l94x.onrender.com`である。ブラウザやFrontend設定からRender Originを直接利用しない。

低頻度で次の順に確認する。

1. `/`がVueを返す
2. `/tools`直アクセスがSPA fallbackでVueを返す
3. Renderを15分以上idleにした後、再アクセスで起動待ち画面が表示される
4. 自動再試行後にLogin画面へ進む
5. `/api/health`が200を返す
6. Login responseのRefresh Cookieが`Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax`
7. Refresh rotation、logout、再Loginが成功する
8. 管理画面と日別表の主要操作が成功する
9. Render再起動後もAiven dataが残る
10. Worker／Render logをrequestIdで追跡でき、秘密値がない

自動再試行はhealthだけに限定する。作成・更新POSTを自動再送すると、responseだけ失われた場合に二重登録を起こし得るためである。

## 9. 障害切り分け

| 症状                     | 確認順                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------- |
| 起動待ちが続く           | Render events → build／runtime log → Aiven Running → DB TLS／pool                  |
| Workerが503を返す        | Render health → `RENDER_BACKEND_ORIGIN` → Render status                            |
| Render直APIが通る        | `INGRESS_PROXY_SECRET`設定とMiddleware有効化を確認                                 |
| Login後にRefreshできない | Cloudflare公開Originと`CORS_ORIGIN`、Cookie Path／Secure／SameSite、Set-Cookie透過 |
| 429                      | Cloudflare Worker daily limit、Nest rate limit、送信元IPのProxy hopを区別          |
| Aiven接続失敗            | service state、port、CA、TLS、接続上限を確認。秘密値はlogへ出さない                |

## 10. rollback

- Frontend／Worker障害: Cloudflare deploymentsで直前の正常versionを指定してrollbackする。
- Backend障害: Render Freeで利用できる直前2deployの正常imageへrollbackする。
- DB Migration障害: application rollbackだけでschema互換性が戻るか確認し、破壊的rollbackを即実行しない。

rollbackも外部状態の変更なので、対象versionと影響を説明して承認後に実施する。

## 11. 定期運用

- Cloudflare Worker requests、error、log保持期間を確認する。
- Renderのinstance hours、bandwidth、pipeline minutes、events、停止通知を確認する。
- Aivenのconnection数、1 GB storage、backup、停止通知を確認する。
- ポートフォリオ公開期間は各serviceの状態を定期的に確認する。
- 常時pingでRenderのidle停止を回避しない。
- 公開不要になった場合も独断で削除せず、URL保持期間とdata backupを確認する。
