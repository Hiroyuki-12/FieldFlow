# トレーサビリティ

## 要件から設計・テストへの対応

| 要件ID | 要件 | 画面 | API | DB | テスト |
| --- | --- | --- | --- | --- | --- |
| REQ-AUTH-01 | ID/PWログイン | SCR-01 | AUTH-01 | users | UT/IT/E2E-AUTH |
| REQ-AUTH-02 | Access＋Refresh | SCR-01,04 | AUTH-01〜03 | refresh_sessions | IT-AUTH, E2E-AUTH-02 |
| REQ-AUTH-03 | 初回PW変更 | SCR-02 | AUTH-05 | users.must_change_password | UT/IT-AUTH, E2E-AUTH-01 |
| REQ-USER-01 | 管理者のユーザー管理 | SCR-21 | USER-01〜06 | users | UT/IT-USER, E2E-ADMIN |
| REQ-USER-02 | 最後の管理者保護 | SCR-21 | USER-04,05 | users | UT/IT-USER |
| REQ-CAT-01 | 作業カテゴリ・共通カテゴリ管理 | SCR-22 | CAT-01〜05 | categories | UT/IT-CAT, E2E-ADMIN-01 |
| REQ-CAT-02 | 使用中カテゴリ停止拒否 | SCR-22 | CAT-05 | categories, tools | UT/IT-CAT |
| REQ-TOOL-01 | 道具閲覧・管理 | SCR-23 | TOOL-01〜05 | tools | UT/IT-TOOL, E2E-ADMIN |
| REQ-TOOL-02 | マスター在庫と持出数分離 | SCR-11,23 | TOOL-*, CHECK-* | tools, daily_checklist_items | IT-CHECK |
| REQ-CHECK-01 | ホームから1日通し／午前・午後の共有表を作成 | SCR-10,11 | CHECK-01,02 | daily_checklists, daily_checklist_periods | IT-CHECK, E2E-CHECK-01 |
| REQ-CHECK-02 | 作業カテゴリ・道具のスナップショット | SCR-11 | CHECK-02 | daily_checklist_period_categories, daily_checklist_items | IT-CHECK |
| REQ-CHECK-03 | 数量・チェック自動保存 | SCR-11 | CHECK-03 | daily_checklist_items | UT/IT/E2E-CHECK |
| REQ-CHECK-04 | 時間帯への作業カテゴリ追加 | SCR-11 | CHECK-04 | daily_checklist_period_categories, daily_checklist_items | IT-CHECK, E2E-CHECK-02 |
| REQ-CHECK-05 | 過去日閲覧のみ | SCR-10,11 | CHECK-01〜04 | work_date | UT/IT-CHECK, E2E-CHECK-03 |
| REQ-CHECK-06 | 同時更新検知 | SCR-11 | CHECK-03 | version | IT-CHECK |
| NFR-PERF-01 | 20同時・p95 500ms | — | AUTH/TOOL/CHECK | index全般 | PERF-CHECK/MASTER |
| NFR-SEC-01 | RBAC・秘密保護 | 全保護画面 | 全保護API | password/token hash | IT-SEC, E2E-ADMIN-02 |
| NFR-OPS-01 | requestId・JSONログ | エラー表示 | 全API | — | logging integration |

## レビュー規則

- 要件を追加・変更したPRでは、この表と該当する機能・API・テストIDを同時に更新する。
- 実装が未完了のテストIDはテスト戦略上の予定を示す。実装後は実ファイルへのリンクへ置き換える。
- MVP対象外を実装へ混入させず、必要になった場合は新Issueで要件から追加する。
