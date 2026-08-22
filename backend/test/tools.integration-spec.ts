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
  RecordStatus,
  Tool,
  UserRole,
} from '../src/database/entities';
import { createTypeOrmOptions } from '../src/database/typeorm.config';
import { ToolsModule } from '../src/tools/tools.module';

jest.setTimeout(120_000);

interface LoginBody {
  accessToken: string;
}

interface ManagedToolBody {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  stockQuantity: number;
  displayOrder: number;
  status: RecordStatus;
  version: number;
}

interface AuthenticatedRequestBuilder {
  get: (path: string) => request.Test;
  post: (path: string) => request.Test;
  patch: (path: string) => request.Test;
}

describe('Tools API (integration)', () => {
  let container: StartedMySqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let adminToken: string;
  let workerToken: string;

  const origin = 'http://localhost:5173';
  const adminId = '11111111-1111-4111-8111-111111111111';
  const workerId = '22222222-2222-4222-8222-222222222222';
  const commonId = '33333333-3333-4333-8333-333333333333';
  const cleaningId = '44444444-4444-4444-8444-444444444444';
  const inactiveCategoryId = '55555555-5555-4555-8555-555555555555';
  const mopId = '66666666-6666-4666-8666-666666666666';
  const bucketId = '77777777-7777-4777-8777-777777777777';
  const adminPassword = 'admin password 123';
  const workerPassword = 'worker password 123';

  beforeAll(async () => {
    container = await new MySqlContainer('mysql:8.4.10')
      .withDatabase('fieldflow_tools_test')
      .withUsername('fieldflow')
      .withUserPassword('fieldflow')
      .withRootPassword('fieldflow_root')
      .start();
    Object.assign(process.env, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'fatal',
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
        ToolsModule,
      ],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(async () => {
    await dataSource.query(
      'UPDATE refresh_sessions SET replaced_by_session_id = NULL',
    );
    await dataSource.query('DELETE FROM refresh_sessions');
    await dataSource.query('DELETE FROM tools');
    await dataSource.query(
      `UPDATE categories SET status = ?, version = 1 WHERE id IN (?, ?)`,
      [RecordStatus.ACTIVE, commonId, cleaningId],
    );
    await dataSource.query(
      'UPDATE categories SET status = ?, version = 1 WHERE id = ?',
      [RecordStatus.INACTIVE, inactiveCategoryId],
    );
    await insertTools();
    adminToken = (
      (await login('admin01', adminPassword).expect(200)).body as LoginBody
    ).accessToken;
    workerToken = (
      (await login('worker01', workerPassword).expect(200)).body as LoginBody
    ).accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  it('全ログインユーザーが検索・絞り込み・安定した並び順・ページングを利用できる', async () => {
    const firstPage = await authenticatedRequest(workerToken)
      .get('/api/v1/tools?status=ACTIVE&page=1&pageSize=1')
      .expect(200);
    expect(firstPage.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });
    expect(
      (
        firstPage.body as { categories: Array<{ name: string }> }
      ).categories.map((category) => category.name),
    ).toEqual(['共通', '清掃', '設備点検']);
    expect(
      (firstPage.body as { items: ManagedToolBody[] }).items[0],
    ).toMatchObject({
      name: 'バケツ',
      categoryName: '共通',
    });

    await authenticatedRequest(workerToken)
      .get(`/api/v1/tools?search=モップ&categoryId=${cleaningId}`)
      .expect(200)
      .expect(({ body }: { body: { items: ManagedToolBody[] } }) => {
        expect(body.items.map((tool) => tool.name)).toEqual(['モップ']);
      });
    await request(app.getHttpServer() as Server)
      .get('/api/v1/tools')
      .expect(401);
  });

  it('管理者は入力を正規化して作成でき、作業者の変更と名称重複を拒否する', async () => {
    await authenticatedRequest(workerToken)
      .post('/api/v1/tools')
      .send({
        name: '脚立',
        categoryId: cleaningId,
        stockQuantity: 2,
        displayOrder: 15,
      })
      .expect(403);

    const response = await authenticatedRequest(adminToken)
      .post('/api/v1/tools')
      .send({
        name: '  Ladder  ',
        categoryId: cleaningId,
        stockQuantity: 0,
        displayOrder: 15,
      })
      .expect(201);
    expect(response.body).toMatchObject({
      name: 'Ladder',
      categoryName: '清掃',
      stockQuantity: 0,
      status: RecordStatus.ACTIVE,
      version: 1,
    });
    await authenticatedRequest(adminToken)
      .post('/api/v1/tools')
      .send({
        name: 'ladder',
        categoryId: cleaningId,
        stockQuantity: 1,
        displayOrder: 16,
      })
      .expect(409)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('TOOL_NAME_DUPLICATED');
      });
  });

  it('無効カテゴリと入力境界違反を拒否する', async () => {
    await authenticatedRequest(adminToken)
      .post('/api/v1/tools')
      .send({
        name: 'テスター',
        categoryId: inactiveCategoryId,
        stockQuantity: 1,
        displayOrder: 1,
      })
      .expect(422)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CATEGORY_INACTIVE');
      });
    await authenticatedRequest(adminToken)
      .post('/api/v1/tools')
      .send({
        name: '',
        categoryId: cleaningId,
        stockQuantity: 10000,
        displayOrder: -1,
      })
      .expect(400);
  });

  it('詳細・編集でversionを進め、古いversionと存在しないIDを拒否する', async () => {
    await authenticatedRequest(workerToken)
      .get(`/api/v1/tools/${mopId}`)
      .expect(200)
      .expect(({ body }: { body: ManagedToolBody }) => {
        expect(body).toMatchObject({ id: mopId, name: 'モップ', version: 1 });
      });

    await authenticatedRequest(adminToken)
      .patch(`/api/v1/tools/${mopId}`)
      .send({
        name: '業務用モップ',
        categoryId: commonId,
        stockQuantity: 3,
        displayOrder: 25,
        version: 1,
      })
      .expect(200)
      .expect(({ body }: { body: ManagedToolBody }) => {
        expect(body).toMatchObject({
          name: '業務用モップ',
          categoryName: '共通',
          version: 2,
        });
      });
    await authenticatedRequest(adminToken)
      .patch(`/api/v1/tools/${mopId}`)
      .send({
        name: '上書き',
        categoryId: cleaningId,
        stockQuantity: 1,
        displayOrder: 1,
        version: 1,
      })
      .expect(409)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('TOOL_UPDATE_CONFLICT');
      });
    await authenticatedRequest(adminToken)
      .get('/api/v1/tools/99999999-9999-4999-8999-999999999999')
      .expect(404);
  });

  it('利用停止・同状態再送・再有効化を物理削除せず処理する', async () => {
    const stopped = await authenticatedRequest(adminToken)
      .patch(`/api/v1/tools/${mopId}/status`)
      .send({ status: RecordStatus.INACTIVE, version: 1 })
      .expect(200);
    expect(stopped.body).toMatchObject({
      status: RecordStatus.INACTIVE,
      version: 2,
    });
    await authenticatedRequest(adminToken)
      .patch(`/api/v1/tools/${mopId}/status`)
      .send({ status: RecordStatus.INACTIVE, version: 2 })
      .expect(200)
      .expect(({ body }: { body: ManagedToolBody }) => {
        expect(body.version).toBe(2);
      });
    await authenticatedRequest(adminToken)
      .patch(`/api/v1/tools/${mopId}/status`)
      .send({ status: RecordStatus.ACTIVE, version: 2 })
      .expect(200)
      .expect(({ body }: { body: ManagedToolBody }) => {
        expect(body).toMatchObject({ status: RecordStatus.ACTIVE, version: 3 });
      });
    expect(await dataSource.getRepository(Tool).countBy({ id: mopId })).toBe(1);
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
              (?, '設備点検', 30, ?, ?)`,
      [
        commonId,
        CategoryType.COMMON,
        RecordStatus.ACTIVE,
        cleaningId,
        CategoryType.WORK,
        RecordStatus.ACTIVE,
        inactiveCategoryId,
        CategoryType.WORK,
        RecordStatus.INACTIVE,
      ],
    );
  }

  async function insertTools(): Promise<void> {
    await dataSource.query(
      `INSERT INTO tools
       (id, category_id, name, stock_quantity, display_order, status)
       VALUES (?, ?, 'モップ', 2, 10, ?), (?, ?, 'バケツ', 4, 5, ?)`,
      [
        mopId,
        cleaningId,
        RecordStatus.ACTIVE,
        bucketId,
        commonId,
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
      get: (path) =>
        withToken(request(app.getHttpServer() as Server).get(path)),
      post: (path) =>
        withToken(request(app.getHttpServer() as Server).post(path)),
      patch: (path) =>
        withToken(request(app.getHttpServer() as Server).patch(path)),
    };
  }
});
