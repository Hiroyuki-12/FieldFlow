# ロードマップ14 Playwright E2E 実装計画

## 1. 目的

Playwright Chromiumを使い、Vueの画面操作からNestJSの認証・業務ルール、MySQLの永続化までをつないだ主要利用シナリオを自動検証する。

対応Issueは [#35 ロードマップ14 Playwright E2Eを実装する](https://github.com/Hiroyuki-12/FieldFlow/issues/35) とする。

## 2. E2E基盤

- `e2e/`をFrontend・Backendから独立したnpm packageにし、`@playwright/test`、TypeScript、Chromiumをlockfileへ固定する。
- FrontendはPlaywright `webServer`で規定port `5173`へ起動する。BackendはE2E用環境変数を明示して`8080`、MySQLは`3306`を使う。
- DBを共有する業務シナリオの並列更新を避けるため、Chromium 1 project・worker 1本・retryなしで実行する。
- screenshot、trace、video、HTML reportは失敗時だけ残し、Git追跡対象外にする。

## 3. 専用DB・Seed

- 通常の`fieldflow`開発DBとは別に、同じMySQL内へ`fieldflow_e2e` DBを用意する。
- DB作成CLIとSeed CLIは`NODE_ENV=test`かつ`DB_NAME=fieldflow_e2e`の完全一致を接続前に検証する。
- Seedは管理者、作業者、初回パスワード変更者、COMMON／WORKカテゴリ、道具、過去日表を作る。
- 再実行時は`E2E `／`e2e.`接頭辞とE2E利用者IDで対象を限定し、外部キーの子から削除する。通常データのTRUNCATEや本番DBへの接続は行わない。
- パスワードはE2E専用環境変数から受け取り、Argon2idハッシュだけをDBへ保存する。

## 4. シナリオ

- E2E-AUTH-01: 仮パスワードでログインし、初回変更後に新しいパスワードで再ログインする。
- E2E-AUTH-02: 通常ログイン、Refresh、Logoutを行い、保護画面へ戻れないことを確認する。
- E2E-ADMIN-01: 管理者がカテゴリ、道具、作業者を画面から作成する。
- E2E-ADMIN-02: 作業者の管理メニュー非表示、直URLの403画面、管理APIの403を確認する。
- E2E-CHECK-01〜05: SPLIT表作成、時間帯別入力、自動保存、再読込、カテゴリ追加、過去日閲覧、設定変更、削除、同日再作成を確認する。

## 5. CI

- GitHub ActionsへFrontend・Backendと独立したE2E jobを追加する。
- MySQL 8.4 serviceへMigrationとE2E Seedを適用し、buildしたNestJSとViteを規定portで起動する。
- E2E専用の架空認証情報だけをjob環境へ設定し、本番・開発の秘密値を使わない。
- E2E失敗時だけPlaywright成果物とBackendログを7日間Artifactへ保存する。

## 6. 対象外

- k6性能試験
- Cloudflare、Aiven、AWS、Terraform、CD
- Firefox、WebKit、モバイル実機でのE2E
- Cloudflare公開環境・AWS課題環境と、その永続データを使う試験

## 7. 完了条件

- Issue #35の受け入れ条件を満たす。
- `e2e`のtypecheckとChromium全シナリオが成功する。
- FrontendとBackendのlint、typecheck、単体・結合テスト、buildが退行しない。
- `git diff --check`が成功する。
- 失敗時の証跡と実行手順から原因を調査できる。

## 8. 実装後の理解チェック

ユーザーの希望に合わせ、理解度チェックは実装・動作確認の完了後に行う。E2Eと単体／結合テストの違い、専用DBとSeedの分離理由、PlaywrightからDBまでのデータフロー、安定性・セキュリティ上の注意を実際の結果と結び付けて確認する。

## 9. 実装結果

2026-08-22にIssue #35のE2E基盤、専用DB・Seed、認証・管理・日別チェックシナリオ、CI job、設計資料更新、規定portでの動作確認を完了した。

### 9.1 Playwright・実行環境

- `e2e/`へPlaywright 1.62.1、TypeScript設定、Chromium projectを追加し、`package-lock.json`へ固定した。
- Node 24のTypeScript型除去を補助CLIに使い、別の実行ランナーへ依存せずDB準備とBackend起動を行えるようにした。
- FrontendはPlaywright `webServer`で5173、Backendはbuild成果物を8080、MySQLはDocker Composeの3306で動作させた。
- 共有業務日への書込み競合を避けるためworker 1本・retryなしとし、失敗時だけtrace、screenshot、video、HTML reportを保存する。

### 9.2 E2E専用DB・Seed

- 同じMySQLサーバー内へ`fieldflow_e2e`を冪等作成し、通常の`fieldflow`開発DBから分離した。
- DB作成・Seedの両入口で`NODE_ENV=test`と`DB_NAME=fieldflow_e2e`の完全一致を検証した。通常DB・本番環境を指定した設定テストも成功した。
- 管理者、作業者、初回変更者、3作業カテゴリ、共通カテゴリ、4道具、過去日表をSeedした。パスワードはArgon2idハッシュだけを保存する。
- 再実行時はE2E利用者が作った日別表を子テーブルから削除し、Refresh Sessionの自己参照を解除してから対象Sessionを削除する。管理画面で作ったUUID不定のデータも接頭辞で限定して整え、TRUNCATEは使わない。
- E2Eを一度完走した後のSeed再実行にも成功し、再実行可能性を確認した。

### 9.3 実装シナリオ

- AUTH: 初回パスワード変更と再ログイン、Origin検証を含むRefreshローテーション、Logout後の保護画面拒否。
- ADMIN: カテゴリ・道具・作業者の画面作成、仮パスワード一度限り表示、作業者のメニュー非表示・直URL拒否・API 403。
- CHECK: ホームからSPLIT表作成、午前・午後の独立入力、自動保存後の再読込、カテゴリ追加、過去日閲覧専用、入力影響確認後の設定変更、削除、同日再作成。

### 9.4 自動確認結果

- Playwright Chromium: 6 test・全件成功。E2E-AUTH 2件、E2E-ADMIN 2件、E2E-CHECK 5件をカバーした。
- E2E: typecheck成功。
- Frontend: typecheck、lint、17 suite・77件のVitest、build成功。
- Backend: typecheck、lint、23 suite・70件のJest、build成功。
- Testcontainers MySQL・Supertest: 8 suite・54件の結合テスト成功。
- `git diff --check`成功。

### 9.5 CI・稼働確認

- GitHub Actionsへ独立したPlaywright E2E jobを追加した。MySQL service、Migration、Seed、Backend build・起動、Chromium実行、失敗時Artifact保存を自動化した。
- `fieldflow_e2e`へのMigration適用とSeed、Seed再実行が成功した。
- Backend healthは8080でHTTP 200と`X-Request-Id`を返し、ChromiumはPlaywrightが5173へ起動したVueを通して全シナリオを実行した。
- 短時間の反復実行でログイン用IPレート制限429が正しく発動することも確認した。最終確認はE2E Backendを再起動してインメモリ制限を初期化し、クリーンな条件で全件成功した。
- Workflow自体のGitHub上での実行確認は、ユーザー承認後のcommit・push・PR作成後に行う。
