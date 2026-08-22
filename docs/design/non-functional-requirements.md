# 非機能要件

## 1. 性能・規模

| 項目 | MVP目標 |
| --- | --- |
| 登録ユーザー | 50人 |
| 同時利用 | 20ユーザー |
| 主要API | k6負荷時p95 500ms以下 |
| エラー率 | 1%未満（意図した4xxを除く） |
| 画面初期表示 | 通常回線で2秒以内を目標 |
| 一覧ページサイズ | 既定20、最大100 |

主要APIはログイン、道具一覧、日別表取得・作成、日別項目更新とする。負荷試験結果は実行環境・データ件数と共に記録する。

ロードマップ15のローカル基準測定では、最大20 VUで日別表取得・更新のp95 21.49ms、道具一覧のp95 29.81ms、想定外エラー率0%を確認した。これは同一Mac内の値であり、Cloudflare・Aiven公開環境やAWS課題環境の性能保証ではない。測定条件と全結果は[ロードマップ15](../plans/roadmap-15-k6-performance.md)を参照する。

## 2. 可用性・復旧

- 学習用MVPのためSLAは設定しない。
- Cloudflare公開環境はContainerのスリープとコールドスタートを許容し、Aiven無料枠のSLAを前提にしない。長期停止通知を確認し、必要時に手動で復旧する。
- ECSはhealth失敗タスクを自動置換するが、desired count 1のためデプロイ・再起動時の短時間停止を許容する。
- RDSはSingle-AZ、自動バックアップ7日。障害復旧は手動とする。
- 目標RPO/RTOは保証しない。実運用導入前にMulti-AZと復旧訓練を再評価する。

## 3. セキュリティ

- 利用者からCloudflare WorkerまたはCloudFrontまでHTTPSを強制する。
- JWT、Argon2id、RBAC、HttpOnly Cookie、入力検証、レート制限を実装する。
- Cloudflare Secrets、Aiven、RDS、S3、SSM、CloudWatchは公開範囲と権限を必要最小限にする。
- 秘密値・Token・パスワード・リクエスト本文をログへ出さない。
- 詳細は[セキュリティ設計](security.md)を参照する。

## 4. ユーザビリティ・アクセシビリティ

- 360px〜1920pxを対象とし、Chrome、Safari、Firefoxのサポート中最新版を確認する。
- スマートフォンで日別チェックの主要操作を片手で行えるサイズにする。
- WCAG 2.2 AA相当のコントラスト、ラベル、フォーカス、キーボード操作、エラー通知を主要画面で確認する。
- 保存中・成功・失敗・競合を、色だけでなく文字で表示する。

## 5. 保守性

- TypeScript strict、ESLint、Prettier、機能別モジュールで責任を分ける。
- DB変更はTypeORM Migration、CloudflareはWrangler設定、AWSはTerraform、依存はlockfileで再現する。
- 本番コードと同じPRに単体・結合テストを含める。
- APIはOpenAPIから確認でき、要件・API・DB・テストをトレーサビリティ表で追跡できる。

## 6. 運用性

- JSON構造化ログとrequestIdで、画面エラーからCloudflare ContainerログまたはCloudWatchまで追跡できる。
- ローカル、CI、Cloudflare公開環境、AWS課題環境でBackend portとMySQLメジャーバージョンを統一する。
- mainへの直接pushを禁止し、Issue→ブランチ→PR→承認付きデプロイで変更する。
- 破壊的なAWS・Terraform操作は、planと影響を確認して明示承認後に行う。
- Cloudflare・Aivenのサービス作成、Secrets登録、デプロイも、対象と影響を確認して明示承認後に行う。
