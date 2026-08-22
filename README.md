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

Backendログは1イベント1行のJSONです。ローカルでは`backend/.env`の`LOG_LEVEL=debug`を使用でき、画面のエラー本文または`X-Request-Id`ヘッダーにあるrequestIdで、同じHTTP処理・例外・認証イベントを追跡できます。`TRUST_PROXY_HOPS`はローカルでは`0`のまま使用し、実際のProxy構成と一致しない値へ変更しないでください。

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
npm run test:integration
npm run build
```

## CI

`main`向けのPull Requestと`main`へのpushでは、GitHub ActionsがFrontend・Backendの品質チェックを独立したjobで並列実行します。

- Frontend: lint、型チェック、単体・コンポーネントテスト、build
- Backend: lint、型チェック、単体テスト、結合テスト、build
- Node.jsは`.node-version`、依存パッケージは各`package-lock.json`に従って再現します。
- build成果物はGitHub ActionsのArtifactとして7日間保存します。

CIでのみ問題が起きることを避けるため、push前にも上記の品質チェックをローカルで実行します。GitHub Actionsに秘密値を追加する場合は後続Issueで用途と権限を確認し、トークンやパスワードをログやArtifactへ含めません。

## DB運用

- ローカル開発ではDocker ComposeのMySQL 8.4を使用します。
- Backend結合テストでは、Testcontainersの隔離されたMySQL 8.4を使用します。Docker Desktopを起動してから実行してください。
- TypeORMの`synchronize`は全環境で無効です。スキーマ変更はMigrationだけで行います。
- DB停止は`docker compose stop db`を使用します。volumeを削除する操作はデータを失うため、明示的な目的がない限り行いません。

開発DBを起動した後、初回MigrationとSeedを次の順序で実行します。

```bash
cd backend
npm run migration:show
npm run migration:run
npm run seed:run
```

`seed:run`は`backend/.env`の`INITIAL_ADMIN_NAME`、`INITIAL_ADMIN_LOGIN_ID`、`INITIAL_ADMIN_PASSWORD`を使用します。初期管理者と`共通`カテゴリがすでに存在する場合は作り直さないため、再実行してもパスワードや業務データを上書きしません。平文パスワードはDB・ログ・Gitへ保存しないでください。

設計資料の一覧は[docs/README.md](docs/README.md)を参照してください。
