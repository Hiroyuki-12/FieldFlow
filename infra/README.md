# FieldFlow AWS検証環境

RaiseTimeLineで学んだ構成をFieldFlow向けに置き換えたTerraformである。長期公開先を置き換えるものではなく、AWSのNetwork、Container、Managed DB、監視、IaC、OIDC CDを検証する期間限定環境として使う。

## 構成と費用方針

```text
利用者 ─HTTPS→ CloudFront ─→ private S3 (Vue)
                    └HTTP /api/* + 秘密ヘッダー→ ALB ─8080→ ECS Fargate ─3306/TLS→ private RDS MySQL
                                      ├→ ECR
                                      ├→ SSM / Secrets Manager
                                      └→ CloudWatch Logs
```

- NAT Gateway、Multi-AZ RDS、ECS複数Task、Auto Scaling、WAF、独自domainは作らない。
- ECSは初回`desired_count=0`で作り、承認付きCDがMigrationとSeedに成功した後だけ1 Taskへ更新する。
- RDSは東京Regionで提供状況を確認したMySQL 8.4.11、`db.t4g.micro`、Single-AZ、gp3 20GiBを既定とする。
- ALB、RDS、Fargate、public IPv4は主な継続課金源である。RaiseTimeLineと同じ短期検証として、検証期間を先に決め、終了後は承認を得てdestroyする。
- `enable_container_insights=false`の初回構築では追加metrics課金を発生させない。費用はBilling画面とCost Explorerで手動確認する。
- RDS最終snapshotは自動作成しない。必要な場合だけdestroy前に手動作成し、snapshot保管費用も確認する。

実際の料金はAccountの無料利用枠や実行時間で変わる。2026-09-10のAWS Price Listでは、730時間常時稼働時のRDS instanceが約18.25 USD、ALB固定分が約17.74 USD、Fargate 0.25vCPU/0.5GBが約11.25 USDである。これだけで約47.24 USDであり、さらにALB LCU、public IPv4、20GB gp3、CloudWatch、通信量等が加わる。常設せず、`terraform plan`確定後にAWS Pricing Calculatorで再見積りし、検証期間を決めてからapplyする。

## ファイル

| ファイル | 責務 |
| --- | --- |
| `bootstrap/` | versioning・暗号化・S3 native lockを使うremote state bucket |
| `network.tf` / `security_groups.tf` | 2AZ subnetとALB→ECS→RDSだけを許可する通信経路 |
| `s3_frontend.tf` / `cloudfront.tf` | private Vue配信、OAC、SPA rewrite、`/api/*` routing |
| `alb.tf` / `ecs.tf` / `ecr.tf` | 403既定listener、Fargate、immutable commit image |
| `rds.tf` / `ssm.tf` | Private MySQL、DB・JWT・Origin・初期passwordのSecureString |
| `iam.tf` | ECS Execution/Task Role、GitHub OIDC deploy Role |
| `ecs.tf` | ECS標準出力を保持30日のCloudWatch Logsへ送る |

## 1. 事前確認

以下は読み取りだけである。AccountとRegionが想定どおりでなければ進めない。

```bash
aws sts get-caller-identity
aws configure get region
```

`terraform.tfvars.example`を`terraform.tfvars`へコピーする。`terraform.tfvars`、`backend.hcl`、state、plan fileはGit管理しない。

## 2. remote state bootstrap

bootstrap自体だけはlocal stateから開始する。次の`apply`もAWS resourceを作るため、事前承認が必要である。

```bash
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap plan
terraform -chdir=infra/bootstrap apply
terraform -chdir=infra/bootstrap output -raw state_bucket_name
```

出力を`backend.hcl.example`へ反映した`backend.hcl`を作り、main stateを初期化する。

```bash
terraform -chdir=infra init -backend-config=backend.hcl
```

Terraform 1.10以降のS3 native lock (`use_lockfile`) を使用するため、RaiseTimeLineの旧構成にあったDynamoDB lock tableは増やさない。

## 3. 検証とplan

`fmt`、`validate`、`plan`はresourceを作らない。planには機微なstate差分が含まれ得るためArtifactやGitへ保存しない。

```bash
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra validate
terraform -chdir=infra plan
```

planでは、意図しないNAT Gateway、Multi-AZ、2台以上のTask、公開RDSがないこと、月額課金源の件数を確認する。

## 4. apply後の設定

`terraform apply`は課金を開始するため、plan、費用見積り、検証終了日、rollbackを提示して承認後だけ実行する。完了後は`terraform output`の値をGitHub Environment `aws-validation`のVariablesへ登録する。

| GitHub Variable | Terraform output |
| --- | --- |
| `AWS_REGION` | `ap-northeast-1` |
| `AWS_DEPLOY_ROLE_ARN` | `github_deploy_role_arn` |
| `AWS_ECR_REPOSITORY` | `ecr_repository_name` |
| `AWS_ECS_CLUSTER` | `ecs_cluster_name` |
| `AWS_ECS_SERVICE` | `ecs_service_name` |
| `AWS_ECS_TASK_FAMILY` | `ecs_task_family` |
| `AWS_ECS_SEED_TASK_FAMILY` | `ecs_seed_task_family` |
| `AWS_FRONTEND_BUCKET` | `frontend_bucket_name` |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | `cloudfront_distribution_id` |
| `AWS_CLOUDFRONT_URL` | `cloudfront_url` |

Environmentにはrequired reviewerを設定する。固定AWS Access KeyはSecretsへ登録しない。

2026-09-12のユーザー判断により、RaiseTimeLineと同様にAWS Budgets・SNS・CloudWatch Alarmは作成しない。費用はBilling画面とCost Explorerで手動確認し、動画撮影後すぐにdestroyする。

初回deploy後、初期管理者passwordは必要な担当者だけが次のように一度確認し、初回loginですぐ変更する。値をshell履歴、log、issue、PRへ貼らない。

```bash
aws ssm get-parameter --name /fieldflow-validation/seed/initial-admin-password --with-decryption --query Parameter.Value --output text
```

## 5. CDと確認

`AWS Validation Deploy`を`main`から手動実行し、入力へ`DEPLOY`を指定する。Environment承認後だけOIDC Roleを取得し、次の順で進む。

1. commit SHAのimmutable Backend imageをECRへpushする。
2. 同じimageで一回限りMigration Taskを実行する。
3. Migration成功後、冪等な初期Seed Taskを実行する。
4. 両方のexit codeが0の場合だけECS Serviceを更新する。
5. Service安定後にVueをS3へ同期し、CloudFrontをinvalidateする。
6. CloudFront URLのhealthを確認する。

追加の手動smokeでは、CloudFrontからlogin、refresh、ユーザー管理、日別表を確認する。ALB URLは`/api/health`を含め403、RDSはpublic access不可であることを確認する。request IDでCloudWatch Logsを検索し、password、token、Cookie、SSM値が出ていないことも確認する。

## 6. 障害・rollback・復旧

- Migration/Seed失敗: workflowはServiceを更新しない。CloudWatch Logsの該当Task streamを確認する。
- Backend障害: 直前の正常なTask Definition revisionを指定してServiceを戻す。
- Frontend障害: versioning済みS3 objectを復元し、CloudFrontをinvalidateする。
- DB障害: 7日間の自動backupから別RDSへ復元し、既存DBを上書きせず確認する。

AWS resourceの更新、Task停止、rollback、復元も実環境変更なので実行前承認を得る。

## 7. 検証終了と費用停止

CloudWatch Logs、構成図、テスト結果、必要なら手動RDS snapshotを保存する。次に削除対象を`terraform plan -destroy`で確認し、承認後だけ`terraform destroy`する。期間限定環境のFrontend S3とECRは、承認済みdestroy時にobject versionとimageもまとめて削除する。

main resourceの削除と残存課金源ゼロを確認した後、state bucket内のstate・lock・全versionを確認して空にし、bootstrap bucketも削除する。state bucketには`prevent_destroy`があるため、対象Account・bucket名・main destroy完了を再確認したうえで、最後の独立した削除手順として扱う。
