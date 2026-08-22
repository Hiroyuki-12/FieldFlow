# REST API設計

## 1. 共通仕様

- ベースパス: `/api/v1`
- 形式: JSON、文字コードUTF-8、プロパティ名は`camelCase`
- 認証: `Authorization: Bearer <accessToken>`。RefreshだけはHttpOnly Cookieを使用する。
- 日付: `YYYY-MM-DD`、業務日付は`Asia/Tokyo`。日時はISO 8601 UTC（例: `2026-07-21T01:30:00Z`）。
- ID: UUID文字列。クライアントは内部構造を解釈しない。
- 更新系は成功時に更新後リソースを返す。秘密値の平文は仮パスワード発行直後だけ返す。

### ページング

`page`は1始まり、`pageSize`は既定20、最大100とする。

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

### エラー

```json
{
  "statusCode": 409,
  "code": "CHECKLIST_ITEM_UPDATE_CONFLICT",
  "message": "他のユーザーが先に更新しました。",
  "details": { "currentItem": {} },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-07-21T01:30:00Z"
}
```

`X-Request-Id`レスポンスヘッダーとエラー本文の`requestId`は同じ値とする。500ではstack trace、SQL、内部例外メッセージを返さず、利用者はrequestIdを管理者へ伝えてログ調査を依頼する。413はリクエスト本文が100KBを超えた場合に返す。

| HTTP | 用途 |
| --- | --- |
| 400 | JSON形式・型・必須項目不正 |
| 401 | 未認証、Token失効、認証失敗 |
| 403 | ロール不足、初回パスワード未変更 |
| 404 | 対象なし |
| 409 | 一意制約、状態制約、楽観ロック競合 |
| 413 | リクエスト本文が100KBを超過 |
| 422 | 値は正しい形式だが業務ルール違反 |
| 429 | 認証試行・APIレート超過 |
| 500 | 想定外エラー。内部情報は返さない |

## 2. 認証API

| ID | Method / Path | 認証 | 概要 |
| --- | --- | --- | --- |
| AUTH-01 | `POST /auth/login` | 不要 | ログイン、Token発行 |
| AUTH-02 | `POST /auth/refresh` | Cookie | Tokenローテーション |
| AUTH-03 | `POST /auth/logout` | Cookie | 現在セッション失効 |
| AUTH-04 | `GET /auth/me` | 必要 | 自分の情報取得 |
| AUTH-05 | `PATCH /auth/password` | 必要 | 自分のパスワード変更 |

`POST /auth/login`

```json
{ "loginId": "worker01", "password": "input-password" }
```

```json
{
  "accessToken": "jwt",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "name": "山田 太郎",
    "loginId": "worker01",
    "role": "WORKER",
    "mustChangePassword": true
  }
}
```

`PATCH /auth/password`は`currentPassword`、`newPassword`を受け取る。成功時は全Refreshセッションを失効し、`204`を返す。

## 3. ユーザーAPI（管理者）

| ID | Method / Path | 概要 |
| --- | --- | --- |
| USER-01 | `GET /users` | 検索、role/status絞り込み、ページング |
| USER-02 | `POST /users` | ユーザー作成と仮パスワード発行 |
| USER-03 | `GET /users/:id` | 詳細取得 |
| USER-04 | `PATCH /users/:id` | 名前、loginId、roleを更新 |
| USER-05 | `PATCH /users/:id/status` | 利用停止・再有効化 |
| USER-06 | `POST /users/:id/temporary-password` | 仮パスワード再発行 |

作成リクエストは`name`、`loginId`、`role`を受け取る。作成・再発行レスポンスだけに`temporaryPassword`を含める。更新は`version`必須とする。

## 4. 作業カテゴリAPI（管理者）

| ID | Method / Path | 概要 |
| --- | --- | --- |
| CAT-01 | `GET /categories` | 検索、status絞り込み、一覧取得 |
| CAT-02 | `POST /categories` | 作成 |
| CAT-03 | `GET /categories/:id` | 詳細取得 |
| CAT-04 | `PATCH /categories/:id` | name、displayOrder更新 |
| CAT-05 | `PATCH /categories/:id/status` | 利用停止・再有効化 |

作成・更新項目は`name`、`displayOrder`。通常の作成は`categoryType=WORK`とし、`COMMON`はSeedだけで作成する。更新・状態変更は`version`必須とし、`COMMON`の名称変更・利用停止は拒否する。

## 5. 道具API

| ID | Method / Path | 権限 | 概要 |
| --- | --- | --- | --- |
| TOOL-01 | `GET /tools` | 全ユーザー | 検索、categoryId/status絞り込み、ページング |
| TOOL-02 | `POST /tools` | 管理者 | 作成 |
| TOOL-03 | `GET /tools/:id` | 全ユーザー | 詳細取得 |
| TOOL-04 | `PATCH /tools/:id` | 管理者 | name、categoryId、stockQuantity、displayOrder更新 |
| TOOL-05 | `PATCH /tools/:id/status` | 管理者 | 利用停止・再有効化 |

`GET /tools`は共通ページング形式に加え、絞り込みと管理フォームで使用する全カテゴリの選択肢を`categories`へ返す。現在ページに道具がないカテゴリも選べるよう、道具の`items`とは独立して返す。

```json
{
  "items": [],
  "categories": [
    {
      "id": "uuid",
      "name": "清掃",
      "categoryType": "WORK",
      "status": "ACTIVE",
      "displayOrder": 10
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

```json
{
  "name": "インパクトドライバー",
  "categoryId": "uuid",
  "stockQuantity": 3,
  "displayOrder": 10
}
```

## 6. 日別チェックAPI

| ID | Method / Path | 権限 | 概要 |
| --- | --- | --- | --- |
| CHECK-01 | `GET /daily-checklists/:date` | 全ユーザー | 既存の日別チェックと全時間帯を取得。暗黙作成しない |
| CHECK-02 | `PUT /daily-checklists/:date` | 全ユーザー | 作成方式と時間帯別カテゴリを指定して冪等作成・取得 |
| CHECK-03 | `PATCH /daily-checklists/:date/periods/:period/items/:itemId` | 全ユーザー | 時間帯内の数量・チェック更新 |
| CHECK-04 | `POST /daily-checklists/:date/periods/:period/categories` | 全ユーザー | 未選択の有効な作業カテゴリと道具を追加 |
| CHECK-05 | `PATCH /daily-checklists/:date/configuration` | 全ユーザー | 今日・未来日の時間帯・作業内容を新版へ置き換える |
| CHECK-06 | `DELETE /daily-checklists/:date` | 全ユーザー | 今日・未来日の現行版を取り消し、同日の再作成を可能にする |

作成リクエスト（午前・午後）:

```json
{
  "scheduleMode": "SPLIT",
  "periods": [
    { "period": "MORNING", "categoryIds": ["grass-category-uuid"] },
    { "period": "AFTERNOON", "categoryIds": ["car-wash-category-uuid"] }
  ]
}
```

- `FULL_DAY`は`periods`に`FULL_DAY`を1件、`SPLIT`は`MORNING`と`AFTERNOON`を各1件必須とする。
- 各時間帯の`categoryIds`は有効な`WORK`カテゴリを1件以上指定する。`COMMON`はAPIが自動追加するため明示指定しない。
- 同じ作成方式の再送は、後からカテゴリが追加されていても現在の表を返し、リクエスト中のカテゴリを追加しない。作成済みの日付へ異なる方式を送った場合は`409 CHECKLIST_ALREADY_CONFIGURED`とする。

取得レスポンス:

```json
{
  "id": "uuid",
  "version": 1,
  "workDate": "2026-07-21",
  "scheduleMode": "SPLIT",
  "editable": true,
  "periods": [
    {
      "id": "uuid",
      "period": "MORNING",
      "categories": [
        { "sourceCategoryId": "uuid", "categoryName": "草取り" }
      ],
      "items": [
        {
          "id": "uuid",
          "sourceToolId": "uuid",
          "toolName": "草刈機",
          "categoryName": "草取り",
          "stockQuantity": 2,
          "takeoutQuantity": 1,
          "checked": true,
          "version": 4,
          "updatedAt": "2026-07-21T01:30:00Z"
        }
      ]
    }
  ]
}
```

更新リクエスト:

```json
{ "takeoutQuantity": 2, "checked": true, "version": 3 }
```

- APIは数量0なら`checked=false`へ正規化する。数量0で`checked=true`を明示した場合は`422`とする。
- バージョン不一致時は`409`の`details.currentItem`へ最新値を含める。

設定変更リクエストは作成リクエストへ次を追加する。

```json
{
  "checklistId": "current-checklist-uuid",
  "version": 1,
  "confirmDataLoss": true,
  "scheduleMode": "FULL_DAY",
  "periods": [
    { "period": "FULL_DAY", "categoryIds": ["cleaning-category-uuid"] }
  ]
}
```

削除リクエスト:

```json
{ "checklistId": "current-checklist-uuid", "version": 1, "confirmDataLoss": true }
```

- 設定変更は旧版を`CANCELLED`にして新版を作成し、同じ時間帯・同じ道具の入力値だけを引き継ぐ。
- 入力済み内容があり`confirmDataLoss=false`の場合、設定変更は`409 CHECKLIST_RECONFIGURATION_DATA_LOSS`、削除は`409 CHECKLIST_CANCELLATION_DATA_LOSS`とする。
- 現行版の`id`または`version`が一致しない場合は`409 CHECKLIST_UPDATE_CONFLICT`とし、別利用者の変更を上書きしない。
- `DELETE`成功時は204を返す。取消済み版は通常の`GET`対象外だがDBには保持する。
- カテゴリ追加は`{ "categoryIds": ["uuid"] }`を受け取り、無効・`COMMON`・選択済みカテゴリ、重複道具、過去日を拒否する。

## 7. ヘルスチェック

`GET /api/health`は認証不要で、正常時`200 {"status":"ok"}`を返す。DBや秘密情報の詳細は公開せず、Cloudflare Worker・ContainerまたはALBの死活監視に必要な最小情報だけを返す。
