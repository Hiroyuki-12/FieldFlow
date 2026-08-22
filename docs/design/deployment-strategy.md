# デプロイ環境の使い分け

## 1. 目的

FieldFlowは、同じVue・NestJS・TypeORM・MySQL 8.4のアプリケーションを、用途の異なる二つの公開環境へデプロイする。

- コンテスト・ポートフォリオでは、低アクセスでも長期間公開しやすい費用構成を優先する。
- AIエンジニアコース中級編の課題では、AWSの主要サービスとTerraformを組み合わせた実務構成を実装・説明する。

公開先を分ける理由は、AWSを避けるためではない。利用目的、必要な可用性、学習内容、継続費用が異なるため、同じアプリケーションへ異なるデプロイ戦略を適用する。

## 2. 環境一覧

| 環境 | 主な目的 | Frontend / 入口 | Backend | DB | 稼働方針 |
| --- | --- | --- | --- | --- | --- |
| ローカル開発 | 実装・手動確認 | Vite `5173` | NestJS `8080` | Docker Compose MySQL 8.4 | 開発者が必要時に起動 |
| CI | 自動回帰検証 | Vite build / Playwright | buildしたNestJS | Service MySQL / Testcontainers MySQL 8.4 | Workflowごとに作成・破棄 |
| Cloudflare公開 | コンテスト審査・長期ポートフォリオ | Workers Static Assets + Worker | Cloudflare Containers | Aiven for MySQL 8.4 | URLは公開し、Containerは低アクセス時にスリープ |
| AWS課題提出 | 中級編課題・実務構成検証 | CloudFront + S3 | ALB + ECS Fargate | RDS MySQL 8.4 | 課題提出・検証期間に構築し、終了後は費用を確認して停止・削除 |

Cloudflare公開環境とAWS課題提出環境は、どちらもBackendの`NODE_ENV=production`を使用する。`production`はNode.jsの実行モードを表し、デプロイ先を識別する名前としては使用しない。

## 3. 共通に維持する設計

- Vueは`VITE_API_BASE_URL=/api/v1`を使用し、画面とAPIを同一オリジンから公開する。
- NestJSはport `8080`で待ち受け、同じController、Service、Guard、Filter、ログ設計を使用する。
- DBはMySQL 8.4とし、TypeORMの`synchronize`を全環境で無効にする。
- スキーマ変更はレビュー済みMigrationだけで適用する。
- パスワードはArgon2id、認証はJWT Access TokenとローテーションするRefresh Tokenを使用する。
- DBパスワード、JWT鍵、Cookie、Token、接続証明書をGit、ログ、Artifactへ含めない。
- 公開環境へk6の負荷試験を直接実行せず、専用の隔離環境で測定する。

## 4. 環境ごとに変わる設計

| 関心事 | Cloudflare公開環境 | AWS課題提出環境 |
| --- | --- | --- |
| 秘密値 | Cloudflare SecretsからContainerへ注入 | SSM SecureStringからECSへ注入 |
| DB通信 | AivenへTLSで接続 | Security Group内でRDSへ接続 |
| Migration | 承認付きの一回限り処理でAivenへ適用 | 新イメージの一回限りECSタスクでRDSへ適用 |
| ログ | Workers / Containers LogsとAivenメトリクス | CloudWatch LogsとAWSメトリクス |
| スケール | 最大Instance数を制限し、アイドル時にスリープ | ECS desired count 1を維持 |
| 復旧 | Aivenバックアップと再デプロイ | RDSバックアップとECS再デプロイ |
| IaC | Wrangler設定をGit管理し、秘密値は除外 | TerraformをGit管理し、stateと秘密値は除外 |

## 5. デプロイ順序

どちらの環境でも、アプリ起動時にMigrationを自動実行しない。複数Instanceの同時起動や再起動のたびにDDLが競合する事故を防ぐため、次の順序を守る。

1. CIでFrontend・Backend・E2Eを検証する。
2. デプロイ対象のイメージまたは成果物を固定する。
3. 同じBackendコードのMigrationを一回だけ実行する。
4. Migration成功後だけBackendを更新する。
5. health API、ログイン、日別表取得・更新をスモーク確認する。
6. Frontendを更新し、公開URLから最終確認する。

初回Seedも通常のアプリ起動から分離する。公開デモ用認証情報をREADMEへ掲載する場合は、第三者が管理データを変更できる影響を説明し、長期公開前にデモデータ保護または初期化方法を追加する。

## 6. 費用方針

- Cloudflare公開環境は長期公開を前提とし、Containerの最大Instance数とスリープ時間を制限する。ContainersにはWorkers Paidプランが必要であり、2026年8月時点では月額5 USDの基本料金を予算に含める。
- Aivenは無料枠から開始する。2026年8月時点の1 GB disk、最大76接続、休止条件、SLA対象外という制限を実装時と定期運用時に再確認する。
- Workers Paidの5 USDは課金上限ではないため、Container、Durable Objects、ログ、通信量の利用量も確認する。
- AWS課題提出環境はTerraform planで作成対象を確認し、AWS Budgetsも設定する。
- AWS環境は審査・課題レビューに必要な期間を確認してから停止・削除する。URLが必要な期間に独断で破棄しない。
- 料金・無料枠は変更されるため、金額をコード上の保証値として扱わない。

## 7. 関連資料

- [Cloudflare・Aiven構成](cloudflare-architecture.md)
- [AWS・Terraform構成](aws-architecture.md)
- [アプリケーション構成・技術スタック](application-architecture.md)
- [DB設計・ER図](database.md)
- [セキュリティ設計](security.md)
- [ログ・監視・バックアップ](operations.md)
- [CI/CD設計](ci-cd.md)
