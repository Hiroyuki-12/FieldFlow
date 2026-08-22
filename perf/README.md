# FieldFlow k6性能試験

ロードマップ15の `PERF-SMOKE`、`PERF-CHECK`、`PERF-MASTER` を実行する。通常の開発DBではなく `fieldflow_perf` 専用DBを使い、認証済みAPIのp95と想定外エラー率を測定する。

## 安全上の前提

- SeedとBackendは `NODE_ENV=test` かつ `DB_NAME=fieldflow_perf` の完全一致が必要。
- k6の接続先は既定で `localhost` / `127.0.0.1` だけを許可する。
- リモート環境は、対象環境の所有者・負荷許可・影響範囲を確認したうえで `PERF_ALLOW_REMOTE_TARGET=true` を明示した場合だけ許可する。
- 本番認証情報、本番DB、本番利用者データは使わない。
- `perf/results/` のJSONはGit追跡対象外であり、Access TokenやCookieは結果へ出力しない。

## 初回準備

```bash
cp perf/.env.example perf/.env

cd perf
npm ci
npm run prepare:db
```

`prepare:db`は性能試験DBの冪等作成、Migration、再実行可能なSeedを順に行う。Fixtureは架空作業者1人、10作業カテゴリ、200道具、20日分の日別表で構成する。日別表は20 VUが別々の更新行を担当し、通常性能へ意図しない409競合を混ぜない。

## Backend起動

規定port `8080` が空いていることを確認し、別Terminalで実行する。

```bash
cd perf
npm run start:backend
```

## 実行

```bash
bash perf/run.sh smoke
bash perf/run.sh checklist
bash perf/run.sh master
bash perf/run.sh all
```

既定条件は次のとおり。

| ID | API | 負荷 |
| --- | --- | --- |
| PERF-SMOKE | Login、health、日別表取得 | 1 VU / 1分 |
| PERF-CHECK | 日別表取得、項目更新 | 30秒増加 + 20 VU 2分 + 30秒減少 |
| PERF-MASTER | 道具一覧100件取得 | 30秒増加 + 20 VU 2分 + 30秒減少 |

短い確認では、最大20 VUの安全上限内で上書きできる。

```bash
VUS=5 DURATION=15s bash perf/run.sh checklist
```

## 合格基準と結果

- `http_req_duration p(95)<500ms`
- `unexpected_error_rate<1%`
- `checks>99%`

成功Statusと、意図して発生させる業務4xxは別Metricとして扱う。現在の基準シナリオは409を意図していないため、発生した409は想定外エラーになる。結果JSONは `perf/results/<UTC日時>-<scenario>.json` へ保存される。標準summaryに含まれるSetup戻り値は保存せず、比較に必要なMetricとcheck構造だけを書き出すため、Access Tokenは結果へ残らない。

結果を比較するときは、実行日時、commit、OS・CPU・メモリ、DB件数、シナリオ、VU、期間、p95、想定外エラー率、閾値判定、Backendログのボトルネック候補を一緒に記録する。ローカルPC上の値をAWS本番性能の保証として扱わない。
