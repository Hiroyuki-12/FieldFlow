# ロードマップ16 Cloudflare・Render・Aiven公開環境 実装計画

## 1. 目的

ポートフォリオとしてFieldFlowを長期公開できるよう、VueをWorkers Static Assets、API入口をWorkers Free、NestJSをRender Free Web Service、MySQL 8.4をAiven Freeへ配置する。AWS実務構成検証環境とは分離し、無料枠を活用しながらCloudflareの単一公開URLからLoginと主要業務操作を確認できる状態を作る。

設計整理はIssue [#39](https://github.com/Hiroyuki-12/FieldFlow/issues/39)、実装と外部リソース作成はIssue [#41](https://github.com/Hiroyuki-12/FieldFlow/issues/41)で管理する。当初予定したCloudflare Containersは採用せず、Workers Paidも契約しない。

## 2. 前提

- ロードマップ1〜15のApplication、CI、E2E、性能試験が完了している。
- Cloudflare、Render、Aivenのaccountを用意する。
- Aiven MySQL 8.4 Free service `fieldflow-mysql`は作成済みである。
- Render service作成、Secrets登録、Migration／Seed、deployは、対象・費用・影響を説明して承認後に行う。
- 料金、無料枠、region、limitは実行日に公式資料で再確認する。
- AivenとRender FreeはSLA対象外で、停止やcold startがある前提で画面と運用を設計する。

## 3. 実装範囲

### Backend / Render

- Node.js 24・NestJS用multi-stage Dockerfileと`.dockerignore`
- 非root実行、Render動的`PORT`、`/api/health`
- Aiven MySQL 8.4のTLS証明書検証、pool上限、connect timeout
- `render.yaml`: Docker、Free、Singapore、health、auto deploy無効
- Cloudflare Workerだけを業務API入口にするproxy共有鍵Middleware
- Worker→Render Proxy経路に合わせた送信元IPと`TRUST_PROXY_HOPS`
- Render SecretsへDB、TLS CA、JWT、CORS、proxy共有鍵を登録する手順

### Cloudflare

- Wrangler設定とWorkers Free用Worker
- Vue `dist`のWorkers Static Assets配信とSPA fallback
- `/api`と`/api/*`だけをRenderへproxy
- path、query、method、body、Refresh Cookie responseの透過
- 利用者入力のProxy Headerと内部共有鍵を削除して安全な値へ置換
- Renderの502／503／504と接続例外を`503 BACKEND_STARTING`へ統一
- Cloudflare SecretでWorker→Render共有鍵を保持

### Frontend

- 最初の画面表示前に`GET /api/health`でBackend readinessを確認
- health requestは4秒でtimeoutし、3秒→5秒→8秒→最大10秒間隔で自動再試行
- cold start中の理由、約1分の目安、自動再試行状況をaccessibleな画面で表示
- API操作中にWorkerから`BACKEND_STARTING`を受けた場合も起動待ち画面へ戻す
- Backend ready後にRefresh CookieでSessionを復元し、Router Guardを進める

### Aiven・data

- 作成済みAiven MySQL 8.4 Freeを使用
- 1 GB disk・最大76接続に収まるdata量とpool設定
- TypeORM Migrationの一回限り実行
- 初期管理者と`共通`categoryのSeed
- backup、接続数、storage、停止通知の確認

### Document・公開確認

- READMEへ構成、無料枠、cold start表示を追記
- Cloudflare・Render・Aivenのarchitecture図とrequest sequence
- service作成、Secrets、Migration、deploy、rollback、障害調査手順
- 実URLでLogin、Refresh、管理、日別表をsmoke確認
- 公開環境へ負荷をかけない単発のAPI確認

## 4. 対象外

- Cloudflare Containers、Durable Objects、Workers Paid
- Cloudflare D1への移行
- AWS、Terraform、ECS Fargate、RDS（ロードマップ17）
- Render paid instance、複数instance、persistent disk
- 公開環境へのk6性能試験
- 独自domain、email通知、MFA

## 5. 実装順序

1. Dockerfile、Aiven TLS、Render動的portとproxy共有鍵検証を実装する。
2. Worker、Static Assets、Render proxy、起動中503をlocal Wranglerで確認する。
3. Frontendの起動待ち画面とhealth自動再試行を実装する。
4. `render.yaml`、CI、README、設計図、運用手順を更新する。
5. AivenへMigrationとSeedを一回だけ適用する。
6. Render Free Web ServiceとSecretsを作成・登録し、Backendをdeployする。
7. Cloudflare Secretを登録し、WorkerとStatic Assetsをdeployする。
8. 公開URLでcold start、Login、Refresh、管理、日別表作成・更新を確認する。

Migration失敗時はRenderをdeployしない。Render healthを確認してからCloudflareの公開先を最終更新し、Frontendだけ表示されAPIが利用不能な時間を短くする。

## 6. テスト方針

- Backend imageのbuild、非root起動、Render動的port
- Backendのtypecheck、lint、unit、integration、build
- proxy共有鍵の一致、未指定拒否、health例外
- Frontendのtypecheck、lint、unit／component test、build
- health初回成功、cold start失敗、自動再試行、同時Loop集約
- Workerのpath境界、Render URL変換、Header偽装防止、共有鍵、起動中503、Cookie透過
- Wrangler deploy dry-run（Worker bundleとVue Assets。Backend imageはRender側で検証）
- Aiven TLS成功と、CA不足・不正時の安全な起動失敗
- 公開URLのhealth、Cookie属性、Origin検証、Refresh rotation
- cold start後もAiven dataが保持されること

公開環境では破壊的Seed、`TRUNCATE`、k6を実行しない。変更系smoke dataはdemo用識別子へ限定する。

## 7. 完了条件

- Cloudflare公開URLからVueが表示される。
- 同一Originの`/api/*`がWorker経由でRender NestJSへ到達する。
- Render URLへ共有鍵なしで業務APIを直接呼ぶと`403`になる。
- Render cold start中に起動待ち画面が表示され、healthを自動再試行して通常画面へ進む。
- Login、Refresh、管理画面、日別表の作成・更新が成功する。
- Render停止・再起動後もAiven dataが保持される。
- DB password、JWT鍵、TLS CA、proxy共有鍵がGit、image、chat、logへ含まれない。
- Migration成功後だけBackendを更新する手順が確認できる。
- Cloudflare・Render・Aivenの無料枠と停止条件がREADME／運用手順に記載される。
- 主要品質checkと公開smoke確認が成功する。

## 8. 理解チェック

実装と動作確認後に次を自分の言葉で説明する。

1. Static Assets、Worker、Render、Aivenはそれぞれ何を担当するか。
2. Workerを公開OriginにするとRefresh Cookieを同一Originで維持できる理由は何か。
3. Render URLが公開されていてもproxy共有鍵を要求する理由は何か。
4. Render cold start中にhealthだけを自動再試行し、業務POSTを無条件再送しない理由は何か。
5. MigrationをRender起動から分離する理由は何か。
6. Cloudflare・Render・Aiven公開環境とAWS実務構成検証環境を分ける理由は何か。

## 9. 実施状況（2026-08-23）

- Aiven MySQL 8.4 Free `fieldflow-mysql`を作成し、TLS接続でMigration 2件と初期Seedを適用済み。
- Render Free Web Service `fieldflow-api`をSingaporeへ作成し、Docker build、環境変数、health check、Aiven接続を確認済み。
- Cloudflare Worker `fieldflow`へVue Static Assetsと`/api/*` proxyをデプロイ済み。
- 公開URLは`https://fieldflow.fieldflow-portfolio.workers.dev`。
- `/`と`/tools`は200、Worker経由`/api/health`は200、認証なし業務APIは401、Render直業務APIは403を確認済み。
- 残作業は、初期管理者の初回パスワード変更、Login／Refresh／Logout、管理画面、日別表、実コールドスタート表示、Aivenデータ保持の利用者操作smoke確認。
