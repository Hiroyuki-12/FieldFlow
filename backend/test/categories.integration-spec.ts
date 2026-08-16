import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import type { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AuthModule } from '../src/auth/auth.module';
import { CategoriesModule } from '../src/categories/categories.module';
import { hashPassword } from '../src/common/security/password-hashing';
import { environmentValidationSchema } from '../src/config/environment.schema';
import { configureApp } from '../src/configure-app';
import { createDatabaseDataSource } from '../src/database/data-source.factory';
import {
  CategoryType,
  RecordStatus,
  UserRole,
} from '../src/database/entities';
import { createTypeOrmOptions } from '../src/database/typeorm.config';

jest.setTimeout(120_000);

interface LoginBody {
  accessToken: string;
}

interface ManagedCategoryBody {
  id: string;
  name: string;
  displayOrder: number;
  categoryType: CategoryType;
  status: RecordStatus;
  version: number;
}

interface AdminRequestBuilder {
  get: (path: string) => request.Test;
  post: (path: string) => request.Test;
  patch: (path: string) => request.Test;
}

describe('Categories API (integration)', () => {
  let container: StartedMySqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let adminToken: string;

  const origin = 'http://localhost:5173';
  const adminId = '11111111-1111-4111-8111-111111111111';
  const workerId = '22222222-2222-4222-8222-222222222222';
  const commonId = '33333333-3333-4333-8333-333333333333';
  const cleaningId = '44444444-4444-4444-8444-444444444444';
  const inactiveId = '55555555-5555-4555-8555-555555555555';
  const adminPassword = 'admin password 123';
  const workerPassword = 'worker password 123';

  beforeAll(async () => {
    container = await new MySqlContainer('mysql:8.4.10')
      .withDatabase('fieldflow_categories_test')
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
        CategoriesModule,
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
      'DELETE FROM categories WHERE id NOT IN (?, ?, ?)',
      [commonId, cleaningId, inactiveId],
    );
    await dataSource.query(
      `UPDATE categories
       SET name = '共通', display_order = 0, category_type = ?, status = ?, version = 1
       WHERE id = ?`,
      [CategoryType.COMMON, RecordStatus.ACTIVE, commonId],
    );
    await dataSource.query(
      `UPDATE categories
       SET name = '清掃', display_order = 20, category_type = ?, status = ?, version = 1
       WHERE id = ?`,
      [CategoryType.WORK, RecordStatus.ACTIVE, cleaningId],
    );
    await dataSource.query(
      `UPDATE categories
       SET name = '設備点検', display_order = 30, category_type = ?, status = ?, version = 1
       WHERE id = ?`,
      [CategoryType.WORK, RecordStatus.INACTIVE, inactiveId],
    );
    const adminLogin = await login('admin01', adminPassword).expect(200);
    adminToken = (adminLogin.body as LoginBody).accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  it('管理者は検索・並び順を利用でき、作業者は403、未認証は401になる', async () => {
    await adminRequest()
      .post('/api/v1/categories')
      .send({ name: '洗車', displayOrder: 10 })
      .expect(201);
    const response = await adminRequest()
      .get('/api/v1/categories?status=ACTIVE')
      .expect(200);
    expect(
      (response.body as { items: ManagedCategoryBody[] }).items.map(
        (category) => category.name,
      ),
    ).toEqual(['共通', '洗車', '清掃']);

    const searched = await adminRequest()
      .get('/api/v1/categories?search=清')
      .expect(200);
    expect(searched.body).toMatchObject({ items: [{ name: '清掃' }] });

    const workerLogin = await login('worker01', workerPassword).expect(200);
    await request(app.getHttpServer() as Server)
      .get('/api/v1/categories')
      .set(
        'Authorization',
        `Bearer ${(workerLogin.body as LoginBody).accessToken}`,
      )
      .expect(403);
    await request(app.getHttpServer() as Server)
      .get('/api/v1/categories')
      .expect(401);
  });

  it('名前を正規化してWORKカテゴリを作り、大文字小文字違いの重複を拒否する', async () => {
    const response = await adminRequest()
      .post('/api/v1/categories')
      .send({ name: '  Garden Work  ', displayOrder: 15 })
      .expect(201);
    expect(response.body).toMatchObject({
      name: 'Garden Work',
      displayOrder: 15,
      categoryType: CategoryType.WORK,
      status: RecordStatus.ACTIVE,
      version: 1,
    });

    await adminRequest()
      .post('/api/v1/categories')
      .send({ name: 'garden work', displayOrder: 99 })
      .expect(409)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CATEGORY_NAME_DUPLICATED');
      });
    await adminRequest()
      .post('/api/v1/categories')
      .send({ name: '', displayOrder: 10000 })
      .expect(400);
  });

  it('詳細・編集でversionを進め、古いversionと存在しないIDを拒否する', async () => {
    await adminRequest()
      .get(`/api/v1/categories/${cleaningId}`)
      .expect(200)
      .expect(({ body }: { body: ManagedCategoryBody }) => {
        expect(body).toMatchObject({ id: cleaningId, name: '清掃', version: 1 });
      });

    await adminRequest()
      .patch(`/api/v1/categories/${cleaningId}`)
      .send({ name: '日常清掃', displayOrder: 25, version: 1 })
      .expect(200)
      .expect(({ body }: { body: ManagedCategoryBody }) => {
        expect(body).toMatchObject({ name: '日常清掃', version: 2 });
      });
    await adminRequest()
      .patch(`/api/v1/categories/${cleaningId}`)
      .send({ name: '上書き', displayOrder: 1, version: 1 })
      .expect(409)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CATEGORY_UPDATE_CONFLICT');
      });
    await adminRequest()
      .get('/api/v1/categories/99999999-9999-4999-8999-999999999999')
      .expect(404);
  });

  it('COMMONの名称変更・利用停止を拒否し、表示順だけは変更できる', async () => {
    await adminRequest()
      .patch(`/api/v1/categories/${commonId}`)
      .send({ name: '全体', displayOrder: 0, version: 1 })
      .expect(409)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('COMMON_CATEGORY_PROTECTED');
      });
    await adminRequest()
      .patch(`/api/v1/categories/${commonId}/status`)
      .send({ status: RecordStatus.INACTIVE, version: 1 })
      .expect(409);
    await adminRequest()
      .patch(`/api/v1/categories/${commonId}`)
      .send({ name: '共通', displayOrder: 5, version: 1 })
      .expect(200)
      .expect(({ body }: { body: ManagedCategoryBody }) => {
        expect(body).toMatchObject({ name: '共通', displayOrder: 5, version: 2 });
      });
  });

  it('有効な道具があるカテゴリを停止せず、道具無効化後は停止・再有効化できる', async () => {
    const toolId = '66666666-6666-4666-8666-666666666666';
    await dataSource.query(
      `INSERT INTO tools
       (id, category_id, name, stock_quantity, display_order, status)
       VALUES (?, ?, 'モップ', 2, 10, ?)`,
      [toolId, cleaningId, RecordStatus.ACTIVE],
    );
    await adminRequest()
      .patch(`/api/v1/categories/${cleaningId}/status`)
      .send({ status: RecordStatus.INACTIVE, version: 1 })
      .expect(409)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('CATEGORY_IN_USE');
      });

    await dataSource.query('UPDATE tools SET status = ? WHERE id = ?', [
      RecordStatus.INACTIVE,
      toolId,
    ]);
    const stopped = await adminRequest()
      .patch(`/api/v1/categories/${cleaningId}/status`)
      .send({ status: RecordStatus.INACTIVE, version: 1 })
      .expect(200);
    expect(stopped.body).toMatchObject({
      status: RecordStatus.INACTIVE,
      version: 2,
    });
    await adminRequest()
      .patch(`/api/v1/categories/${cleaningId}/status`)
      .send({ status: RecordStatus.ACTIVE, version: 2 })
      .expect(200)
      .expect(({ body }: { body: ManagedCategoryBody }) => {
        expect(body).toMatchObject({ status: RecordStatus.ACTIVE, version: 3 });
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
              (?, '設備点検', 30, ?, ?)`,
      [
        commonId,
        CategoryType.COMMON,
        RecordStatus.ACTIVE,
        cleaningId,
        CategoryType.WORK,
        RecordStatus.ACTIVE,
        inactiveId,
        CategoryType.WORK,
        RecordStatus.INACTIVE,
      ],
    );
  }

  function login(loginId: string, password: string): request.Test {
    return request(app.getHttpServer() as Server)
      .post('/api/v1/auth/login')
      .send({ loginId, password });
  }

  function adminRequest(): AdminRequestBuilder {
    const withAdminToken = (test: request.Test): request.Test =>
      test.set('Authorization', `Bearer ${adminToken}`);
    return {
      get: (path) =>
        withAdminToken(request(app.getHttpServer() as Server).get(path)),
      post: (path) =>
        withAdminToken(request(app.getHttpServer() as Server).post(path)),
      patch: (path) =>
        withAdminToken(request(app.getHttpServer() as Server).patch(path)),
    };
  }
});
