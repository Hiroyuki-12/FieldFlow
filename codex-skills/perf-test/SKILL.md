---
name: perf-test
description: FieldFlow のバックエンド API に対する k6 パフォーマンステストをオンデマンドで実行するための手順。環境起動、必要なシード投入、k6 実行、結果報告、後片付けまでを扱う。
---

# Performance Test Runner (FieldFlow)

`perf/` 配下に k6 テストを配置した場合の実行手順。
アプリ初期構築前は、この skill を負荷試験基盤作成時の設計メモとして扱う。

## 前提

- k6（プロジェクトで確認済みの安定版）
- 規定ポート:
  - MySQL `3306`
  - バックエンド `8080`
- ポート運用は `../server-port-policy/SKILL.md` に従う。

## k6 確認

```bash
k6 version
```

未インストールの場合は、ユーザーにインストールを確認してから進める。

## 環境起動

```bash
docker compose up -d db

cd backend
npm run start:dev
```

起動確認は、実装済みの health check または API の期待ステータスで行う。

## シードデータ

負荷試験用 seed が `perf/seed/seed.sql` にある場合のみ投入する。
TRUNCATE を伴う seed は、必ずローカル開発 DB 専用とする。

```bash
docker compose exec -T db mysql -ufieldflow -pfieldflow fieldflow < perf/seed/seed.sql
```

DB 名やユーザー名は実プロジェクトの compose 設定に合わせる。

## 実行コマンド例

```bash
bash perf/run.sh smoke
bash perf/run.sh checklists
```

負荷や時間を変える場合:

```bash
VUS=20 DURATION=3m bash perf/run.sh checklists
```

## 結果報告

各シナリオについて、以下を表でまとめる。

- PASS / FAIL
- p95
- エラー率
- 主なボトルネック候補

HTML / Markdown / JSON レポートを生成する構成にした場合は、成果物のパスも伝える。

## 後片付け

検証のために起動したサーバーを停止する場合は、ユーザーに確認してから行う。

```bash
PID=$(lsof -ti :8080 -sTCP:LISTEN); [ -n "$PID" ] && kill "$PID"
docker compose down
```

## 注意事項

- 別ポートに逃げない。
- TRUNCATE を伴う seed を本番 DB に流さない。
- `perf/results/` は git 追跡対象外にする。
- k6 スクリプトを変更したら、`cd perf && npm run typecheck` を実行する。
