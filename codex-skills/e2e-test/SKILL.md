---
name: e2e-test
description: FieldFlow の E2E（Playwright）テストとブラウザパフォーマンス確認をオンデマンドで実行するための手順。環境起動、Playwright 実行、結果報告、後片付けまでを扱う。
---

# E2E Test Runner (FieldFlow)

`e2e/` 配下に Playwright テストを配置した場合の実行手順。
アプリ初期構築前は、この skill を E2E 基盤作成時の設計メモとして扱う。

## 前提

- Playwright: `@playwright/test`
- ブラウザ: Chromium
- 規定ポート:
  - MySQL `3306`
  - バックエンド `8080`
  - フロントエンド `5173`
- ポート運用は `../server-port-policy/SKILL.md` に従う。

## 初回セットアップ

```bash
cd e2e
npm install
npx playwright install chromium
```

## 環境起動

```bash
docker compose up -d db

cd backend
npm run start:dev
```

フロントエンドは、Playwright の `webServer` で `cd frontend && npm run dev` を起動する構成を標準とする。

## 実行コマンド例

```bash
cd e2e
npm test
npx playwright test tests/auth.spec.ts
npm run test:headed
```

環境変数で URL を上書きする場合:

- `E2E_BASE_URL=http://localhost:5173`
- `E2E_API_URL=http://localhost:8080/api/v1`

## 結果報告

- spec ごとの PASS / FAIL をまとめる。
- 失敗時は trace / screenshot / console log を確認し、原因を短く報告する。
- HTML レポートがある場合は `npx playwright show-report` を案内する。

## 後片付け

検証のために起動したサーバーを停止する場合は、ユーザーに確認してから行う。

```bash
PID=$(lsof -ti :8080 -sTCP:LISTEN); [ -n "$PID" ] && kill "$PID"
PID=$(lsof -ti :5173 -sTCP:LISTEN); [ -n "$PID" ] && kill "$PID"
docker compose down
```

## 注意事項

- 別ポートに逃げない。
- 本番環境や本番 DB に向けない。
- `e2e/results/` や Playwright の実行成果物は、原則として git 追跡対象外にする。
- spec / fixtures を変更したら、`cd e2e && npm run typecheck` を実行する。
