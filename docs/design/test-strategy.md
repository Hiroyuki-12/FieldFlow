# テスト戦略

## 1. 目的とレベル

| レベル | 技術 | 主な対象 |
| --- | --- | --- |
| Frontend単体・統合 | Vitest / Vue Testing Library / MSW | 表示、入力、権限別UI、API成功・失敗 |
| Backend単体 | Jest | Serviceの業務ルール、Guard、変換 |
| Backend結合 | Jest / Supertest / Testcontainers MySQL 8.4 | Controller→Service→TypeORM→実DB |
| E2E | Playwright Chromium | Vue→NestJS→MySQLの主要利用シナリオ |
| 性能 | k6 | 認証済み主要APIの20ユーザー負荷 |

モックだけでDB制約を保証しない。名称一意、外部キー、トランザクション、楽観ロックはTestcontainersの実MySQLで確認する。

## 2. 機能別シナリオ

### 認証（UT/IT/E2E-AUTH）

- 正しい認証、誤った認証の共通エラー、利用停止ユーザー拒否
- Access Token期限・改ざん、Refresh成功・期限切れ・ローテーション・再利用検知
- 初回パスワード変更前の業務API拒否、変更後の全セッション失効
- 複数端末のRefreshセッションと現在端末ログアウト
- 5回失敗後のレート制限、Token/Cookieがログへ出ないこと

### ユーザー（UT/IT-USER、E2E-ADMIN）

- 管理者の作成・編集・利用停止・再有効化・仮パスワード再発行
- 作業者の管理APIが403
- loginId重複、最後の管理者、自分自身の停止・降格を拒否
- 古いversionでの更新競合

### カテゴリ・道具（UT/IT-CAT、UT/IT-TOOL、E2E-ADMIN）

- 大文字小文字・前後空白を含む重複名称
- 使用中カテゴリの停止拒否、無効カテゴリへの道具登録拒否
- `COMMON`カテゴリの名称変更・利用停止・重複作成拒否
- 在庫数境界`0`、`9999`、範囲外、小数・文字列
- 道具利用停止後も既存日別項目が残り、新規時間帯へ含まれないこと

### 日別チェック（UT/IT-CHECK、E2E-CHECK）

- ログイン後にホームを表示し、今日・別日・管理機能へ遷移
- `FULL_DAY`の1時間帯、`SPLIT`の午前・午後2時間帯を冪等かつ一括作成。同じ方式の再送は現在の表を返し、異なる方式の再送は拒否
- 午前と午後で異なる作業カテゴリを選び、切り替えても入力・保存状態が混ざらないこと
- 作成方式と時間帯構成の不整合、過去日の作成・更新拒否
- 選択した作業カテゴリの道具と`共通`道具だけを複製し、名称・カテゴリ・在庫をスナップショット保存
- マスター変更後も作成済み表が変わらないこと
- 管理者・作業者による未選択カテゴリ追加、無効・`COMMON`・重複カテゴリ追加拒否
- 数量`0`、在庫上限、超過、0へ戻した際のチェック解除
- 数量0でのチェック拒否、行単位自動保存
- 同じversionの同時更新で片方だけ成功し、他方が409＋最新行を得ること
- 設定変更で旧版が取消履歴になり、新版へ同じ時間帯・同じ道具の入力だけを引き継ぐこと
- 入力済み内容がある設定変更・削除を確認なしでは拒否すること
- 表の削除後に通常取得が404となり、同じ日へ新しい表を作成できること
- 古いヘッダーID・versionによる設定変更・削除を409で拒否すること

## 3. 画面テスト

- 360px、768px、1280pxでログイン、日別チェック、各管理画面を確認する。
- キーボード操作、フォーカス、ラベル、ダイアログ、エラー通知を確認する。
- モバイルの日付・カテゴリ設定開閉、道具行の1〜2行表示、ダイアログ固定操作領域、遷移後の先頭表示を確認する。
- MSWで401→Refresh→再試行、Refresh失敗、409競合、500、通信断を再現する。
- スナップショットは安易に使わず、利用者が見る文字と操作結果を検証する。

## 4. Playwright E2E

| ID | シナリオ |
| --- | --- |
| [E2E-AUTH-01](../../e2e/tests/auth.spec.ts) | 仮パスワードログイン→変更要求→再ログイン |
| [E2E-AUTH-02](../../e2e/tests/auth.spec.ts) | 通常ログイン→Refresh→ログアウト→保護画面拒否 |
| [E2E-ADMIN-01](../../e2e/tests/admin.spec.ts) | 管理者がカテゴリ・道具・作業者を作成 |
| [E2E-ADMIN-02](../../e2e/tests/admin.spec.ts) | 作業者に管理メニューがなく、直URL・APIも拒否 |
| [E2E-CHECK-01](../../e2e/tests/daily-checklist.spec.ts) | 作業者が午前・午後へ別カテゴリを設定し、数量とチェックを自動保存 |
| [E2E-CHECK-02](../../e2e/tests/daily-checklist.spec.ts) | 作業者が作成済み時間帯へ未選択の作業カテゴリを追加 |
| [E2E-CHECK-03](../../e2e/tests/daily-checklist.spec.ts) | 過去日閲覧と編集不可状態 |
| [E2E-CHECK-04](../../e2e/tests/daily-checklist.spec.ts) | 今日の表を修正し、入力影響の確認後に保存 |
| [E2E-CHECK-05](../../e2e/tests/daily-checklist.spec.ts) | 今日の表を削除し、同じ日に再作成 |

- `NODE_ENV=test`かつDB名が厳密に`fieldflow_e2e`の場合だけ動くE2E専用Seedを使う。前回分は`E2E `／`e2e.`接頭辞で識別し、TRUNCATEせず外部キーの子から削除する。
- 共有する業務日・Seedを並列更新しないようChromium 1 project・worker 1本・retryなしで実行する。
- 本番や本番DBへ向けない。trace、screenshot、video、HTML reportは失敗時に保存しGit追跡しない。
- 規定ポートはfrontend 5173、backend 8080、MySQL 3306とする。

## 5. k6性能試験

| ID | シナリオ | 負荷 |
| --- | --- | --- |
| [PERF-SMOKE](../../perf/scenarios/smoke.ts) | ログイン・health・日別表取得 | 1 VU / 1分 |
| [PERF-CHECK](../../perf/scenarios/checklist.ts) | ログイン済み日別表取得・項目更新 | 最大20 VU / 3分 |
| [PERF-MASTER](../../perf/scenarios/master.ts) | 道具一覧検索 | 最大20 VU / 3分 |

合格基準は`http_req_duration p(95)<500ms`、想定外エラー率`<1%`。409を競合試験として意図的に発生させる場合は、性能エラー率から分離して集計する。結果には実行環境、commit、DB件数、p95、エラー率、ボトルネック候補を残す。

- `NODE_ENV=test`かつDB名が厳密に`fieldflow_perf`の場合だけ動く性能試験専用Seedを使い、通常DBとE2E DBから分離する。
- 10作業カテゴリ、200道具、20日分の日別表を固定量で作り、最大20 VUが別々の項目を更新する。基準性能へ意図しない409競合を混ぜない。
- k6はlocalhostだけを既定で許可し、リモート負荷は対象環境の許可を確認して明示フラグを設定した場合だけ実行する。
- 一般APIのレート制限を性能劣化と誤認しないよう、シナリオへ実利用を想定した操作間隔を含める。429が発生した場合は想定外エラーとして検出する。
- 詳細な準備・実行・結果確認は[perf README](../../perf/README.md)と[ロードマップ15](../plans/roadmap-15-k6-performance.md)を参照する。

## 6. 実行タイミング

- PR: lint、型、Frontend/Backend単体、Backend結合、主要E2E、build。
- k6: リリース候補、性能に関わる変更、ユーザー指定時にローカル/専用環境で実行する。
- 本番データを使う試験、TRUNCATEを伴うseed、サーバー停止は行わない。
