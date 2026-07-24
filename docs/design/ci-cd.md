# CI/CD設計

## 1. ブランチ・PR

- `main`へ直接commit・pushしない。
- 1 Issue = 1 branch = 1 PRとし、ブランチ名は`<type>/#<issue>-<slug>`。
- PR本文に`Closes #<issue>`を含め、レビュー会話とCIを全て解決してからsquashまたはrebase mergeする。
- 本番デプロイはGitHub Environment `production`の承認後だけ実行する。

## 2. CI

```mermaid
flowchart LR
    PR[Pull Request] --> F["Frontend<br/>lint/typecheck/test/build"]
    PR --> B["Backend<br/>lint/typecheck/unit/integration/build"]
    PR --> E["E2E<br/>MySQL+NestJS+Vue+Playwright"]
    PR --> T["Terraform<br/>fmt-check/validate"]
    F --> G[Required checks]
    B --> G
    E --> G
    T --> G
```

### Frontend job

1. Node.js 24、`npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test -- --run`
5. `npm run build`

### Backend job

1. Node.js 24、`npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. Testcontainers MySQL 8.4による`npm run test:integration`
6. `npm run build`

### E2E job

MySQL 8.4を3306で起動し、MigrationとE2E seedを適用する。NestJSを8080、Playwrightの`webServer`でVueを5173に起動してChromiumシナリオを実行する。失敗時もreport・trace・backend logを7日保持する。

## 3. CD

```mermaid
flowchart TD
    M[main merge] --> CI[CI成功]
    CI --> A[production承認]
    A --> OIDC[AWS OIDC認証]
    OIDC --> IMG["Backend build/push<br/>ECR:commit SHA"]
    OIDC --> WEB["Frontend build<br/>S3 upload"]
    IMG --> MIG["ECS one-off<br/>TypeORM migration"]
    MIG -->|成功| ECS[ECS service更新]
    MIG -->|失敗| STOP[デプロイ停止]
    ECS --> HC[ALB health確認]
    WEB --> INV[CloudFront invalidation]
```

- AWS固定アクセスキーをGitHub Secretsへ置かず、OIDCと最小権限IAM Roleを使用する。
- Backendイメージはcommit SHAタグで指定し、どのコードが動いているか追跡可能にする。
- Migration失敗時はECS Serviceを更新しない。アプリ失敗時は直前のイメージタグへ戻せるようTask Definition revisionを保持する。
- Frontendはビルド後にS3へ同期し、CloudFront invalidationを行う。削除対象を含む同期は差分を確認する。

## 4. Terraform

- PRで`terraform fmt -check`と`terraform validate`を行う。
- `plan`はAWS認証が利用できる安全なイベントで生成し、秘密値をartifactへ含めない。
- `apply`と`destroy`は自動実行せず、差分・影響・復旧方法を説明してユーザー承認後に行う。

## 5. 保護設定

- mainのRequired checksにFrontend、Backend、E2Eを登録する。
- force push、branch deletion、未レビューmergeを禁止する。
- Dependabot等の更新も通常PRとして全テストを通す。
