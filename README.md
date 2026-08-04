# FieldFlow

FieldFlowは、現場作業前の道具忘れと紙のチェック漏れを減らすための、チーム共有型の道具管理・日別チェックアプリです。

## 必要な環境

- Node.js 24.18.0 LTS
- npm 11
- Docker Desktop（Docker Composeを含む）

Node.jsのバージョンは`.nvmrc`と`.node-version`で固定しています。nvmを使う場合は、リポジトリ直下で`nvm use`を実行してください。

## 初回セットアップ

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

cd backend
npm ci

cd ../frontend
npm ci
```

`.env`はローカル専用で、Gitの追跡対象には含めません。本番のパスワードや秘密値を`.env.example`へ記載しないでください。

## ローカル起動

リポジトリ直下でMySQLを起動します。

```bash
docker compose up -d db
docker compose ps
```

別のターミナルでBackendを起動します。

```bash
cd backend
npm run start:dev
```

さらに別のターミナルでFrontendを起動します。

```bash
cd frontend
npm run dev
```

| サービス | URL・port |
| --- | --- |
| Frontend | http://localhost:5173 |
| Backend health API | http://localhost:8080/api/health |
| Swagger UI（開発環境のみ） | http://localhost:8080/api/docs |
| MySQL | localhost:3306 |

Frontendは`/api`へのリクエストをVite proxyでBackendへ転送します。ブラウザから直接異なるoriginへ通信しないため、ローカルでも本番に近い経路で確認できます。

## 品質チェック

```bash
cd frontend
npm run typecheck
npm run lint
npm test -- --run
npm run build

cd ../backend
npm run typecheck
npm run lint
npm test
npm run build
```

## DB運用

- ローカル開発ではDocker ComposeのMySQL 8.4を使用します。
- Backend結合テストでは、後続IssueでTestcontainersの隔離されたMySQL 8.4を使用します。
- TypeORMの`synchronize`は全環境で無効です。業務テーブルは後続IssueでMigrationから作成します。
- DB停止は`docker compose stop db`を使用します。volumeを削除する操作はデータを失うため、明示的な目的がない限り行いません。

設計資料の一覧は[docs/README.md](docs/README.md)を参照してください。
