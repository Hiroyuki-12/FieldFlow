import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FieldFlow MVPの全テーブルを作る初回Migration。
 * Entityの自動同期へ依存せず、レビュー済みのSQLだけを各環境へ同じ順序で適用する。
 *
 * 作成順は外部キーの依存関係に合わせている。
 * まず参照されるマスター／親テーブルを作り、その後に参照する子テーブルを作ることで、
 * 空のMySQLへこのMigrationだけを適用しても外部キーエラーにならないようにしている。
 */
export class InitialSchema1786000000000 implements MigrationInterface {
  name = 'InitialSchema1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 認証と監査情報の起点になるユーザーを最初に作る。
    // login_idの一意制約、ロック情報、楽観ロック用versionまでDB構造として固定する。
    await queryRunner.query(`
      CREATE TABLE \`users\` (
        \`id\` char(36) NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`login_id\` varchar(50) NOT NULL,
        \`password_hash\` varchar(255) NOT NULL,
        \`role\` enum('ADMIN', 'WORKER') NOT NULL,
        \`status\` enum('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
        \`must_change_password\` boolean NOT NULL DEFAULT true,
        \`auth_version\` int unsigned NOT NULL DEFAULT 1,
        \`failed_login_count\` int unsigned NOT NULL DEFAULT 0,
        \`locked_until\` datetime(6) NULL,
        \`version\` int unsigned NOT NULL DEFAULT 1,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        CONSTRAINT \`pk_users\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`uq_users_login_id\` UNIQUE (\`login_id\`),
        INDEX \`idx_users_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // Refresh Tokenは端末ごとの失効・ローテーションを管理するためUserから分離する。
    // Token本体ではなく64文字のハッシュを保存し、漏洩時にそのまま再利用されるのを防ぐ。
    await queryRunner.query(`
      CREATE TABLE \`refresh_sessions\` (
        \`id\` char(36) NOT NULL,
        \`user_id\` char(36) NOT NULL,
        \`token_hash\` char(64) NOT NULL,
        \`expires_at\` datetime(6) NOT NULL,
        \`revoked_at\` datetime(6) NULL,
        \`replaced_by_session_id\` char(36) NULL,
        \`user_agent\` varchar(512) NULL,
        \`ip_address\` varchar(45) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        CONSTRAINT \`pk_refresh_sessions\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`uq_refresh_sessions_token_hash\` UNIQUE (\`token_hash\`),
        INDEX \`idx_refresh_sessions_user_validity\` (\`user_id\`, \`revoked_at\`, \`expires_at\`),
        INDEX \`idx_refresh_sessions_replaced_by\` (\`replaced_by_session_id\`),
        CONSTRAINT \`fk_refresh_sessions_user\`
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_refresh_sessions_replaced_by\`
          FOREIGN KEY (\`replaced_by_session_id\`) REFERENCES \`refresh_sessions\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // 道具の親となるカテゴリを先に作る。
    // 名称の一意性と表示順の範囲は、APIを通さない操作に対してもDBで保証する。
    await queryRunner.query(`
      CREATE TABLE \`categories\` (
        \`id\` char(36) NOT NULL,
        \`name\` varchar(50) NOT NULL,
        \`display_order\` int unsigned NOT NULL DEFAULT 0,
        \`category_type\` enum('WORK', 'COMMON') NOT NULL,
        \`status\` enum('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
        \`version\` int unsigned NOT NULL DEFAULT 1,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        CONSTRAINT \`pk_categories\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`uq_categories_name\` UNIQUE (\`name\`),
        CONSTRAINT \`chk_categories_display_order\` CHECK (\`display_order\` BETWEEN 0 AND 9999),
        INDEX \`idx_categories_status_display_order\` (\`status\`, \`display_order\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // 道具は必ず既存カテゴリに所属させ、カテゴリ削除時の連鎖削除は行わない。
    // 過去の日別表から参照されるため、削除ではなくstatusによる利用停止を前提にする。
    await queryRunner.query(`
      CREATE TABLE \`tools\` (
        \`id\` char(36) NOT NULL,
        \`category_id\` char(36) NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`stock_quantity\` int unsigned NOT NULL,
        \`display_order\` int unsigned NOT NULL DEFAULT 0,
        \`status\` enum('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
        \`version\` int unsigned NOT NULL DEFAULT 1,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        CONSTRAINT \`pk_tools\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`uq_tools_name\` UNIQUE (\`name\`),
        CONSTRAINT \`chk_tools_stock_quantity\` CHECK (\`stock_quantity\` BETWEEN 0 AND 9999),
        CONSTRAINT \`chk_tools_display_order\` CHECK (\`display_order\` BETWEEN 0 AND 9999),
        INDEX \`idx_tools_status_category_display_order\` (\`status\`, \`category_id\`, \`display_order\`),
        INDEX \`idx_tools_category_id\` (\`category_id\`),
        CONSTRAINT \`fk_tools_category\`
          FOREIGN KEY (\`category_id\`) REFERENCES \`categories\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // 日別表のヘッダーを作る。work_dateを一意にして「1日1表」をDBの最終防衛線にする。
    // 作成者は監査情報なので、ユーザーが参照中なら物理削除を拒否する。
    await queryRunner.query(`
      CREATE TABLE \`daily_checklists\` (
        \`id\` char(36) NOT NULL,
        \`work_date\` date NOT NULL,
        \`schedule_mode\` enum('FULL_DAY', 'SPLIT') NOT NULL,
        \`created_by_user_id\` char(36) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        CONSTRAINT \`pk_daily_checklists\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`uq_daily_checklists_work_date\` UNIQUE (\`work_date\`),
        INDEX \`idx_daily_checklists_created_by\` (\`created_by_user_id\`),
        CONSTRAINT \`fk_daily_checklists_created_by\`
          FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // 1日を終日、または午前・午後の操作単位へ分ける。
    // 同じ表・同じ時間帯の組み合わせを一意にし、二重作成を防止する。
    await queryRunner.query(`
      CREATE TABLE \`daily_checklist_periods\` (
        \`id\` char(36) NOT NULL,
        \`checklist_id\` char(36) NOT NULL,
        \`period\` enum('FULL_DAY', 'MORNING', 'AFTERNOON') NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        CONSTRAINT \`pk_daily_checklist_periods\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`uq_daily_checklist_periods_checklist_period\` UNIQUE (\`checklist_id\`, \`period\`),
        CONSTRAINT \`fk_daily_checklist_periods_checklist\`
          FOREIGN KEY (\`checklist_id\`) REFERENCES \`daily_checklists\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // 時間帯ごとに選択したカテゴリと、選択時点の名称・表示順を履歴として保存する。
    // マスター変更後も当時の表示を再現できるよう、参照IDと当時値の両方を持つ。
    await queryRunner.query(`
      CREATE TABLE \`daily_checklist_period_categories\` (
        \`id\` char(36) NOT NULL,
        \`period_id\` char(36) NOT NULL,
        \`source_category_id\` char(36) NOT NULL,
        \`category_name_snapshot\` varchar(50) NOT NULL,
        \`display_order_snapshot\` int unsigned NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        CONSTRAINT \`pk_daily_checklist_period_categories\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`uq_period_categories_period_source\` UNIQUE (\`period_id\`, \`source_category_id\`),
        INDEX \`idx_period_categories_source_category\` (\`source_category_id\`),
        CONSTRAINT \`fk_period_categories_period\`
          FOREIGN KEY (\`period_id\`) REFERENCES \`daily_checklist_periods\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_period_categories_source_category\`
          FOREIGN KEY (\`source_category_id\`) REFERENCES \`categories\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // 日別表で実際に操作する道具行を最後に作る。
    // 在庫上限と「数量0でchecked=trueは禁止」をCHECK制約でも保証し、
    // Serviceの不具合や手動SQLがあっても矛盾したチェック状態を保存させない。
    await queryRunner.query(`
      CREATE TABLE \`daily_checklist_items\` (
        \`id\` char(36) NOT NULL,
        \`period_id\` char(36) NOT NULL,
        \`source_tool_id\` char(36) NOT NULL,
        \`tool_name_snapshot\` varchar(100) NOT NULL,
        \`category_name_snapshot\` varchar(50) NOT NULL,
        \`stock_quantity_snapshot\` int unsigned NOT NULL,
        \`takeout_quantity\` int unsigned NOT NULL DEFAULT 0,
        \`checked\` boolean NOT NULL DEFAULT false,
        \`display_order_snapshot\` int unsigned NOT NULL,
        \`version\` int unsigned NOT NULL DEFAULT 1,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        CONSTRAINT \`pk_daily_checklist_items\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`uq_daily_checklist_items_period_source\` UNIQUE (\`period_id\`, \`source_tool_id\`),
        CONSTRAINT \`chk_daily_checklist_items_takeout_quantity\`
          CHECK (\`takeout_quantity\` BETWEEN 0 AND \`stock_quantity_snapshot\`),
        CONSTRAINT \`chk_daily_checklist_items_checked_quantity\`
          CHECK (NOT (\`checked\` = 1 AND \`takeout_quantity\` = 0)),
        INDEX \`idx_daily_checklist_items_source_tool\` (\`source_tool_id\`),
        CONSTRAINT \`fk_daily_checklist_items_period\`
          FOREIGN KEY (\`period_id\`) REFERENCES \`daily_checklist_periods\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_daily_checklist_items_source_tool\`
          FOREIGN KEY (\`source_tool_id\`) REFERENCES \`tools\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // upとは逆に、外部キーで参照する子テーブルから削除する。
    // 親を先に消すとMySQLが外部キー違反で停止するため、この順序を変更しない。
    // 本番では破壊的rollbackへ安易に依存せず、主にローカル開発でのrevertを想定する。
    await queryRunner.query('DROP TABLE `daily_checklist_items`');
    await queryRunner.query('DROP TABLE `daily_checklist_period_categories`');
    await queryRunner.query('DROP TABLE `daily_checklist_periods`');
    await queryRunner.query('DROP TABLE `daily_checklists`');
    await queryRunner.query('DROP TABLE `tools`');
    await queryRunner.query('DROP TABLE `categories`');
    await queryRunner.query('DROP TABLE `refresh_sessions`');
    await queryRunner.query('DROP TABLE `users`');
  }
}
