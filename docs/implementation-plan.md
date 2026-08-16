# FieldFlow MVP 実装計画

## 1. 目的

この文書は、操作確認用モックから本番利用を想定したFieldFlow MVPへ段階的に移行するための実装順序を定める。
単に画面を再現するのではなく、要件、API、DB、テスト、運用、AWSの依存関係を守りながら、各段階で説明・検証できる状態を作る。

## 2. 現在地

- MVP要件、機能、画面、API、DB、セキュリティ、テスト、AWSの設計資料は作成済み。
- HTML、CSS、JavaScriptによる操作確認用モックは作成済み。
- Vue、NestJS、Docker Compose MySQLによる開発基盤とhealth APIは実装済み。
- Frontend・BackendのGitHub Actions CI基盤は実装済み。
- TypeORM Entity、初回Migration、初期Seed、Testcontainersによる業務DB基盤は実装済み。
- Backend認証・認可API、Refreshローテーション、共通Guardは実装済み。
- Frontend認証、共通レイアウト、Router Guard、Refresh一重化は実装済み。
- ユーザー管理API・管理画面は実装済み。
- 作業カテゴリ管理API・管理画面は実装済み。
- 道具管理API・管理画面は実装済み。
- 日別チェック以降の業務API・業務画面、E2E、性能試験、AWSリソースは未実装。
- モックは画面構成と操作フローの基準として残し、本実装ではVueコンポーネントとAPI通信へ置き換える。

## 3. 実装方針

- `1 Issue = 1 branch = 1 PR`を基本とし、各Issueに本番コード、必要なテスト、関連文書の更新を含める。
- 原則として、依存元のPRがマージされてから最新の`main`を基に次のブランチを作る。
- フロントエンドとバックエンドを機能単位でつなぐ縦方向の実装を優先し、長期間結合できない状態を避ける。
- TypeORMの`synchronize`は使わず、DB変更は必ずMigrationで管理する。
- Access Token、Refresh Token、パスワード、Cookie、秘密値をログへ出力しない。
- 各主要ステップの実装前後に理解度チェックを行い、原則60%以上を確認して次へ進む。

## 4. DBコンテナの使い分け

| 用途 | DB | 目的 |
| --- | --- | --- |
| ローカル開発 | Docker ComposeのMySQL 8.4（port `3306`） | 開発データを保持し、Frontend・Backendから動作確認する |
| Backend結合テスト | TestcontainersのMySQL 8.4 | テストごとに隔離した実DBでMigration、制約、トランザクションを検証する |
| E2E・性能試験 | Docker ComposeのMySQL 8.4 | Vue、NestJS、MySQLを接続した一連の操作と負荷を確認する |
| 本番 | Amazon RDS for MySQL 8.4 | AWSの永続DBとして利用する |

開発用DBを結合テストに流用しない。これにより、テストによる開発データの破壊を防ぎ、ローカルとCIで同じ条件を再現する。

## 5. 実装ロードマップ

Issue番号は起票時に確定する。各行を原則1つのIssue・PRとして扱う。

| 順序 | 実装単位 | 主な成果物 | 主な確認 |
| ---: | --- | --- | --- |
| 1 | 開発基盤 | Vue 3、NestJS、Tailwind CSS、Docker Compose MySQL、環境変数、Vite proxy、Swagger、health API | lint、型、単体テスト、build、3サービスの起動 |
| 2 | CI基盤 | GitHub ActionsのFrontend・Backendジョブ、依存キャッシュ、成果物保存 | PR相当の全品質コマンドが自動成功すること |
| 3 | DB基盤 | TypeORM設定、全Entity、初回Migration、`COMMON`カテゴリ・初期管理者Seed | TestcontainersでMigration、DB制約、Seedを検証 |
| 4 | Backend認証・認可 | Login、Refreshローテーション、Logout、`/auth/me`、パスワード変更、JWT Guard、Role Guard | Service・Guard単体、認証API結合、秘密値非出力 |
| 5 | Frontend認証・共通UI | ログイン、初回パスワード変更、Pinia、Axios、Refresh一重化、Router Guard、403・404、共通レイアウト | Vitest、Vue Testing Library、MSWで認証状態を検証 |
| 6 | ユーザー管理 | 一覧、作成、編集、停止・再有効化、仮パスワード再発行、管理画面 | 最後の管理者・自己停止・自己降格・競合の単体／結合／画面テスト |
| 7 | 作業カテゴリ管理 | 一覧、作成、編集、停止・再有効化、管理画面 | 名称重複、使用中停止、`COMMON`保護の単体／結合／画面テスト |
| 8 | 道具管理 | 一覧、作成、編集、停止・再有効化、閲覧権限、管理画面 | 在庫境界、無効カテゴリ、権限、名称重複の単体／結合／画面テスト |
| 9 | 日別表の作成・取得 | `FULL_DAY`／`SPLIT`、時間帯別カテゴリ、スナップショット、冪等作成、過去日取得 | Transaction、同時作成、方式不一致、スナップショットの結合テスト |
| 10 | ホーム・日別表表示 | ホーム、作成ダイアログ、日付選択、時間帯切替、カテゴリ・道具表示 | MSWによる作成・取得・表なし・過去日表示の画面テスト |
| 11 | 日別表の更新 | 数量・チェック自動保存、カテゴリ追加、過去日制限、楽観ロック、409からの復旧 | 数量境界、競合、カテゴリ重複、保存状態の単体／結合／画面テスト |
| 12 | UI・アクセシビリティ仕上げ | モックとの差分解消、レスポンシブ、フォーカス、ダイアログ、通知、通信エラー表示 | 360px・768px・1280px、キーボード操作、主要ラベルの確認 |
| 13 | ログ・運用・セキュリティ強化 | JSONログ、requestId、例外Filter、認証イベント、マスキング、レート制限 | ログ結合、秘密値非出力、401・403・409・429・500の確認 |
| 14 | E2E | Playwright設定、E2E Seed、認証・管理・日別チェックの主要シナリオ | E2E-AUTH、E2E-ADMIN、E2E-CHECKをChromiumで実行 |
| 15 | 性能試験 | k6 smoke、日別チェック、道具一覧、結果記録 | 最大20 VU、p95 500ms未満、想定外エラー率1%未満 |
| 16 | AWS・CD | Terraform、S3、CloudFront、ALB、ECS Fargate、ECR、RDS、監視、Migrationタスク、CD | `terraform fmt/validate/plan`、Migration後の段階的デプロイ確認 |

## 6. 実装順序の理由

```text
開発・CI基盤
  └─ DB・Migration
      └─ 認証・ユーザー
          └─ 作業カテゴリ
              └─ 道具
                  └─ 日別チェック
                      └─ E2E・性能
                          └─ AWS・CD
```

- 認証はusersとrefresh_sessions、および共通Guard・エラー処理に依存する。
- 道具は作業カテゴリに属するため、カテゴリ管理を先に完成させる。
- 日別チェックはユーザー、カテゴリ、道具のスナップショットを使用するため、主要機能の中で最も下流に置く。
- CIを早期に導入し、以降のすべてのPRで型、規約、テスト、ビルドの退行を検出する。
- AWSはアプリ、Migration、ヘルスチェック、ログ、試験方法が安定してから構築し、インフラ仕様の手戻りを抑える。

## 7. 各Issueの共通完了条件

- Issueの受け入れ条件を満たしている。
- 変更した本番コードに対応する単体・結合・画面テストが同じPRに含まれている。
- 該当範囲のlint、型チェック、テスト、buildがすべて成功している。
- 必要に応じて実際のAPIまたは画面で動作を確認している。
- 要件や設計を変更した場合、機能定義、API、DB、テスト戦略、トレーサビリティも更新している。
- セキュリティ上重要な判断と、初学者に分かりにくい処理へ「なぜ必要か」が分かる日本語コメントがある。
- 実装内容、設計理由、確認結果、残課題をPR本文とユーザーへの報告に残している。

## 8. 学習チェックの進め方

次の主要段階では、実装前に対象機能と設計理由を説明し、ユーザーが自分の言葉で回答する。
実装後には変更箇所と実際のデータフローを再確認する。

- 開発基盤とDB設計
- 認証・認可
- ユーザー、作業カテゴリ、道具の主要API
- 日別表の作成、スナップショット、楽観ロック
- テスト方針とE2E・性能試験
- ログ・CI/CD
- AWS構成

理解度60%以上なら補足を確認しながら次へ進み、60%未満なら短い復習と再アウトプットを行う。

## 9. 最初に着手するIssue

最初の実装Issueは「開発基盤の構築」とする。

### 対象

- 利用するnpmパッケージの互換性を確認し、正確なpatchバージョンをlockfileへ固定する。
- `frontend/`へVue 3、TypeScript、Vite、Tailwind CSS、Vue Router、Pinia、Vitestの基盤を作る。
- `backend/`へNestJS、TypeScript、TypeORM、Jest、Swagger、環境変数検証の基盤を作る。
- `compose.yaml`へMySQL 8.4、healthcheck、永続volume、標準port `3306`を設定する。
- `synchronize: false`を全環境で固定する。
- Frontend `5173`、Backend `8080`、MySQL `3306`で起動できるようにする。
- `.env.example`とローカル起動手順を追加する。実際の秘密値をGitへ含めない。
- Frontend・Backendのlint、型チェック、テスト、buildスクリプトを用意する。

### 対象外

- 業務テーブルのMigrationとSeed
- ログインなどの認証機能
- マスター管理・日別チェックのAPIと画面
- AWSリソースの作成

### 完了条件

- 新しい開発者が手順に従ってMySQL、NestJS、Vueを標準portで起動できる。
- VueからVite proxy経由でhealth APIを呼び出せる。
- 不正または不足した環境変数ではBackendが理由を示して安全に起動失敗する。
- lint、型チェック、単体テスト、buildが成功する。

## 10. 関連資料

- [MVP要件定義](requirements.md)
- [アプリケーション構成・技術スタック](design/application-architecture.md)
- [DB設計・ER図](design/database.md)
- [REST API設計](design/api.md)
- [テスト戦略](design/test-strategy.md)
- [CI/CD設計](design/ci-cd.md)
- [AWS・Terraform構成](design/aws-architecture.md)
- [トレーサビリティ](design/traceability.md)
