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

### 認証経路を混同しない

FieldFlowのGitHub操作には、互いに独立した次の3経路がある。

| 経路 | 主な用途 | 確認方法 |
| --- | --- | --- |
| local Git | commit、fetch、push | `git ls-remote`と`git push --dry-run` |
| GitHubコネクタ | Issue・PRの参照／作成 | コネクタで対象Repositoryを読み取る |
| GitHub CLI `gh` | Actionsログなど`gh`固有操作 | `gh auth status` |

`gh auth status`の失敗はGitHub CLIのTokenが無効という意味であり、local Gitの認証やGitHubコネクタの認証失敗を意味しない。これだけを理由にpush・PR作成を中断したり、ユーザーへ`gh auth login`を依頼したりしない。

### push・PR作成前の確認順序

pushとPR作成では、必ず次の順序で確認する。

1. `git remote get-url origin`と`git branch --show-current`で対象を確定する。
2. `git ls-remote --heads origin`でリモートへの到達と読み取りを確認する。公開Repositoryでは認証なしでも成功するため、push認証の成功とは判断しない。
3. push前に書き込み認証だけを確認する必要がある場合は、`git push --dry-run origin HEAD:<branch-name>`を使う。dry-runなのでリモートを変更しない。
4. 3が成功したら、`gh auth status`が失敗していてもlocal Gitでcommit・pushを続行する。
5. push後はGitHubコネクタでPRを作成する。
6. GitHubコネクタが利用できない場合だけ、`gh auth status`を確認して`gh pr create`をフォールバックに使う。
7. local Gitの到達確認またはdry-runが失敗した場合は、そのエラーをGitHub CLIやコネクタの失敗と決めつけず、ネットワーク・HTTPS認証・SSH認証・Credential Helperのどこで失敗したかを切り分ける。
8. 必要な経路がすべて利用不能で、安全な代替手段もない場合だけ作業を止め、失敗した経路と再認証が必要な対象を具体的にユーザーへ伝える。

成功例:

```bash
git ls-remote --heads origin
git push --dry-run origin HEAD:<branch-name>
# dry-run成功: local Gitでpush可能。ghが無効でもGitHubコネクタでPRを作成できる。
```

GitHub CLI固有の操作が必要な場合だけ、次を確認する。

```bash
gh auth status
gh run list
gh run view <run-id>
gh pr view <number>
gh api <endpoint>
```

認証TokenやCredentialを確認目的で標準出力へ出さない。`gh auth token`の結果、Credential Helperの保存値、コネクタTokenをログ・会話・ファイルへ記録しない。

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
