# ロードマップ15 k6性能試験 実装計画

## 1. 目的

k6を使い、認証済みの主要APIへFieldFlow MVPで想定する最大20同時利用者相当の負荷をかけ、応答時間と想定外エラー率を再現可能な条件で測定・記録できるようにする。

対応Issueは [#37 ロードマップ15 k6性能試験を実装する](https://github.com/Hiroyuki-12/FieldFlow/issues/37) とする。

## 2. 性能試験専用環境・Seed

- 通常の`fieldflow`、E2Eの`fieldflow_e2e`とは別に、同じMySQL 8.4内へ`fieldflow_perf`を用意する。
- DB作成CLI、Seed CLI、Backend起動補助の各入口で`NODE_ENV=test`かつ`DB_NAME=fieldflow_perf`の完全一致を検証する。
- Seedは架空作業者1人、10作業カテゴリ、200道具、20日分の日別表を作る。パスワードはArgon2idハッシュだけをDBへ保存する。
- 前回の`PERF `／`perf.`接頭辞データだけを外部キーの子から削除し、TRUNCATEせず同じデータ量へ戻せるようにする。
- 日別表は最大20 VUへ1日ずつ割り当てる。各VUが別の項目を更新し、通常の応答性能へ意図しない楽観ロック409を混ぜない。
- k6は既定でlocalhostだけを許可する。リモート環境は負荷許可と影響範囲を確認し、明示フラグを設定した場合だけ実行可能にする。

## 3. k6シナリオ

### 3.1 PERF-SMOKE

- Setupで性能試験用作業者として1回ログインする。
- 1 VU・1分で`GET /api/health`と今日の`GET /api/v1/daily-checklists/:date`を繰り返す。
- 認証、公開health、認証済み業務APIの最小経路が動くことを確認する。

### 3.2 PERF-CHECK

- 30秒で0から20 VUへ増加し、20 VUを2分維持した後、30秒で0へ戻す。
- 各VUが専用日の日別表を取得し、レスポンス中の最新項目versionを使って数量を更新する。
- 同一行を複数VUで更新しない。発生した409は基準シナリオでは想定外として扱う。
- 1反復ごとに8秒の利用者入力間隔を置き、一般APIの600回/分レート制限を負荷試験自身が踏み越えないようにする。

### 3.3 PERF-MASTER

- PERF-CHECKと同じ3分・最大20 VUの負荷形状を使う。
- `GET /api/v1/tools?page=1&pageSize=100&status=ACTIVE`を繰り返し、200件の総件数と100件のページを検証する。
- 1反復ごとに5秒の閲覧間隔を置く。

## 4. 指標・合格基準

- `http_req_duration p(95)<500ms`
- `unexpected_error_rate<1%`
- `checks>99%`
- HTTP成功、意図した業務4xx、通信失敗・想定外Statusを別に集計する。
- 基準シナリオで意図した4xxはない。将来409競合性能を測る場合は、業務応答Counterへ分離し、想定外エラー率へ含めない。
- 結果には実行日時、commit、OS・CPU・メモリ、DB件数、シナリオ、VU、期間、p95、想定外エラー率、閾値判定、ボトルネック候補を残す。

## 5. ローカル実行・GitHub Actions

- `perf/`を独立したnpm packageとし、k6用TypeScript型定義とTypeScriptをlockfileへ固定する。
- `npm run prepare:db`で専用DB作成、Migration、Seedを順に行う。
- `npm run start:backend`でwatchを使わずbuild成果物を規定port 8080へ起動する。
- `bash perf/run.sh smoke|checklist|master|all`でシナリオを選び、Git追跡外の`perf/results/`へk6 summary JSONを保存する。標準summaryのSetup戻り値は保存せず、Metricとcheck構造だけへ限定してAccess Token混入を防ぐ。
- 通常PRの必須CIへ長時間負荷を加えない。手動`workflow_dispatch`専用Workflowで、使い捨てMySQL、k6 2.0.0、Backendを準備して実行する。
- WorkflowのActionはcommit SHAへ固定し、結果Artifactを7日間、失敗時Backendログを7日間保存する。

## 6. テスト計画

- Backend単体テストで、性能DB名とtest環境だけを受け入れ、通常・E2E・本番DBを接続前に拒否することを確認する。
- Backendのtypecheck・lint・単体テスト・buildでSeedとCLIの退行を確認する。
- `perf`のtypecheckと`k6 inspect`で3シナリオのTypeScript・k6設定を検証する。
- 専用DBへMigration・Seed・Seed再実行を行い、Fixture件数と通常DBからの分離を確認する。
- 短時間の1〜5 VU試験で、ログイン、日別表取得・項目更新、道具一覧、結果JSON生成を確認する。
- 既定の1分・3分・3分を実行し、p95、想定外エラー率、check、レート制限429の有無を記録する。
- Frontend、Backend、E2Eの既存品質チェックと`git diff --check`を実行する。

## 7. 対象外

- Cloudflare公開環境、AWS課題環境、両環境の永続DB・利用者データを使う負荷試験
- 20 VUを超える容量限界、Spike、長時間Soak試験
- Cloudflare、Aiven、AWS、Terraform、CDリソースの実装
- 基準未達時のDB Index・SQL・API仕様変更。原因と改善案を整理し、別Issueで扱う。

## 8. 完了条件

- Issue #37の受け入れ条件を満たす。
- PERF-SMOKE、PERF-CHECK、PERF-MASTERをローカルまたは手動CIで再現できる。
- 性能試験が通常・E2E・本番DBへ接続しない。
- 最大20 VUでp95 500ms未満、想定外エラー率1%未満を確認する。
- 認証情報・Token・Cookieがログ、summary、Git追跡ファイルへ残らない。
- 既存品質チェックと`git diff --check`が成功する。
- 実装内容、設計理由、測定条件、結果、残課題を本書へ追記する。

## 9. 実装後の理解チェック

ユーザーの希望に合わせ、理解度チェックは実装・性能測定の完了後に行う。単体・結合・E2E・性能試験の違い、専用DBと20個の更新行を使う理由、VU・p95・エラー率、レート制限との関係、ローカル結果を本番保証にできない理由を、実際の測定結果と結び付けて確認する。

## 10. 実装結果

2026-08-22にIssue #37の性能試験基盤、専用DB・Seed、3シナリオ、手動Workflow、設計資料更新、既定負荷のローカル測定を完了した。

### 10.1 性能試験基盤・安全性

- `perf/`を独立したnpm packageにし、k6 2.0.0、`@types/k6` 2.2.0、TypeScript 6.0.3を使用した。型定義とTypeScriptはlockfileへ固定した。
- `fieldflow_perf`専用DB作成、Migration、Seed、build済みBackend起動を補助するCLIを追加した。すべての変更入口で`NODE_ENV=test`とDB名の完全一致を確認する。
- Seed再実行に成功し、利用者1件、カテゴリ11件、道具200件、日別表20件、時間帯20件、日別項目760件へ同じ状態で戻ることを確認した。
- k6はlocalhostだけを既定で許可し、最大VUは20へ制限した。20日分の日別表をVUごとに分け、基準シナリオへ意図しない409を混ぜない。
- 標準`--summary-export`がSetup戻り値も保存することを実装中に検出した。独自`handleSummary`へ変更し、Metricとcheck構造だけを保存するよう修正した。生成JSONのkeyと全文検索により、`setup_data`、Access Token、Authorization、Bearer、Cookie、passwordが含まれないことを確認した。

### 10.2 k6シナリオ・Workflow

- PERF-SMOKEはSetupで1回ログインし、1 VU・1分でhealthと日別表取得を確認する。
- PERF-CHECKは最大20 VU・3分で、各VU専用日の日別表取得とversion付き項目更新を行う。8秒の操作間隔により、一般API 600回/分のレート制限内で通常利用の読み書きを測る。
- PERF-MASTERは最大20 VU・3分で、200道具に対する100件ページ取得を行う。HTTP 200だけでなく、総件数とページ件数もcheckする。
- 手動GitHub Actions Workflowを追加し、`all`、`smoke`、`checklist`、`master`を選択可能にした。MySQL 8.4.10、k6 2.0.0、公式Actionのcommit SHAを固定し、安全なsummaryと失敗時Backendログを7日間保存する。

### 10.3 ローカル性能測定結果

測定環境はDarwin arm64、Node.js 24.18.0、k6 2.0.0、Docker Compose MySQL 8.4.10、同一Mac内のBackend 8080とMySQL 3306である。ソースは`f11b5d7`を基点としたIssue #37作業ツリーを使用した。

| シナリオ | VU・期間 | Request | p95 | 最大 | 想定外エラー率 | check | 判定 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| PERF-SMOKE | 1 VU・1分 | 119 | 17.01ms | 44.25ms | 0.00% | 100.00% | PASS |
| PERF-CHECK | 最大20 VU・3分 | 773 | 21.49ms | 68.36ms | 0.00% | 100.00% | PASS |
| PERF-MASTER | 最大20 VU・3分 | 610 | 29.81ms | 81.76ms | 0.00% | 100.00% | PASS |

- 全シナリオでp95 500ms未満、想定外エラー率1%未満、check 99%超を満たした。409、429、通信失敗、中断は発生しなかった。
- 1回目の本測定でもSmoke 18.98ms、CHECK 23.03ms、MASTER 30.75msとなり、2回目と近いp95を確認した。
- 3シナリオ中では100件のRelationを返す道具一覧が最も高いp95だった。ただし基準まで十分余裕があり、現時点で性能改善は不要と判断した。データ量・ネットワーク遅延が増える環境では、一覧のSQL、JSON変換、レスポンス量を最初の調査候補とする。
- 同一Mac内の値には実ネットワーク、Cloudflare Container、Aiven、ALB、ECS、RDSの遅延が含まれないため、公開環境の性能保証には使わない。Cloudflare公開環境へk6を直接送信せず、必要な性能検証は別の隔離環境で行う。AWSはロードマップ17で課題用環境を構築した後、負荷許可と費用を確認して再測定の要否を判断する。

### 10.4 自動品質確認結果

- Performance: `npm ci`、typecheck、3シナリオの`k6 inspect`、npm監査脆弱性0件、短時間配線試験、既定負荷2回成功。
- Backend: typecheck、lint、24 suite・76件の単体テスト、build成功。性能DB設定の専用6件で、通常・E2E・本番DB拒否を確認した。
- Testcontainers MySQL・Supertest: 8 suite・54件の結合テスト成功。
- Frontend: typecheck、lint、17 suite・77件のVitest、build成功。
- Playwright Chromium: typecheck、6 test全件成功。
- `git diff --check`成功。

### 10.5 稼働状態

- 性能試験中だけ既存Backendを停止し、`fieldflow_perf`へ接続したbuild成果物を規定port 8080で起動した。health 200を確認してから負荷を送った。
- 性能試験後は`fieldflow_e2e`へ切り替えてPlaywrightを完走し、最後に元の開発用Backendを8080へ復元してhealth 200を確認した。
- MySQLコンテナは作業開始時から稼働していたFieldFlowのMySQL 8.4.10を維持し、通常の`fieldflow` DBは性能Seedの対象にしていない。
- GitHub上の手動Performance Workflow実行は、ユーザー承認後のcommit・push・PR作成後に確認する。
