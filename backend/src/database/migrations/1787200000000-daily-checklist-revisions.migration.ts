import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 日別表を物理削除せず、設定変更前・削除前の内容を履歴として残せる構造へ変更する。
 * ACTIVE行だけ値を持つ列へ一意制約を付け、同じ日付の履歴を複数保持しても現行版は1件に限定する。
 */
export class DailyChecklistRevisions1787200000000
  implements MigrationInterface
{
  name = 'DailyChecklistRevisions1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 旧制約を先に外し、取消履歴と新しい現行版が同じwork_dateを持てるようにする。
    await queryRunner.query(
      'ALTER TABLE `daily_checklists` DROP INDEX `uq_daily_checklists_work_date`',
    );
    await queryRunner.query(`
      ALTER TABLE \`daily_checklists\`
        ADD COLUMN \`status\` enum('ACTIVE','CANCELLED') NOT NULL DEFAULT 'ACTIVE' AFTER \`schedule_mode\`,
        ADD COLUMN \`active_work_date\` date NULL AFTER \`status\`,
        ADD COLUMN \`cancelled_by_user_id\` char(36) NULL AFTER \`created_by_user_id\`,
        ADD COLUMN \`cancelled_at\` datetime(6) NULL AFTER \`cancelled_by_user_id\`,
        ADD COLUMN \`version\` int unsigned NOT NULL DEFAULT 1 AFTER \`cancelled_at\`
    `);
    // 既存行はすべて現行版なので、一意制約を付ける前に検索用日付を移行する。
    await queryRunner.query(
      'UPDATE `daily_checklists` SET `active_work_date` = `work_date`',
    );
    await queryRunner.query(`
      ALTER TABLE \`daily_checklists\`
        ADD CONSTRAINT \`uq_daily_checklists_active_work_date\` UNIQUE (\`active_work_date\`),
        ADD CONSTRAINT \`chk_daily_checklists_active_work_date\`
          CHECK ((\`status\` = 'ACTIVE' AND \`active_work_date\` IS NOT NULL
              AND \`active_work_date\` = \`work_date\`)
            OR (\`status\` = 'CANCELLED' AND \`active_work_date\` IS NULL)),
        ADD INDEX \`idx_daily_checklists_cancelled_by\` (\`cancelled_by_user_id\`),
        ADD CONSTRAINT \`fk_daily_checklists_cancelled_by\`
          FOREIGN KEY (\`cancelled_by_user_id\`) REFERENCES \`users\` (\`id\`)
          ON DELETE RESTRICT ON UPDATE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 旧構造は同日履歴を保持できない。rollback時は子→親の順で取消版だけを除去して制約を戻す。
    await queryRunner.query(`
      DELETE item FROM \`daily_checklist_items\` item
      INNER JOIN \`daily_checklist_periods\` period ON period.id = item.period_id
      INNER JOIN \`daily_checklists\` checklist ON checklist.id = period.checklist_id
      WHERE checklist.status = 'CANCELLED'
    `);
    await queryRunner.query(`
      DELETE period_category FROM \`daily_checklist_period_categories\` period_category
      INNER JOIN \`daily_checklist_periods\` period ON period.id = period_category.period_id
      INNER JOIN \`daily_checklists\` checklist ON checklist.id = period.checklist_id
      WHERE checklist.status = 'CANCELLED'
    `);
    await queryRunner.query(`
      DELETE period FROM \`daily_checklist_periods\` period
      INNER JOIN \`daily_checklists\` checklist ON checklist.id = period.checklist_id
      WHERE checklist.status = 'CANCELLED'
    `);
    await queryRunner.query(
      "DELETE FROM `daily_checklists` WHERE `status` = 'CANCELLED'",
    );
    await queryRunner.query(`
      ALTER TABLE \`daily_checklists\`
        DROP FOREIGN KEY \`fk_daily_checklists_cancelled_by\`,
        DROP CHECK \`chk_daily_checklists_active_work_date\`,
        DROP INDEX \`idx_daily_checklists_cancelled_by\`,
        DROP INDEX \`uq_daily_checklists_active_work_date\`,
        DROP COLUMN \`version\`,
        DROP COLUMN \`cancelled_at\`,
        DROP COLUMN \`cancelled_by_user_id\`,
        DROP COLUMN \`active_work_date\`,
        DROP COLUMN \`status\`,
        ADD CONSTRAINT \`uq_daily_checklists_work_date\` UNIQUE (\`work_date\`)
    `);
  }
}
