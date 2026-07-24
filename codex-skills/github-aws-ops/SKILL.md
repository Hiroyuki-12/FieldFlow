---
name: github-aws-ops
description: FieldFlow で Codex が GitHub CLI、AWS CLI、Terraform を使って Issue / PR / CI / AWS / IaC を確認・操作するときの手順。Claude Code の allow / deny 設定を Codex 向け運用ルールとして移植したもの。
---

# GitHub / AWS Ops (FieldFlow)

## 目的

FieldFlow で Codex が `gh`、`aws`、`terraform` を使うときの標準手順を定める。
Claude Code の `.claude/settings.json` は Codex では直接効かないため、この skill と `AGENTS.md` を判断基準にする。

## 基本方針

- 実行前に「何を確認するためのコマンドか」を説明する。
- リモートや AWS 実環境を変更する操作は、実行前にユーザーの明示承認を得る。
- RaiseTimeLine 固有の URL、AWS リソース名、デモユーザー情報は FieldFlow に持ち込まない。
- 機密情報、Terraform state、`*.tfvars`、認証トークンをコミット対象にしない。

## GitHub 操作

作業開始時は、必要に応じて以下で接続先と認証状態を確認する。

```bash
gh auth status
gh repo view
gh issue list
gh pr list
```

CI や PR 調査では以下を使用してよい。

```bash
gh run list
gh run view <run-id>
gh pr view <number>
gh api <endpoint>
```

PR 作成、push、マージに関わる操作は、ユーザー承認後に実行する。

## AWS 操作

AWS 操作前は、必ず現在のアカウントとリージョン前提を確認する。

```bash
aws sts get-caller-identity
aws configure get region
```

状態確認やログ調査では以下を使用してよい。

```bash
aws ecs list-clusters
aws ecs list-services --cluster <cluster-name>
aws ecs describe-services --cluster <cluster-name> --services <service-name>
aws ecs list-tasks --cluster <cluster-name>
aws logs describe-log-groups
aws logs tail <log-group-name>
aws ecr describe-repositories
aws rds describe-db-instances
aws elbv2 describe-load-balancers
aws ec2 describe-vpcs
aws s3api list-buckets
```

AWS リソースを作成・更新・削除する操作は、目的、対象、影響範囲、戻し方を説明してからユーザー承認を得る。

## Terraform 操作

Terraform は原則 `infra/` 配下で実行する。

```bash
cd infra
terraform fmt
terraform init
terraform validate
terraform plan
```

`terraform apply` と `terraform destroy` は、差分内容を説明し、ユーザーの明示承認を得てから実行する。
`terraform state *` は状態確認に使ってよいが、state の削除・移動・書き換えは承認なしで行わない。

## ログ調査の順序

AWS 上の障害調査では、原因を絞りやすい順に確認する。

1. CloudFront / ALB の HTTP ステータスや到達性
2. ECS service / task の起動状態
3. CloudWatch Logs のアプリケーションログ
4. RDS / S3 / ECR / Security Group など依存リソース

## 禁止コマンド

以下は、ユーザーが具体的にその操作を明示した場合を除き使用しない。

- `rm`, `rmdir`, `sudo`, `chmod`, `chown`
- `git reset --hard`, `git clean`, `git checkout --`, `git restore`
- `git push --force`, `git branch -D`, `git tag -d`, `git rebase`, `git commit --amend`

削除や巻き戻しが必要に見える場合でも、まず状況を確認し、ユーザーへ選択肢を示す。
