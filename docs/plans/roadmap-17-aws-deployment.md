# ロードマップ17 AWS課題提出環境 実装計画

## 1. 目的

AIエンジニアコース中級編の課題として、FieldFlowをS3、CloudFront、ALB、ECS Fargate、RDS MySQLへデプロイし、Terraformと承認付きCDで再現できる状態を作る。

コンテスト・転職用ポートフォリオの長期公開はロードマップ16のCloudflare・Aiven環境が担当する。AWS環境はAWSのネットワーク、コンテナ、マネージドDB、監視、IaCを学習・説明するための別環境とし、課題レビュー期間と費用を確認して運用する。

実装開始時にロードマップ17専用Issueを起票する。RaiseTimeLineのTerraform・AWS構成は設計判断と実装手順の参考にするが、FieldFlowの名前、port、health、Secrets、MySQL 8.4、現在のAWS仕様に合わせて差分を確認する。

## 2. 前提

- ロードマップ16までのアプリケーション、Migration、Container、公開スモーク確認が完了している。
- AWS CLIで対象AccountとRegionを確認する。
- Terraformの`fmt`、`validate`、`plan`までは読み取り中心に進め、`apply`、サービス更新、停止、`destroy`は対象・費用・影響を説明してユーザー承認後に行う。
- RDSのMySQL 8.4対応、利用可能Instance class、AWS料金、無料枠条件は実装時に公式情報で再確認する。

## 3. 実装範囲

### Terraform・Network

- VPC、Public / Private Subnet、Route Table、Security Group
- S3、CloudFront、ALB、ECR、ECS Cluster・Task Definition・Service
- RDS MySQL 8.4、SSM Parameter Store、CloudWatch Logs、AWS Budgets
- 環境別変数、共通Tag、remote state方針

### Frontend・Backend

- Vue build成果物のS3配置とCloudFront配信
- `/api/*`のCloudFront→ALB→ECSルーティング
- NestJS Containerのport `8080`とhealth check
- CloudFrontからALBへのOrigin検証、HTTPS、Cookie、CORS、`TRUST_PROXY_HOPS=2`
- ECS Task RoleとExecution Roleの最小権限化

### DB・Migration

- RDS MySQL 8.4へのTLS・Security Group内接続
- SSM SecureStringからDB・JWT等の秘密値を注入
- 新Backend imageを使う一回限りECS TaskでMigration実行
- Migration成功後だけECS Serviceを更新
- RDS自動バックアップと復旧手順

### CI/CD・運用

- GitHub Actions OIDCと最小権限Deploy Role
- commit SHAでBackend imageを識別
- `aws-course` GitHub Environmentの承認付きデプロイ
- CloudWatch Logs、ALB・ECS・RDS監視、費用通知
- Terraform plan、構成図、公開確認、課題提出用の説明資料

## 4. 対象外

- Cloudflare・Aiven環境の置き換えまたは停止
- Multi-AZ、ECS複数Task、Auto Scaling、WAF、独自ドメイン
- AWS公開DBへE2E Seedやk6を直接実行すること
- 課題レビュー期間を確認しない自動`destroy`

## 5. 実装順序

1. RaiseTimeLineとFieldFlowの差分、対象AWS Account・Region、予算を確認する。
2. Terraform moduleと変数を作成し、`fmt`、`validate`、`plan`で構成を確認する。
3. 承認後にNetwork、RDS、ECR、ECS、ALB、S3、CloudFrontを段階的に作成する。
4. Backend imageをECRへ登録し、一回限りECS TaskでMigrationと必要な初期Seedを実行する。
5. Migration成功後にECS Serviceを更新し、ALB healthとAPIを確認する。
6. FrontendをS3へ配置し、CloudFrontの同一オリジンから画面・API・認証を確認する。
7. CloudWatch、Budgets、バックアップ、CD、復旧手順を確認する。
8. 課題提出に必要なURL、構成図、Terraform plan、テスト・ログ証跡を整理する。
9. レビュー終了後、保存すべき証跡とSnapshotを確認し、ユーザー承認後に停止・削除する。

## 6. テスト方針

- Terraform `fmt -check`、`validate`、レビュー可能な`plan`
- Container buildとECR imageのcommit SHA確認
- 一回限りMigration Taskの成功・失敗時のService非更新
- CloudFront URLからVue、health、ログイン、Refresh、主要業務APIを確認
- ALB直アクセス拒否、Security Group、SSM秘密値非出力の確認
- CloudWatch LogsをrequestIdで追跡
- RDS backup・復旧手順とAWS Budgets通知の確認

## 7. 完了条件

- TerraformからAWS構成を再現できる。
- CloudFrontの単一URLからFrontendと`/api/*`へ到達できる。
- ECS FargateからRDS MySQL 8.4へ安全に接続し、主要操作が成功する。
- Migration成功後だけServiceが更新される。
- 秘密値がGit、Terraform stateの公開箇所、image、ログ、Artifactへ含まれない。
- CloudWatchとrequestIdで障害経路を説明できる。
- 月額費用の発生源、AWSを学習用に分離した理由、停止・再構築手順を説明できる。

## 8. 理解チェック

1. CloudFront、S3、ALB、ECS、RDSはどの順番でつながり、何を担当するか。
2. ECS TaskとContainer、ECR imageの関係は何か。
3. RDSをPrivate Subnetへ置き、Security Groupを分ける理由は何か。
4. Migrationを一回限りECS Taskで先に実行する理由は何か。
5. OIDC、IAM Role、SSM SecureStringはどの秘密情報・権限事故を防ぐか。
6. AWSを長期ポートフォリオの既定公開先にせず、Cloudflare環境と分ける理由は何か。

## 9. 関連資料

- [デプロイ環境の使い分け](../design/deployment-strategy.md)
- [AWS・Terraform課題提出構成](../design/aws-architecture.md)
- [CI/CD設計](../design/ci-cd.md)
- [セキュリティ設計](../design/security.md)
- [ログ・監視・バックアップ設計](../design/operations.md)
