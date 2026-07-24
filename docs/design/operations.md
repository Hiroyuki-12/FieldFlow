# ログ・監視・バックアップ設計

## 1. ログ方針

NestJSは1イベント1行のJSONを標準出力へ出し、ECSの`awslogs`ドライバーでCloudWatch Logsへ送る。業務データの完全な内容ではなく、障害調査とセキュリティ追跡に必要なメタデータを記録する。

```json
{
  "timestamp": "2026-07-21T01:30:00.000Z",
  "level": "info",
  "service": "fieldflow-backend",
  "environment": "prod",
  "requestId": "01J...",
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

## 3. 記録禁止・マスキング

- パスワード、仮パスワード、passwordHash
- Access/Refresh Token、Authorization、Cookie、JWT鍵
- DBパスワード、SSM値、Terraform秘密値
- リクエスト・レスポンス本文の丸ごと出力
- loginIdの不要な全文出力。必要時はuserIdを使用する。

例外は利用者向けメッセージと内部causeを分け、productionレスポンスへstack traceやSQLを返さない。

## 4. requestId

- CloudFront由来のIDが利用できても、アプリ入口でULID等のrequestIdを必ず確定する。
- レスポンスヘッダー`X-Request-Id`とエラー本文に返す。
- Controller、Service、DBエラーを同じrequestIdで検索できるようAsyncLocalStorage等で伝播する。

## 5. 監視とアラーム

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

- CloudWatch Logsは30日保持する。学習完了後の費用見直し対象とする。
- RDS自動バックアップは7日保持し、暗号化する。
- 復旧訓練では別DBへ復元し、Migration状態、ログイン、日別表取得を確認する。本番DBを上書きしない。
- S3 frontendは再ビルド可能な成果物であり、ソースとlockfileを正とする。

## 7. 障害調査順序

1. CloudFront/ALBのHTTPステータスと到達性を確認する。
2. ECS Service、Task、Deployment、health状態を確認する。
3. requestIdでCloudWatch Logsを検索する。
4. RDS接続数・容量・イベント、SSM/ECR/IAM/SGを確認する。
5. 影響、原因、暫定対応、恒久対応を記録する。

AWSの作成・更新・停止やTerraform apply/destroyは、対象と影響を説明してユーザー承認後に行う。
