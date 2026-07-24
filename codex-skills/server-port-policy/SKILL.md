---
name: server-port-policy
description: FieldFlow でサーバー（フロント / バックエンド / DB）を起動するときに適用するポート運用ポリシー。ポート競合時に別ポートへ逃げず、占有プロセスを停止して規定ポートで起動し直す。
---

# Server Port Policy (FieldFlow)

## 目的

このリポジトリでは、フロント / バックエンド / DB のポートを固定する。
Vite の proxy、README、E2E、手動確認の前提を揃えるため、必ず規定ポートで起動する。

## 規定ポート

| サービス | ポート | 標準起動コマンド |
| --- | --- | --- |
| フロントエンド (Vite dev server) | `5173` | `cd frontend && npm run dev` |
| バックエンド (NestJS) | `8080` | `cd backend && npm run start:dev` |
| MySQL | `3306` | `docker compose up -d db` |

## 起動前チェック

サーバー起動コマンドを実行する前に、該当ポートを確認する。

```bash
lsof -i :5173 -i :8080 -i :3306 -P -n
docker ps --format '{{.Names}} {{.Ports}}'
```

占有プロセスがある場合は、別ポートへ逃げずに停止してから起動し直す。

- 一般プロセス: `kill <PID>`
- NestJS: 起動したターミナルで `Ctrl+C`。バックグラウンド実行時はPIDを確認して停止
- Docker コンテナ: `docker stop <container_name>`

## 起動確認

```bash
until curl -sf http://localhost:5173/ >/dev/null; do sleep 1; done
until curl -sf http://localhost:8080/api/health >/dev/null; do sleep 2; done
```

`/api/health` が未実装の段階では、実装済みの疎通確認エンドポイントか、期待される HTTP ステータスで確認する。

## 禁止事項

- `npm run dev -- --port 5174` のように別ポートで起動する。
- `PORT` やNestJSの起動設定を一時的に書き換える。
- `compose.yaml` のポートマッピングを書き換える。
- ポート競合を放置したまま「動作確認できなかった」と報告する。

ユーザーが明示的に別ポートを指示した場合のみ、その指示に従う。
