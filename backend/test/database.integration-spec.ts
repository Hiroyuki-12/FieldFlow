import { randomUUID } from 'node:crypto';

import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import { verify } from 'argon2';
import { DataSource } from 'typeorm';

import { createDatabaseDataSource } from '../src/database/data-source.factory';
import { CategoryType, RecordStatus, UserRole } from '../src/database/entities';
import {
  runInitialSeed,
  InitialSeedResult,
} from '../src/database/seeds/initial.seed';

jest.setTimeout(120_000);

interface CountRow {
  count: string;
}

interface UserSecretRow {
  loginId: string;
  passwordHash: string;
  mustChangePassword: number;
}

describe('Database foundation (integration)', () => {
  let container: StartedMySqlContainer;
  let dataSource: DataSource;
  let firstSeedResult: InitialSeedResult;

  const seedConfig = {
    name: '初期管理者',
    loginId: 'Admin.User',
    password: 'integration test password',
  };

  beforeAll(async () => {
    container = await new MySqlContainer('mysql:8.4.10')
      .withDatabase('fieldflow_test')
      .withUsername('fieldflow')
      .withUserPassword('fieldflow')
      .withRootPassword('fieldflow_root')
      .start();

    dataSource = createDatabaseDataSource({
      DB_HOST: container.getHost(),
      DB_PORT: String(container.getPort()),
      DB_NAME: container.getDatabase(),
      DB_USER: container.getUsername(),
      DB_PASSWORD: container.getUserPassword(),
    });
    await dataSource.initialize();
    await dataSource.runMigrations({ transaction: 'none' });
    firstSeedResult = await runInitialSeed(dataSource, seedConfig);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (container) {
      await container.stop();
    }
  });

  it('空のMySQL 8.4へ初回Migrationを適用する', async () => {
    const rows = await dataSource.query<{ tableName: string }[]>(`
      SELECT table_name AS tableName
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
    `);
    const tableNames = rows.map((row) => row.tableName).sort();

    expect(tableNames).toEqual(
      [
        'categories',
        'daily_checklist_items',
        'daily_checklist_period_categories',
        'daily_checklist_periods',
        'daily_checklists',
        'migrations',
        'refresh_sessions',
        'tools',
        'users',
      ].sort(),
    );
    await expect(
      dataSource.runMigrations({ transaction: 'none' }),
    ).resolves.toHaveLength(0);
  });

  it('Entity定義とMigration適用後のスキーマに差分がない', async () => {
    const schemaChanges = await dataSource.driver.createSchemaBuilder().log();

    expect(schemaChanges.upQueries.map((query) => query.query)).toEqual([]);
  });

  it('COMMONカテゴリと初期管理者を安全かつ冪等にSeedする', async () => {
    expect(firstSeedResult).toEqual({
      commonCategoryCreated: true,
      initialAdminCreated: true,
    });

    const secondResult = await runInitialSeed(dataSource, {
      ...seedConfig,
      name: '再実行では上書きしない名前',
      password: 'different test password',
    });
    expect(secondResult).toEqual({
      commonCategoryCreated: false,
      initialAdminCreated: false,
    });

    const [commonCount] = await dataSource.query<CountRow[]>(
      'SELECT COUNT(*) AS count FROM categories WHERE category_type = ?',
      [CategoryType.COMMON],
    );
    const [admin] = await dataSource.query<UserSecretRow[]>(
      `SELECT login_id AS loginId, password_hash AS passwordHash,
              must_change_password AS mustChangePassword
       FROM users WHERE login_id = ?`,
      ['admin.user'],
    );

    expect(Number(commonCount?.count)).toBe(1);
    expect(admin?.loginId).toBe('admin.user');
    expect(admin?.passwordHash).not.toBe(seedConfig.password);
    expect(admin?.passwordHash.startsWith('$argon2id$')).toBe(true);
    await expect(
      verify(admin?.passwordHash ?? '', seedConfig.password),
    ).resolves.toBe(true);
    expect(admin?.mustChangePassword).toBe(1);
  });

  it('一意制約、CHECK制約、外部キーで不正データを拒否する', async () => {
    const categoryId = randomUUID();
    const toolId = randomUUID();
    const checklistId = randomUUID();
    const periodId = randomUUID();
    const itemId = randomUUID();
    const [admin] = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM users WHERE login_id = ?',
      ['admin.user'],
    );

    await dataSource.query(
      `INSERT INTO categories
        (id, name, display_order, category_type, status)
       VALUES (?, 'Cleaning', 10, ?, ?)`,
      [categoryId, CategoryType.WORK, RecordStatus.ACTIVE],
    );
    await dataSource.query(
      `INSERT INTO tools
        (id, category_id, name, stock_quantity, display_order, status)
       VALUES (?, ?, 'Hammer', 3, 10, ?)`,
      [toolId, categoryId, RecordStatus.ACTIVE],
    );
    await dataSource.query(
      `INSERT INTO daily_checklists
        (id, work_date, schedule_mode, created_by_user_id)
       VALUES (?, '2026-08-06', 'FULL_DAY', ?)`,
      [checklistId, admin?.id],
    );
    await dataSource.query(
      `INSERT INTO daily_checklist_periods (id, checklist_id, period)
       VALUES (?, ?, 'FULL_DAY')`,
      [periodId, checklistId],
    );
    await dataSource.query(
      `INSERT INTO daily_checklist_period_categories
        (id, period_id, source_category_id, category_name_snapshot, display_order_snapshot)
       VALUES (?, ?, ?, 'Cleaning', 10)`,
      [randomUUID(), periodId, categoryId],
    );
    await dataSource.query(
      `INSERT INTO daily_checklist_items
        (id, period_id, source_tool_id, tool_name_snapshot, category_name_snapshot,
         stock_quantity_snapshot, takeout_quantity, checked, display_order_snapshot)
       VALUES (?, ?, ?, 'Hammer', 'Cleaning', 3, 0, false, 10)`,
      [itemId, periodId, toolId],
    );

    await expect(
      dataSource.query(
        `INSERT INTO users
          (id, name, login_id, password_hash, role, status)
         VALUES (?, '重複ユーザー', 'ADMIN.USER', 'not-a-real-hash', ?, ?)`,
        [randomUUID(), UserRole.WORKER, RecordStatus.ACTIVE],
      ),
    ).rejects.toBeDefined();
    await expect(
      dataSource.query(
        `INSERT INTO categories
          (id, name, display_order, category_type, status)
         VALUES (?, 'cleaning', 20, ?, ?)`,
        [randomUUID(), CategoryType.WORK, RecordStatus.ACTIVE],
      ),
    ).rejects.toBeDefined();
    await expect(
      dataSource.query(
        `INSERT INTO tools
          (id, category_id, name, stock_quantity, display_order, status)
         VALUES (?, ?, 'hammer', 1, 20, ?)`,
        [randomUUID(), categoryId, RecordStatus.ACTIVE],
      ),
    ).rejects.toBeDefined();
    await expect(
      dataSource.query(
        `INSERT INTO daily_checklists
          (id, work_date, schedule_mode, created_by_user_id)
         VALUES (?, '2026-08-06', 'FULL_DAY', ?)`,
        [randomUUID(), admin?.id],
      ),
    ).rejects.toBeDefined();
    await expect(
      dataSource.query(
        `INSERT INTO daily_checklist_periods (id, checklist_id, period)
         VALUES (?, ?, 'FULL_DAY')`,
        [randomUUID(), checklistId],
      ),
    ).rejects.toBeDefined();
    await expect(
      dataSource.query(
        `INSERT INTO daily_checklist_period_categories
          (id, period_id, source_category_id, category_name_snapshot, display_order_snapshot)
         VALUES (?, ?, ?, 'Cleaning', 10)`,
        [randomUUID(), periodId, categoryId],
      ),
    ).rejects.toBeDefined();
    await expect(
      dataSource.query(
        `INSERT INTO daily_checklist_items
          (id, period_id, source_tool_id, tool_name_snapshot, category_name_snapshot,
           stock_quantity_snapshot, takeout_quantity, checked, display_order_snapshot)
         VALUES (?, ?, ?, 'Hammer', 'Cleaning', 3, 1, false, 10)`,
        [randomUUID(), periodId, toolId],
      ),
    ).rejects.toBeDefined();

    await expect(
      dataSource.query(
        'UPDATE daily_checklist_items SET takeout_quantity = 4 WHERE id = ?',
        [itemId],
      ),
    ).rejects.toBeDefined();
    await expect(
      dataSource.query(
        'UPDATE daily_checklist_items SET checked = true WHERE id = ?',
        [itemId],
      ),
    ).rejects.toBeDefined();
    await expect(
      dataSource.query('DELETE FROM tools WHERE id = ?', [toolId]),
    ).rejects.toBeDefined();
  });
});
