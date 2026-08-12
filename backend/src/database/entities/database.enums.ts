/** ユーザーが実行できる操作範囲を表す。 */
export enum UserRole {
  ADMIN = 'ADMIN',
  WORKER = 'WORKER',
}

/** 物理削除せず、業務データを残したまま利用可否を切り替える。 */
export enum RecordStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/** COMMONはすべての日別チェックへ自動追加する特別なカテゴリ。 */
export enum CategoryType {
  WORK = 'WORK',
  COMMON = 'COMMON',
}

/** 日別チェックを1日通しで使うか、午前・午後へ分けるかを表す。 */
export enum ScheduleMode {
  FULL_DAY = 'FULL_DAY',
  SPLIT = 'SPLIT',
}

/** 日別チェック内の時間帯。scheduleModeとの整合性はService層でも検証する。 */
export enum ChecklistPeriodType {
  FULL_DAY = 'FULL_DAY',
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
}
