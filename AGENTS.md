# FieldFlow Codex 運用ルール

このリポジトリで Codex と人間の開発者が作業するときの運用ルール。
RaiseTimeLine の `CLAUDE.md` と `.claude/skills` を元に、Codex 向けに移植したもの。

## プロジェクトの目的

FieldFlow は、過去に作成した道具管理アプリ `tool-management` / `tool-management-frontend` を題材に、
AI エンジニアコース中級編の最終課題としてブラッシュアップする新アプリ。

中級編で学んだ技術を統合して活用することを目的とする。

- 認証・認可
- 単体テスト / 統合テスト
- E2E テスト
- パフォーマンステスト
- ログ設計
- CI/CD
- AWS 構成
- ECS Fargate など、より実務寄りのアーキテクチャ

単にアプリを完成させるだけでなく、ユーザー本人が「何を作っているか」「なぜその設計にしたか」
「各技術がどこで使われているか」を説明できる状態を目指す。

## 参照元アプリ

旧アプリは FieldFlow の直接のベースとして参照する。

- バックエンド: `/Users/ohtsukahiroyuki/Desktop/01_developProject/tool-management`
- フロントエンド: `/Users/ohtsukahiroyuki/Desktop/01_developProject/tool-management-frontend`

旧アプリの概要:

- 現場作業前の道具忘れや紙チェックミスを減らすための道具管理アプリ。
- 主な機能はログイン、道具一覧、道具追加、削除、数量増減、チェック状態の管理。
- バックエンドは Spring Boot / Java / MySQL / Spring Security。
- フロントエンドは Next.js / React / TypeScript / Tailwind CSS。
- 現状は API URL や CORS が EC2 固定 IP に直書きされているため、FieldFlow では環境変数化や構成整理を検討する。

## FieldFlow の確定技術構成

- フロントエンド: Vue 3 + TypeScript + Vite + Tailwind CSS
- バックエンド: NestJS + TypeScript
- DB アクセス: TypeORM（Migration 必須、`synchronize` 禁止）
- DB: MySQL 8.4 LTS
- 認証: JWT Access Token + ローテーションする Refresh Token、Argon2id
- テスト: Vitest / Jest / Testcontainers MySQL / Playwright / k6
- AWS: CloudFront + S3 + ALB + ECS Fargate + RDS MySQL

詳細なバージョンと設計判断は `docs/design/application-architecture.md` を参照する。

## 学習しながら開発するルール

このプロジェクトでは、Codex が実装を進めるだけでなく、ユーザーの理解確認を挟みながら進める。
会話履歴が圧縮された場合でも、このルールを最優先で思い出すこと。

### 基本方針

- 実装前に、Codex はこれから作る機能・設計・技術選定を説明する。
- 説明後、必要に応じてユーザーに「自分の言葉でのアウトプット」を求める。
- Codex はユーザーの説明を採点し、理解度と補強ポイントを返す。
- 目安として理解度が 60% 程度あれば、次の実装ステップに進む。
- 60% に届かない場合は、実装を急がず、短い補足説明と再アウトプットを行う。

### 理解チェックの形式

Codex は各主要ステップで、次のような確認を出す。

```text
今回の設計について、自分の言葉で説明してください。

1. 何を実現する機能か
2. なぜその技術や構成を選んだか
3. フロントエンド、バックエンド、DB、AWS のどこに関係するか
4. 注意すべきセキュリティ・テスト・運用上のポイントは何か
```

ユーザーの回答に対して、Codex は以下の形式で返す。

```text
理解度: 65%

良い点:
- ...

補強したい点:
- ...

次に進めるか:
- 進める / もう一度整理する
```

### 理解チェックを必ず挟む場面

- 要件定義がまとまったとき
- 全体アーキテクチャを決めるとき
- 認証・認可を実装する前後
- DB 設計を決めるとき
- 主要 API を実装する前後
- テスト方針を決めるとき
- CI/CD を作るとき
- ログ設計を入れるとき
- E2E テストやパフォーマンステストを導入するとき
- AWS / ECS Fargate / RDS / S3 / CloudFront / ALB などのインフラを設計・実装するとき

### Codex の振る舞い

- ユーザーが理解したいと言っている場面では、実装だけを先に進めない。
- 説明は難しすぎる言葉に逃げず、初級編から中級編へ橋渡しする粒度で行う。
- ただし、内容を薄めすぎず、提出課題で説明できる技術用語はきちんと使う。
- 実装後は「何を変更したか」だけでなく「なぜその変更が必要だったか」を説明する。
- 最終的に README / 設計書 / アーキテクチャ説明として再利用できる形で要点を残す。

## 大原則

- `main` に直接 push しない。常に Issue -> ブランチ -> PR -> マージ の順で進める。
- 作業開始前に該当 Issue を確認し、なければ Issue を起票してからコードを書く。
- 1 Issue = 1 ブランチ = 1 PR を基本とする。
- ユーザーが「ローカルだけでよい」「Issue/PR は不要」と明示した場合のみ、その指示を優先する。

## ブランチ命名規則

形式: `<type>/#<issue>-<slug>`

例:

- `feat/#12-add-login-form`
- `fix/#34-post-delete-500`
- `docs/#7-update-readme`

| type | 用途 |
| --- | --- |
| `feat` | 新機能追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみの変更 |
| `refactor` | 振る舞いを変えないリファクタ |
| `chore` | ビルド・依存・設定など雑務 |
| `test` | テスト追加・修正 |

- `#<issue>` は紐づく Issue 番号。
- `<slug>` は半角英小文字 + ハイフンの短い説明。

## Pull Request 規約

- PR 本文に `Closes #<issue>` を含める。
- PR 上のレビューコメント / 会話は全解決してからマージする。
- マージ方式は squash または rebase を基本とする。
- `main` への直接コミット / push は行わない。

## ポート運用ルール

FieldFlow の確定技術構成（Vue + NestJS + MySQL）では、次のポートを標準とする。

| サービス | ポート |
| --- | --- |
| フロントエンド (Vite dev server) | `5173` |
| バックエンド (NestJS) | `8080` |
| MySQL | `3306` |

サーバー起動時にポートが競合していた場合:

1. `lsof -i :<port>` で占有プロセスを特定する。
2. そのプロセスを停止する。例: `kill <PID>` / `docker stop <container>`
3. 本来のポートで起動し直す。

禁止事項:

- `--port 5174` などで別ポートに逃げる。
- `PORT` や `compose.yaml` のポートを一時的に書き換える。
- ポート競合を放置したまま「動作確認できなかった」と報告する。

ユーザーが明示的に別ポートを指示した場合のみ、その指示に従う。

## コードコメントルール

このプロジェクトのコードには、未経験者でも読んで理解できる日本語コメントを必要十分に記載する。
数週間・数か月後に見返したときも、コードとコメントから当時の設計判断を短時間で思い出せる状態を目指す。

- クラス・メソッド・設定ブロックには、責務、処理全体での位置づけ、主な呼び出し元が分かるコメントを書く。
- 「何をしているか」だけでなく「なぜそうしているか」「何の事故を防ぐか」も説明する。
- 複数段階の処理には、入口、重要な判断、永続化、終了処理が追える区切りコメントを書く。
- Entityには、保存対象、マスター／履歴の区別、Relation、主な制約、物理削除しない理由を記載する。
- Migrationには、テーブルの作成順、外部キー、一意制約、CHECK制約、rollback順の理由を記載する。
- テストには、成功を確認するだけでなく、どの不具合やデータ破損を防ぐ回帰テストかを記載する。
- セキュリティに関わる実装は、理由を必ずコメントで補足する。
- コード変更時は周辺コメントも見直し、現在の実装と食い違う古い説明を残さない。
- 自明な代入や処理には冗長なコメントを書かず、理解の助けになる箇所に集中する。

例:

```typescript
// パスワードはArgon2idでハッシュ化する。平文保存を避け、DB漏洩時の悪用を難しくするため。
const passwordHash = await argon2.hash(password, argon2Options);
```

## 品質チェックコマンド

コードを書いたら以下を実行してエラーを確認する。
まだ該当ディレクトリやコマンドが存在しない初期段階では、作成済み範囲に対応するチェックを実行する。

| 対象 | コマンド | 内容 |
| --- | --- | --- |
| フロントエンド 型チェック | `cd frontend && npm run typecheck` | Vue / TypeScript 型エラーの検出 |
| フロントエンド lint | `cd frontend && npm run lint` | ESLint ルール違反の検出 |
| フロントエンド テスト | `cd frontend && npm test -- --run` | Vitest によるユニット / 統合テスト |
| フロントエンド ビルド | `cd frontend && npm run build` | Vite 本番ビルドの確認 |
| バックエンド 型チェック | `cd backend && npm run typecheck` | NestJS / TypeScript 型エラーの検出 |
| バックエンド lint | `cd backend && npm run lint` | ESLint / Prettier 違反の検出 |
| バックエンド 単体テスト | `cd backend && npm test` | Jest による Service / Guard 等のテスト |
| バックエンド 結合テスト | `cd backend && npm run test:integration` | Testcontainers MySQL による API / DB テスト |
| バックエンド ビルド | `cd backend && npm run build` | NestJS のコンパイル確認 |

## テスト運用ルール

実装と同じ PR にテストも含める。

| 追加・変更した本番コード | 同じ PR に追加すべきテスト |
| --- | --- |
| Backend Service | `*.service.spec.ts` |
| Backend Controller / Guard | `*.controller.spec.ts` / `*.guard.spec.ts` |
| Backend Entity / Migration / DB制約 | `test/integration/*.spec.ts` |
| Frontend API クライアント | `src/api/*.test.ts` |
| Frontend コンポーネント | `src/components/*.test.ts` |
| Frontend 画面 | `src/views/*.test.ts` |

リファクタリングや設定だけの変更など、テスト省略が妥当な場合は理由を明記する。

## Codex 作業フロー

ユーザーから実装を依頼されたときは、原則として以下の流れで進める。

1. 該当 Issue を確認し、なければ起票する。
2. 命名規則に従ってブランチを切る。
3. 実装する。
4. 品質チェックを実施し、エラーがあれば修正する。
5. 必要に応じてサーバーを起動し、実際の API や画面で動作確認する。
6. 実装内容と確認結果をユーザーへ報告する。
7. ユーザー承認後にコミット、push、PR 作成を行う。

## Codex での GitHub / AWS / Terraform 操作ルール

RaiseTimeLine の `.claude/settings.json` にあった allow / deny は Claude Code 固有の設定であり、
Codex ではそのまま効かない。FieldFlow では、Codex の sandbox / approval ルールと、この運用ルールに従う。

### 使用してよい主なコマンド

必要な作業内容を説明したうえで、以下のコマンドを使用してよい。

| 用途 | コマンド例 | 目的 |
| --- | --- | --- |
| GitHub Issue / PR | `gh issue *`, `gh pr *` | Issue 確認、PR 確認、PR 作成 |
| GitHub Actions | `gh run *`, `gh api *` | CI 状態確認、Actions ログ調査 |
| AWS 認証確認 | `aws sts *` | 操作対象アカウントの確認 |
| AWS ECS / ECR | `aws ecs *`, `aws ecr *` | ECS サービス・タスク・イメージ確認 |
| AWS ログ | `aws logs *` | CloudWatch Logs の確認 |
| AWS ネットワーク / DB / S3 | `aws rds *`, `aws elbv2 *`, `aws ec2 *`, `aws s3api *` | RDS、ALB、VPC、S3 の状態確認 |
| Terraform | `terraform fmt *`, `terraform init *`, `terraform validate *`, `terraform plan *`, `terraform show *`, `terraform state *` | IaC の整形、初期化、検証、差分確認 |

### 明示承認が必要な操作

以下は環境やリモート状態を変更するため、実行前にユーザーへ目的・影響範囲を説明し、明示承認を得る。

- `git push`、PR 作成、PR マージに関わる操作
- `terraform apply`、`terraform destroy`
- AWS リソースを作成・更新・削除する操作
- ECS サービス更新、タスク停止、RDS 変更、S3 オブジェクト削除など、実環境へ影響する操作
- ポート競合解消のためにプロセスや Docker コンテナを停止する操作

### 禁止コマンド

以下は、ユーザーが具体的にその操作を明示した場合を除き、Codex は使用しない。

- ファイル削除・権限変更: `rm`, `rmdir`, `sudo`, `chmod`, `chown`
- Git の破壊的操作: `git reset --hard`, `git clean`, `git checkout --`, `git restore`
- 履歴やリモートを壊しやすい操作: `git push --force`, `git branch -D`, `git tag -d`, `git rebase`, `git commit --amend`

誤操作を避けるため、削除や巻き戻しが必要に見える場面でも、まず現状確認と代替案の説明を行う。

## 移植済み Skill 相当ドキュメント

Claude の `.claude/skills` は、このリポジトリでは `codex-skills/` に移植している。
該当する作業では以下を参照する。

- サーバー起動やポート確認: `codex-skills/server-port-policy/SKILL.md`
- E2E / Playwright: `codex-skills/e2e-test/SKILL.md`
- k6 パフォーマンステスト: `codex-skills/perf-test/SKILL.md`
- GitHub / AWS / Terraform 操作: `codex-skills/github-aws-ops/SKILL.md`

`.claude/settings.json` の許可 / 拒否コマンドは Claude Code 固有の形式のため、そのまま移植しない。
Codex ではこの環境の sandbox / approval ルールと、上記の運用ルールに従う。
