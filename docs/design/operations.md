# ログ・監視・バックアップ設計

## 1. ログ方針

NestJSは1イベント1行のJSONを標準出力へ出す。Cloudflare公開環境ではContainerのログ基盤、AWS課題環境ではECSの`awslogs`ドライバーからCloudWatch Logsへ送る。業務データの完全な内容ではなく、障害調査とセキュリティ追跡に必要なメタデータを記録する。

```json
{
  "timestamp": "2026-07-21T01:30:00.000Z",
  "level": "info",
  "service": "fieldflow-backend",
  "environment": "prod",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "event": "http_request_completed",
  "method": "PATCH",
  "path": "/api/v1/daily-checklists/:date/items/:itemId",
  "statusCode": 200,
  "durationMs": 42,
  "userId": "uuid"
}
```

## 2. 記録するイベント

| 分類 | 例 | レベル |
| --- | --- | --- |
| HTTP | method、テンプレート化path、status、duration、requestId | info / 5xxはerror |
| 認証 | login成功・失敗、refresh再利用、logout | info / warn |
| 管理操作 | ユーザー・カテゴリ・道具の作成、変更、利用停止 | info |
| 競合 | 楽観ロック、一意制約、業務ルール拒否 | warn |
| DB・外部依存 | 接続失敗、timeout、Migration失敗 | error |
| 起動停止 | version、environment、起動成功・失敗 | info / error |

管理操作はactorの`userId`、対象種別、対象ID、結果を記録する。チェック項目の更新者を業務画面へ表示する履歴はMVP対象外だが、セキュリティ調査用アクセスログには認証ユーザーIDを含める。

ロードマップ13では`authentication_login`、`authentication_refresh`、`authentication_logout`、`authentication_password_change`と`management_operation`を実装した。通常の成功は`info`、認証失敗・Refresh再利用・409・429は`warn`、500は`error`とする。`LOG_LEVEL`で環境ごとの出力閾値を設定する。

## 3. 記録禁止・マスキング

- パスワード、仮パスワード、passwordHash
- Access/Refresh Token、Authorization、Cookie、JWT鍵
- DBパスワード、Cloudflare Secrets、Aiven認証情報、SSM値、Terraform秘密値
- リクエスト・レスポンス本文の丸ごと出力
- loginIdの不要な全文出力。必要時はuserIdを使用する。

例外は利用者向けメッセージと内部causeを分け、productionレスポンスへstack traceやSQLを返さない。

## 4. requestId

- Worker・CloudFrontなどのProxy由来のIDや利用者が送った値を採用せず、アプリ入口でUUID v4のrequestIdを必ず生成する。外部入力によるログ汚染とID衝突を防ぐためである。
- レスポンスヘッダー`X-Request-Id`とエラー本文に返す。
- Node.js標準の`AsyncLocalStorage`で伝播し、Controller、Service、DBエラー、認証・管理操作を同じrequestIdで検索できるようにする。
- アクセスログのpathはRoute Templateを使い、UUID、日付、Query、リクエスト・レスポンス本文を記録しない。

## 5. 監視とアラーム

### Cloudflare公開環境

| 監視 | 条件の初期値 | 対応 |
| --- | --- | --- |
| Worker / Container 5xx | 5分で5件以上 | requestId、起動ログ、直近デプロイ確認 |
| Container起動失敗 | 1件以上 | イメージ、Secrets、Aiven TLS接続確認 |
| API latency | p95 1秒超が継続 | cold start、slow API、DB query確認 |
| Aiven connections | 契約上限80%以上 | connection pool、接続リーク確認 |
| Aiven storage | 契約上限80%以上 | 容量・不要データ・プラン確認 |

通知方法と実際に取得できる指標はCloudflare・Aiven設定時に確認し、無料枠や契約プランで利用できる範囲を設計書へ追記する。

### AWS課題環境

| 監視 | 条件の初期値 | 対応 |
| --- | --- | --- |
| ALB 5xx | 5分で5件以上 | ECS・アプリログ確認 |
| Target unhealthy | 1以上が2回継続 | health、起動ログ、DB接続確認 |
| ECS task count | desired未満 | ECS event、ECR、SSM確認 |
| CPU / Memory | 80%以上が10分 | 負荷・リーク・task size確認 |
| API latency | ALB p95 1秒超が継続 | slow API・DB query確認 |
| RDS storage | 空き20%未満 | 容量拡張、不要データ調査 |
| RDS connections | 上限80%以上 | connection pool確認 |

通知先はAWS構築時にSNS等で設定し、設計書へ実値を追記する。

## 6. 保持・バックアップ

- Cloudflare・Aivenのログは利用プランの保持期間を確認し、必要な障害情報とデプロイ時刻をREADMEまたは提出記録へ残す。
- Aivenは利用プランで提供されるバックアップ・復旧条件を設定時に確認する。無料枠へバックアップ保証を決め打ちしない。
- CloudWatch Logsは30日保持する。AWS学習完了後の費用見直し対象とする。
- RDS自動バックアップは7日保持し、暗号化する。
- 復旧訓練では別DBへ復元し、Migration状態、ログイン、日別表取得を確認する。本番DBを上書きしない。
- S3 frontendは再ビルド可能な成果物であり、ソースとlockfileを正とする。

## 7. 障害調査順序

### Cloudflare公開環境

1. Workerの画面・API到達性とHTTPステータスを確認する。
2. Worker・Containerのデプロイ状態、起動ログ、Secrets設定を確認する。
3. requestIdでアプリログを検索する。
4. Aivenの接続数、容量、サービス状態、TLS設定を確認する。
5. 影響、原因、暫定対応、恒久対応を記録する。

### AWS課題環境

1. CloudFront/ALBのHTTPステータスと到達性を確認する。
2. ECS Service、Task、Deployment、health状態を確認する。
3. requestIdでCloudWatch Logsを検索する。
4. RDS接続数・容量・イベント、SSM/ECR/IAM/SGを確認する。
5. 影響、原因、暫定対応、恒久対応を記録する。

Cloudflare・Aivenのサービス作成・Secrets更新・デプロイ、およびAWSの作成・更新・停止やTerraform apply/destroyは、対象と影響を説明してユーザー承認後に行う。
