import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import type { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AuthModule } from '../src/auth/auth.module';
import { hashPassword } from '../src/common/security/password-hashing';
import { environmentValidationSchema } from '../src/config/environment.schema';
import { configureApp } from '../src/configure-app';
import { createDatabaseDataSource } from '../src/database/data-source.factory';
import {
  CategoryType,
  ChecklistPeriodType,
  DailyChecklist,
  RecordStatus,
  ScheduleMode,
  UserRole,
} from '../src/database/entities';
import { createTypeOrmOptions } from '../src/database/typeorm.config';
import { DailyChecklistsModule } from '../src/daily-checklists/daily-checklists.module';
import type { CreateDailyChecklistDto } from '../src/daily-checklists/dto/create-daily-checklist.dto';

jest.setTimeout(120_000);

interface LoginBody {
  accessToken: string;
}

interface ChecklistBody {
  id: string;
  version: number;
  workDate: string;
  scheduleMode: ScheduleMode;
  editable: boolean;
  periods: Array<{
    id: string;
    period: ChecklistPeriodType;
    categories: Array<{
      sourceCategoryId: string;
      categoryName: string;
    }>;
    items: Array<{
      id: string;
      sourceToolId: string;
      toolName: string;
      categoryName: string;
      stockQuantity: number;
      takeoutQuantity: number;
      checked: boolean;
      version: number;
    }>;
  }>;
}

interface AuthenticatedRequestBuilder {
  delete: (path: string) => request.Test;
  get: (path: string) => request.Test;
  patch: (path: string) => request.Test;
  put: (path: string) => request.Test;
}

describe('Daily checklists API (integration)', () => {
  let container: StartedMySqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let adminToken: string;
  let workerToken: string;

  const origin = 'http://localhost:5173';
  const adminId = '11111111-1111-4111-8111-111111111111';
  const workerId = '22222222-2222-4222-8222-222222222222';
  const commonId = '33333333-3333-4333-8333-333333333333';
  const cleaningId = '44444444-4444-4abc-8abc-444444444444';
  const inspectionId = '55555555-5555-4555-8555-555555555555';
  const inactiveCategoryId = '66666666-6666-4666-8666-666666666666';
  const glovesId = '77777777-7777-4777-8777-777777777777';
  const inactiveCommonToolId = '88888888-8888-4888-8888-888888888888';
  const mopId = '99999999-9999-4999-8999-999999999999';
  const inactiveMopId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const testerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const adminPassword = 'admin password 123';
  const workerPassword = 'worker password 123';

  beforeAll(async () => {
    container = await new MySqlContainer('mysql:8.4.10')
      .withDatabase('fieldflow_daily_checklists_test')
      .withUsername('fieldflow')
      .withUserPassword('fieldflow')
      .withRootPassword('fieldflow_root')
      .start();
    Object.assign(process.env, {
      NODE_ENV: 'test',
      PORT: '8080',
      CORS_ORIGIN: origin,
      DB_HOST: container.getHost(),
      DB_PORT: String(container.getPort()),
      DB_NAME: container.getDatabase(),
      DB_USER: container.getUsername(),
      DB_PASSWORD: container.getUserPassword(),
      JWT_ACCESS_SECRET: 'integration-secret-with-at-least-32-characters',
      JWT_ACCESS_TTL_SECONDS: '900',
      REFRESH_TOKEN_TTL_SECONDS: '604800',
      COOKIE_SECURE: 'false',
    });

    dataSource = createDatabaseDataSource(process.env);
    await dataSource.initialize();
    await dataSource.runMigrations({ transaction: 'none' });
    await insertBaselineData();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          validationSchema: environmentValidationSchema,
          validationOptions: { abortEarly: false },
        }),
        TypeOrmModule.forRootAsync({
          inject: [ConfigService],
          useFactory: createTypeOrmOptions,
        }),
        AuthModule,
        DailyChecklistsModule,
      ],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    // Access Tokenは各テストで再利用し、ログイン回数がRate Limitの検証条件へ干渉しないようにする。
    adminToken = (
      (await login('admin01', adminPassword).expect(200)).body as LoginBody
    ).accessToken;
    workerToken = (
      (await login('worker01', workerPassword).expect(200)).body as LoginBody
    ).accessToken;
  });

  beforeEach(async () => {
    await dataSource.query(
      'UPDATE refresh_sessions SET replaced_by_session_id = NULL',
    );
    await dataSource.query('DELETE FROM refresh_sessions');
    await dataSource.query('DELETE FROM daily_checklist_items');
    await dataSource.query('DELETE FROM daily_checklist_period_categories');
    await dataSource.query('DELETE FROM daily_checklist_periods');
    await dataSource.query('DELETE FROM daily_checklists');
    await dataSource.query('DELETE FROM tools');
    await resetCategories();
    await insertTools();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  it('未認証、未作成日、不正な日付・Bodyを拒否して暗黙作成しない', async () => {
    const workDate = dateInTokyo(1);
    await request(app.getHttpServer() as Server)
      .get(`/api/v1/daily-checklists/${workDate}`)
      .expect(401);
    await authenticatedRequest(workerToken)
      .get(`/api/v1/daily-checklists/${workDate}`)
      .expect(404)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CHECKLIST_NOT_FOUND');
      });
    await authenticatedRequest(workerToken)
      .get('/api/v1/daily-checklists/not-a-date')
      .expect(400);
    await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send({ scheduleMode: ScheduleMode.FULL_DAY, periods: [] })
      .expect(400);
    expect(await dataSource.getRepository(DailyChecklist).count()).toBe(0);
  });

  it('作業者がFULL_DAYを作成し、管理者が選択カテゴリとCOMMON道具を取得できる', async () => {
    const workDate = dateInTokyo(1);
    const created = await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send(fullDayBody(cleaningId))
      .expect(200);
    const body = created.body as ChecklistBody;

    expect(body).toMatchObject({
      workDate,
      scheduleMode: ScheduleMode.FULL_DAY,
      editable: true,
    });
    expect(body.periods).toHaveLength(1);
    expect(body.periods[0].period).toBe(ChecklistPeriodType.FULL_DAY);
    expect(body.periods[0].categories).toEqual([
      { sourceCategoryId: cleaningId, categoryName: '清掃' },
    ]);
    expect(
      body.periods[0].items.map((item) => ({
        name: item.toolName,
        category: item.categoryName,
        stock: item.stockQuantity,
        quantity: item.takeoutQuantity,
        checked: item.checked,
        version: item.version,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          name: '手袋',
          category: '共通',
          stock: 10,
          quantity: 0,
          checked: false,
          version: 1,
        },
        {
          name: 'モップ',
          category: '清掃',
          stock: 2,
          quantity: 0,
          checked: false,
          version: 1,
        },
      ]),
    );
    expect(body.periods[0].items).toHaveLength(2);

    await authenticatedRequest(adminToken)
      .get(`/api/v1/daily-checklists/${workDate}`)
      .expect(200)
      .expect(({ body: found }: { body: ChecklistBody }) => {
        expect(found.id).toBe(body.id);
        expect(found.periods[0].id).toBe(body.periods[0].id);
      });
  });

  it('SPLITの午前・午後を1回の作成で独立した構成として保存する', async () => {
    const workDate = dateInTokyo(2);
    const response = await authenticatedRequest(adminToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send({
        scheduleMode: ScheduleMode.SPLIT,
        periods: [
          {
            period: ChecklistPeriodType.MORNING,
            categoryIds: [cleaningId],
          },
          {
            period: ChecklistPeriodType.AFTERNOON,
            categoryIds: [inspectionId],
          },
        ],
      })
      .expect(200);
    const body = response.body as ChecklistBody;

    expect(body.periods.map((period) => period.period)).toEqual([
      ChecklistPeriodType.MORNING,
      ChecklistPeriodType.AFTERNOON,
    ]);
    expect(body.periods[0].categories[0].categoryName).toBe('清掃');
    expect(body.periods[0].items.map((item) => item.toolName)).toEqual(
      expect.arrayContaining(['手袋', 'モップ']),
    );
    expect(body.periods[0].items.map((item) => item.toolName)).not.toContain(
      'テスター',
    );
    expect(body.periods[1].categories[0].categoryName).toBe('設備点検');
    expect(body.periods[1].items.map((item) => item.toolName)).toEqual(
      expect.arrayContaining(['手袋', 'テスター']),
    );
    expect(body.periods[1].items.map((item) => item.toolName)).not.toContain(
      'モップ',
    );
    expect(
      await dataSource.query<Array<{ count: string }>>(
        'SELECT COUNT(*) AS count FROM daily_checklist_periods',
      ),
    ).toEqual([{ count: '2' }]);
  });

  it('同方式の再送では既存表を変更せず、異なる方式の再送を409で拒否する', async () => {
    const workDate = dateInTokyo(3);
    const first = await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send(fullDayBody(cleaningId))
      .expect(200);
    const firstBody = first.body as ChecklistBody;

    const repeated = await authenticatedRequest(adminToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send(fullDayBody(inspectionId))
      .expect(200);
    const repeatedBody = repeated.body as ChecklistBody;
    expect(repeatedBody.id).toBe(firstBody.id);
    expect(repeatedBody.periods[0].categories).toEqual(
      firstBody.periods[0].categories,
    );
    expect(repeatedBody.periods[0].categories[0].sourceCategoryId).toBe(
      cleaningId,
    );

    await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send({
        scheduleMode: ScheduleMode.SPLIT,
        periods: [
          {
            period: ChecklistPeriodType.MORNING,
            categoryIds: [cleaningId],
          },
          {
            period: ChecklistPeriodType.AFTERNOON,
            categoryIds: [inspectionId],
          },
        ],
      })
      .expect(409)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CHECKLIST_ALREADY_CONFIGURED');
      });
  });

  it('方式と時間帯の不整合、存在しない・無効・COMMON・重複カテゴリを拒否する', async () => {
    const workDate = dateInTokyo(4);
    await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send({
        scheduleMode: ScheduleMode.SPLIT,
        periods: [
          {
            period: ChecklistPeriodType.MORNING,
            categoryIds: [cleaningId],
          },
        ],
      })
      .expect(422)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CHECKLIST_PERIODS_INVALID');
      });
    await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send(fullDayBody('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))
      .expect(404)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CATEGORY_NOT_FOUND');
      });
    await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send(fullDayBody(inactiveCategoryId))
      .expect(422)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CATEGORY_INACTIVE');
      });
    await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send(fullDayBody(commonId))
      .expect(422)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CHECKLIST_CATEGORY_TYPE_INVALID');
      });
    const duplicateBody = fullDayBody(cleaningId);
    // UUIDの大文字・小文字違いも同じカテゴリとして正規化し、二重保存前に拒否する。
    duplicateBody.periods[0].categoryIds.push(cleaningId.toUpperCase());
    await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send(duplicateBody)
      .expect(400);
    expect(await dataSource.getRepository(DailyChecklist).count()).toBe(0);
  });

  it('過去日の作成を拒否し、作成済みの過去日は編集不可で取得できる', async () => {
    const pastDate = dateInTokyo(-1);
    await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${pastDate}`)
      .send(fullDayBody(cleaningId))
      .expect(422)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CHECKLIST_PAST_DATE');
      });

    const futureDate = dateInTokyo(5);
    await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${futureDate}`)
      .send(fullDayBody(cleaningId))
      .expect(200);
    await dataSource.query(
      `UPDATE daily_checklists
       SET work_date = ?, active_work_date = ?
       WHERE work_date = ?`,
      [pastDate, pastDate, futureDate],
    );
    await authenticatedRequest(adminToken)
      .get(`/api/v1/daily-checklists/${pastDate}`)
      .expect(200)
      .expect(({ body }: { body: ChecklistBody }) => {
        expect(body).toMatchObject({ workDate: pastDate, editable: false });
      });
  });

  it('作成後のマスター変更・停止を既存表のスナップショットへ反映しない', async () => {
    const workDate = dateInTokyo(6);
    await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send(fullDayBody(cleaningId))
      .expect(200);

    await dataSource.query(
      `UPDATE categories
       SET name = '清掃変更後', display_order = 999, version = version + 1
       WHERE id = ?`,
      [cleaningId],
    );
    await dataSource.query(
      `UPDATE tools
       SET name = 'モップ変更後', stock_quantity = 99,
           display_order = 999, status = ?, version = version + 1
       WHERE id = ?`,
      [RecordStatus.INACTIVE, mopId],
    );

    await authenticatedRequest(workerToken)
      .get(`/api/v1/daily-checklists/${workDate}`)
      .expect(200)
      .expect(({ body }: { body: ChecklistBody }) => {
        expect(body.periods[0].categories[0].categoryName).toBe('清掃');
        expect(body.periods[0].items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              sourceToolId: mopId,
              toolName: 'モップ',
              categoryName: '清掃',
              stockQuantity: 2,
            }),
          ]),
        );
      });
  });

  it('同日・同方式の同時作成を1件へ収束させる', async () => {
    const workDate = dateInTokyo(7);
    const [first, second] = await Promise.all([
      authenticatedRequest(adminToken)
        .put(`/api/v1/daily-checklists/${workDate}`)
        .send(fullDayBody(cleaningId)),
      authenticatedRequest(workerToken)
        .put(`/api/v1/daily-checklists/${workDate}`)
        .send(fullDayBody(cleaningId)),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((first.body as ChecklistBody).id).toBe(
      (second.body as ChecklistBody).id,
    );
    expect(await dataSource.getRepository(DailyChecklist).count()).toBe(1);
    expect(
      await dataSource.query<Array<{ count: string }>>(
        'SELECT COUNT(*) AS count FROM daily_checklist_periods',
      ),
    ).toEqual([{ count: '1' }]);
  });

  it('設定変更前の表を履歴化し、同じ時間帯・道具の入力値だけを新版へ引き継ぐ', async () => {
    const workDate = dateInTokyo(8);
    const created = await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send(fullDayBody(cleaningId))
      .expect(200);
    const original = created.body as ChecklistBody;
    const originalGloves = original.periods[0].items.find(
      (item) => item.sourceToolId === glovesId,
    );
    const originalMop = original.periods[0].items.find(
      (item) => item.sourceToolId === mopId,
    );
    await dataSource.query(
      'UPDATE daily_checklist_items SET takeout_quantity = 1, checked = true WHERE id IN (?, ?)',
      [originalGloves?.id, originalMop?.id],
    );

    const updateBody = {
      ...fullDayBody(inspectionId),
      checklistId: original.id,
      version: original.version,
      confirmDataLoss: false,
    };
    await authenticatedRequest(workerToken)
      .patch(`/api/v1/daily-checklists/${workDate}/configuration`)
      .send(updateBody)
      .expect(409)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CHECKLIST_RECONFIGURATION_DATA_LOSS');
      });

    const changed = await authenticatedRequest(workerToken)
      .patch(`/api/v1/daily-checklists/${workDate}/configuration`)
      .send({ ...updateBody, confirmDataLoss: true })
      .expect(200);
    const current = changed.body as ChecklistBody;

    expect(current.id).not.toBe(original.id);
    expect(current.periods[0].categories[0].sourceCategoryId).toBe(
      inspectionId,
    );
    expect(current.periods[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceToolId: glovesId,
          takeoutQuantity: 1,
          checked: true,
        }),
        expect.objectContaining({
          sourceToolId: testerId,
          takeoutQuantity: 0,
          checked: false,
        }),
      ]),
    );
    expect(
      current.periods[0].items.some((item) => item.sourceToolId === mopId),
    ).toBe(false);
    expect(
      await dataSource.query<Array<{ status: string; count: string }>>(
        'SELECT status, COUNT(*) AS count FROM daily_checklists WHERE work_date = ? GROUP BY status ORDER BY status',
        [workDate],
      ),
    ).toEqual([
      { status: 'ACTIVE', count: '1' },
      { status: 'CANCELLED', count: '1' },
    ]);
    expect(
      await dataSource.query<Array<{ takeoutQuantity: number }>>(
        `SELECT item.takeout_quantity AS takeoutQuantity
         FROM daily_checklist_items item
         INNER JOIN daily_checklist_periods period ON period.id = item.period_id
         WHERE period.checklist_id = ? AND item.source_tool_id = ?`,
        [original.id, mopId],
      ),
    ).toEqual([{ takeoutQuantity: 1 }]);
  });

  it('チェック表を論理削除して取得対象外にし、同じ日へ作り直せる', async () => {
    const workDate = dateInTokyo(9);
    const created = await authenticatedRequest(adminToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send(fullDayBody(cleaningId))
      .expect(200);
    const original = created.body as ChecklistBody;

    await dataSource.query(
      `UPDATE daily_checklist_items
       SET takeout_quantity = 1, checked = true
       WHERE id = ?`,
      [original.periods[0].items[0].id],
    );
    await authenticatedRequest(adminToken)
      .delete(`/api/v1/daily-checklists/${workDate}`)
      .send({
        checklistId: original.id,
        version: original.version,
        confirmDataLoss: false,
      })
      .expect(409)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CHECKLIST_CANCELLATION_DATA_LOSS');
      });

    await authenticatedRequest(adminToken)
      .delete(`/api/v1/daily-checklists/${workDate}`)
      .send({
        checklistId: original.id,
        version: original.version,
        confirmDataLoss: true,
      })
      .expect(204);
    await authenticatedRequest(workerToken)
      .get(`/api/v1/daily-checklists/${workDate}`)
      .expect(404);

    const recreated = await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send(fullDayBody(inspectionId))
      .expect(200);
    expect((recreated.body as ChecklistBody).id).not.toBe(original.id);
    expect(
      await dataSource.query<Array<{ status: string; cancelledBy: string }>>(
        `SELECT status, cancelled_by_user_id AS cancelledBy
         FROM daily_checklists WHERE id = ?`,
        [original.id],
      ),
    ).toEqual([{ status: 'CANCELLED', cancelledBy: adminId }]);
  });

  it('古いチェック表ID・versionによる設定変更と削除を409で拒否する', async () => {
    const workDate = dateInTokyo(10);
    const created = await authenticatedRequest(workerToken)
      .put(`/api/v1/daily-checklists/${workDate}`)
      .send(fullDayBody(cleaningId))
      .expect(200);
    const original = created.body as ChecklistBody;
    const stale = {
      checklistId: original.id,
      version: original.version + 1,
      confirmDataLoss: true,
    };

    await authenticatedRequest(workerToken)
      .patch(`/api/v1/daily-checklists/${workDate}/configuration`)
      .send({ ...fullDayBody(inspectionId), ...stale })
      .expect(409)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CHECKLIST_UPDATE_CONFLICT');
      });
    await authenticatedRequest(workerToken)
      .delete(`/api/v1/daily-checklists/${workDate}`)
      .send(stale)
      .expect(409)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CHECKLIST_UPDATE_CONFLICT');
      });
  });

  async function insertBaselineData(): Promise<void> {
    await dataSource.query(
      `INSERT INTO users
       (id, name, login_id, password_hash, role, status, must_change_password,
        auth_version, failed_login_count, locked_until)
       VALUES (?, '管理者', 'admin01', ?, ?, ?, false, 1, 0, NULL),
              (?, '作業者', 'worker01', ?, ?, ?, false, 1, 0, NULL)`,
      [
        adminId,
        await hashPassword(adminPassword),
        UserRole.ADMIN,
        RecordStatus.ACTIVE,
        workerId,
        await hashPassword(workerPassword),
        UserRole.WORKER,
        RecordStatus.ACTIVE,
      ],
    );
    await dataSource.query(
      `INSERT INTO categories
       (id, name, display_order, category_type, status)
       VALUES (?, '共通', 0, ?, ?), (?, '清掃', 20, ?, ?),
              (?, '設備点検', 30, ?, ?), (?, '停止中', 40, ?, ?)`,
      [
        commonId,
        CategoryType.COMMON,
        RecordStatus.ACTIVE,
        cleaningId,
        CategoryType.WORK,
        RecordStatus.ACTIVE,
        inspectionId,
        CategoryType.WORK,
        RecordStatus.ACTIVE,
        inactiveCategoryId,
        CategoryType.WORK,
        RecordStatus.INACTIVE,
      ],
    );
  }

  async function resetCategories(): Promise<void> {
    await dataSource.query(
      `UPDATE categories
       SET name = CASE id
         WHEN ? THEN '共通'
         WHEN ? THEN '清掃'
         WHEN ? THEN '設備点検'
         ELSE '停止中'
       END,
       display_order = CASE id
         WHEN ? THEN 0
         WHEN ? THEN 20
         WHEN ? THEN 30
         ELSE 40
       END,
       status = CASE WHEN id = ? THEN ? ELSE ? END,
       version = 1`,
      [
        commonId,
        cleaningId,
        inspectionId,
        commonId,
        cleaningId,
        inspectionId,
        inactiveCategoryId,
        RecordStatus.INACTIVE,
        RecordStatus.ACTIVE,
      ],
    );
  }

  async function insertTools(): Promise<void> {
    await dataSource.query(
      `INSERT INTO tools
       (id, category_id, name, stock_quantity, display_order, status)
       VALUES (?, ?, '手袋', 10, 5, ?), (?, ?, '停止共通道具', 1, 6, ?),
              (?, ?, 'モップ', 2, 10, ?), (?, ?, '停止モップ', 1, 11, ?),
              (?, ?, 'テスター', 3, 20, ?)`,
      [
        glovesId,
        commonId,
        RecordStatus.ACTIVE,
        inactiveCommonToolId,
        commonId,
        RecordStatus.INACTIVE,
        mopId,
        cleaningId,
        RecordStatus.ACTIVE,
        inactiveMopId,
        cleaningId,
        RecordStatus.INACTIVE,
        testerId,
        inspectionId,
        RecordStatus.ACTIVE,
      ],
    );
  }

  function login(loginId: string, password: string): request.Test {
    return request(app.getHttpServer() as Server)
      .post('/api/v1/auth/login')
      .send({ loginId, password });
  }

  function authenticatedRequest(token: string): AuthenticatedRequestBuilder {
    const withToken = (test: request.Test): request.Test =>
      test.set('Authorization', `Bearer ${token}`);
    return {
      delete: (path) =>
        withToken(request(app.getHttpServer() as Server).delete(path)),
      get: (path) =>
        withToken(request(app.getHttpServer() as Server).get(path)),
      patch: (path) =>
        withToken(request(app.getHttpServer() as Server).patch(path)),
      put: (path) =>
        withToken(request(app.getHttpServer() as Server).put(path)),
    };
  }

  function fullDayBody(categoryId: string): CreateDailyChecklistDto {
    return {
      scheduleMode: ScheduleMode.FULL_DAY,
      periods: [
        {
          period: ChecklistPeriodType.FULL_DAY,
          categoryIds: [categoryId],
        },
      ],
    };
  }

  function dateInTokyo(dayOffset: number): string {
    const date = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
});
