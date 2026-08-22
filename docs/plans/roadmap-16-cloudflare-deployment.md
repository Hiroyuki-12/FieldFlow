# ロードマップ16 Cloudflare・Aiven公開環境 実装計画

## 1. 目的

コンテスト審査と転職用ポートフォリオでFieldFlowを長期公開できるよう、VueとNestJSをCloudflareへ、MySQL 8.4をAivenへデプロイする。AWS課題提出環境とは分離し、低アクセス時の継続費用を抑えながら、公開URLからログインと主要業務操作を確認できる状態を作る。

本計画の設計整理はIssue [#39](https://github.com/Hiroyuki-12/FieldFlow/issues/39)で行う。Cloudflare・Aivenの実装と外部リソース作成は、#39のマージ後に別Issueを起票して実施する。

## 2. 前提

- ロードマップ1〜15のアプリケーション、CI、E2E、性能試験が完了している。
- CloudflareとAivenのアカウントを用意する。
- Cloudflare Containersの有効化や課金開始、Aivenサービス作成は、料金と影響を説明してユーザー承認後に行う。2026年8月時点でContainersには月額5 USDのWorkers Paidプランが必要である。
- 公開前にCloudflare・Aivenの最新料金、無料枠、制限、対応リージョンを公式資料で再確認する。
- Aiven無料枠はSLA対象外で、継続利用がない場合は通知後に停止される可能性がある。コンテスト審査期間は毎日稼働と通知を確認し、停止時に手動再開できるようにする。

## 3. 実装範囲

### Backend

- Node.js 24・NestJS用のマルチステージDockerfileと`.dockerignore`
- 非root実行、port `8080`、health確認
- Aiven MySQL 8.4へ接続するTLS設定と環境変数検証
- 接続pool上限とtimeout
- Containerの外向き通信をAiven hostへ限定し、MySQL TCP接続を確認
- Cloudflare Proxy経路に合わせた送信元IPと`TRUST_PROXY_HOPS`の確認
- Cloudflare向け設定の単体・結合テスト

### Cloudflare

- Wrangler設定とCloudflare用Worker
- Vue `dist`のWorkers Static Assets配信
- `/api/*`から単一Backend Containerへのルーティング
- SPA fallback
- Containerの最大Instance数、Instance type、スリープ時間、CPU上限
- Cloudflare SecretsからContainerへの秘密値注入
- Worker・Containerログと公開health確認

### Aiven・データ

- Aiven for MySQL 8.4サービス
- 無料枠の1 GB disk・最大76接続に収まるデータ量とpool設定
- TLS証明書検証
- TypeORM Migrationの一回限り実行
- 初期管理者と`共通`カテゴリのSeed
- バックアップ、接続数、ストレージ、休止通知の確認
- 公開デモデータの保護または復旧手順

### ドキュメント・公開確認

- READMEへ公開URL、デモアカウント、コールドスタート注意事項を追記
- デプロイ・rollback・秘密値更新・障害調査手順
- 実URLでの主要Playwrightスモーク確認
- 公開環境へ負荷をかけない単発のAPI応答確認
- コンテスト用デモ動画とスクリーンショット

## 4. 対象外

- Cloudflare D1への移行
- AWS、Terraform、ECS Fargate、RDSの実装（ロードマップ17）
- Cloudflare Containerの複数Instance化
- 公開環境へのk6性能試験
- 独自ドメイン、メール通知、MFA

## 5. 実装順序

1. DockerfileとAiven TLS設定を実装し、ローカルContainerから接続確認する。
2. WorkerとStatic AssetsをローカルWrangler環境で確認する。
3. Cloudflare Containerへhealthリクエストを通す。
4. AivenへMigrationとSeedを一回だけ適用する。
5. Cloudflare Secretsを登録し、公開環境へデプロイする。
6. 公開URLでログイン、Refresh、管理、日別表作成・更新を確認する。
7. ログ、Aivenバックアップ、課金上限、コールドスタートを確認する。
8. README、運用手順、デモ動画を仕上げる。

Migration失敗時はContainerを新バージョンへ更新しない。Frontend公開後にAPIだけ失敗する時間を避けるため、Backend healthと主要APIを確認してからFrontendを最終更新する。

## 6. テスト方針

- Docker imageのbuildと非root起動
- Backendのtypecheck、lint、単体、結合、build
- Frontendのtypecheck、lint、テスト、build
- Workerの型チェックとルーティングテスト
- Aiven TLSの成功と、証明書不正・不足時の安全な起動失敗
- Aiven以外への不要な外向き通信が許可されていないこと
- 公開URLのhealth、Cookie属性、Origin検証、Refreshローテーション
- 公開デモ利用者による主要画面のPlaywrightスモーク
- Container再起動後もAivenのデータが残ること

公開環境では破壊的Seed、TRUNCATE、k6を実行しない。テストデータを初期化する場合は、対象をデモ用識別子へ限定し、影響を確認してから実行する。

## 7. 完了条件

- Cloudflareの公開URLからVueが表示される。
- 同一オリジンの`/api/*`でNestJSへ到達できる。
- ログイン、Refresh、管理画面、日別表の作成・更新が成功する。
- Containerのスリープ・再起動後もAivenのデータが保持される。
- DBパスワード、JWT鍵、TLS関連値がGit、image、ログへ含まれない。
- Migration成功後だけ新しいBackendを公開する手順が確認できる。
- コールドスタート、無料枠制限、デモデータ変更時の注意がREADMEに記載される。
- Workers Paidの基本料金と追加課金の可能性、Aiven停止時の再開手順が記録される。
- 主要品質チェックと公開スモーク確認が成功する。

## 8. 理解チェック

実装前後に次を自分の言葉で説明する。

1. Worker、Static Assets、Container、Aivenはそれぞれ何を担当するか。
2. MySQLをContainer内へ保存できない理由は何か。
3. Cloudflare SecretsとAiven TLSは何の事故を防ぐか。
4. MigrationをContainer起動から分離する理由は何か。
5. URLを公開したままContainerをスリープさせる利点と欠点は何か。
6. Cloudflare公開環境とAWS課題提出環境を分ける理由は何か。
