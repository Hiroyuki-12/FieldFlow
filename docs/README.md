# FieldFlow 設計資料

## 読み方

初めて読む場合は、要件定義 → 機能定義 → 画面/API/DB → セキュリティ → デプロイ環境 → テストの順に確認する。各資料は「何を作るか」だけでなく「なぜその設計にするか」を説明できることを目的とする。

実装へ着手するときは、[MVP実装計画](implementation-plan.md)で依存関係、Issue分割、各段階の完了条件を確認する。

## 要件と機能

- [MVP要件定義](requirements.md)
- [認証機能](features/auth.md)
- [ユーザー管理](features/users.md)
- [作業カテゴリ管理](features/categories.md)
- [道具マスター管理](features/tools.md)
- [日付別チェック](features/daily-checklists.md)

## 基本・詳細設計

- [画面設計](design/screens.md)
- [API設計](design/api.md)
- [DB設計・ER図](design/database.md)
- [セキュリティ設計](design/security.md)
- [アプリケーション構成・技術スタック](design/application-architecture.md)
- [デプロイ環境の使い分け](design/deployment-strategy.md)
- [Cloudflare・Aiven公開構成](design/cloudflare-architecture.md)
- [AWS・Terraform課題提出構成](design/aws-architecture.md)
- [ログ・監視・バックアップ](design/operations.md)
- [非機能要件](design/non-functional-requirements.md)
- [テスト戦略](design/test-strategy.md)
- [CI/CD設計](design/ci-cd.md)
- [トレーサビリティ](design/traceability.md)

## 学習・レビュー

- [MVP実装計画](implementation-plan.md)
- [ロードマップ4 Backend認証・認可 実装計画](plans/roadmap-04-backend-auth.md)
- [ロードマップ5 Frontend認証・共通UI 実装計画](plans/roadmap-05-frontend-auth-ui.md)
- [ロードマップ6 ユーザー管理 実装計画](plans/roadmap-06-user-management.md)
- [ロードマップ7 作業カテゴリ管理 実装計画](plans/roadmap-07-category-management.md)
- [ロードマップ8 道具管理 実装計画](plans/roadmap-08-tool-management.md)
- [ロードマップ9 日別表の作成・取得 実装計画](plans/roadmap-09-daily-checklist-creation.md)
- [ロードマップ10 ホーム・日別表表示 実装計画](plans/roadmap-10-home-daily-checklist.md)
- [ロードマップ11 日別表の更新 実装計画](plans/roadmap-11-daily-checklist-updates.md)
- [ロードマップ12 UI・アクセシビリティ 実装計画](plans/roadmap-12-ui-accessibility.md)
- [ロードマップ13 ログ・運用・セキュリティ 実装計画](plans/roadmap-13-logging-operations-security.md)
- [ロードマップ14 Playwright E2E 実装計画](plans/roadmap-14-playwright-e2e.md)
- [ロードマップ15 k6性能試験 実装計画](plans/roadmap-15-k6-performance.md)
- [ロードマップ16 Cloudflare・Aiven公開環境 実装計画](plans/roadmap-16-cloudflare-deployment.md)
- [ロードマップ17 AWS課題提出環境 実装計画](plans/roadmap-17-aws-deployment.md)
- [理解度チェック](understanding-check.md)

## 主要な対応関係

| 要件領域 | 機能定義 | 画面 | API | DB | 主なテスト |
| --- | --- | --- | --- | --- | --- |
| 認証 | `features/auth.md` | SCR-01〜04 | AUTH-* | users / refresh_sessions | UT-AUTH / IT-AUTH / E2E-AUTH |
| ユーザー | `features/users.md` | SCR-21 | USER-* | users | UT-USER / IT-USER / E2E-ADMIN |
| 作業カテゴリ | `features/categories.md` | SCR-22 | CAT-* | categories | UT-CAT / IT-CAT / E2E-ADMIN |
| 道具 | `features/tools.md` | SCR-23 | TOOL-* | tools | UT-TOOL / IT-TOOL / E2E-ADMIN |
| 日別チェック | `features/daily-checklists.md` | SCR-10,11 | CHECK-* | daily_checklists / daily_checklist_periods / daily_checklist_period_categories / daily_checklist_items | UT-CHECK / IT-CHECK / E2E-CHECK / [PERF-CHECK](../perf/scenarios/checklist.ts) |

完全な対応表は[トレーサビリティ](design/traceability.md)を参照する。
