import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import { verify } from 'argon2';
import type { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AuthModule } from '../src/auth/auth.module';
import { hashPassword } from '../src/common/security/password-hashing';
import { environmentValidationSchema } from '../src/config/environment.schema';
import { configureApp } from '../src/configure-app';
import { createDatabaseDataSource } from '../src/database/data-source.factory';
import { RecordStatus, UserRole } from '../src/database/entities';
import { createTypeOrmOptions } from '../src/database/typeorm.config';
import { UsersModule } from '../src/users/users.module';
import { UsersService } from '../src/users/users.service';

jest.setTimeout(120_000);

interface LoginBody {
  accessToken: string;
  user: { mustChangePassword: boolean };
}

interface ManagedUserBody {
  id: string;
  loginId: string;
  status: RecordStatus;
  version: number;
  temporaryPassword?: string;
}

interface AdminRequestBuilder {
  get: (path: string) => request.Test;
  post: (path: string) => request.Test;
  patch: (path: string) => request.Test;
}

describe('Users API (integration)', () => {
  let container: StartedMySqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let usersService: UsersService;
  let adminToken: string;

  const origin = 'http://localhost:5173';
  const adminId = '11111111-1111-4111-8111-111111111111';
  const workerId = '22222222-2222-4222-8222-222222222222';
  const adminPassword = 'admin password 123';
  const workerPassword = 'worker password 123';

  beforeAll(async () => {
    container = await new MySqlContainer('mysql:8.4.10')
      .withDatabase('fieldflow_users_test')
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
    await insertBaselineUsers();

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
        UsersModule,
      ],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    usersService = app.get(UsersService);
  });

  beforeEach(async () => {
    await dataSource.query(
      'UPDATE refresh_sessions SET replaced_by_session_id = NULL',
    );
    await dataSource.query('DELETE FROM refresh_sessions');
    await dataSource.query('DELETE FROM users WHERE id NOT IN (?, ?)', [
      adminId,
      workerId,
    ]);
    await dataSource.query(
      `UPDATE users SET name = '管理者', login_id = 'admin01', role = ?, status = ?,
       password_hash = ?, must_change_password = false, auth_version = 1,
       failed_login_count = 0, locked_until = NULL, version = 1 WHERE id = ?`,
      [
        UserRole.ADMIN,
        RecordStatus.ACTIVE,
        await hashPassword(adminPassword),
        adminId,
      ],
    );
    await dataSource.query(
      `UPDATE users SET name = '作業者', login_id = 'worker01', role = ?, status = ?,
       password_hash = ?, must_change_password = false, auth_version = 1,
       failed_login_count = 0, locked_until = NULL, version = 1 WHERE id = ?`,
      [
        UserRole.WORKER,
        RecordStatus.ACTIVE,
        await hashPassword(workerPassword),
        workerId,
      ],
    );
    const adminLogin = await login('admin01', adminPassword).expect(200);
    adminToken = (adminLogin.body as LoginBody).accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  it('管理者は検索でき、作業者は管理APIを403で拒否される', async () => {
    const listResponse = await adminRequest()
      .get(
        '/api/v1/users?search=worker&role=WORKER&status=ACTIVE&page=1&pageSize=10',
      )
      .expect(200);
    expect(listResponse.body).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1,
      items: [{ id: workerId, loginId: 'worker01', role: UserRole.WORKER }],
    });
    expect(JSON.stringify(listResponse.body)).not.toContain('passwordHash');

    const workerLogin = await login('worker01', workerPassword).expect(200);
    await request(app.getHttpServer() as Server)
      .get('/api/v1/users')
      .set(
        'Authorization',
        `Bearer ${(workerLogin.body as LoginBody).accessToken}`,
      )
      .expect(403);
  });

  it('ユーザーを正規化して作成し、仮パスワードを一度だけ返す', async () => {
    const response = await adminRequest()
      .post('/api/v1/users')
      .send({
        name: '  新しい 作業者  ',
        loginId: '  New.User  ',
        role: 'WORKER',
      })
      .expect(201);
    const body = response.body as ManagedUserBody;

    expect(body).toMatchObject({
      loginId: 'new.user',
      status: RecordStatus.ACTIVE,
    });
    expect(body.temporaryPassword).toHaveLength(16);
    const [row] = await dataSource.query<
      { name: string; passwordHash: string; mustChangePassword: number }[]
    >(
      `SELECT name, password_hash AS passwordHash,
              must_change_password AS mustChangePassword
       FROM users WHERE id = ?`,
      [body.id],
    );
    expect(row?.name).toBe('新しい 作業者');
    await expect(
      verify(row?.passwordHash ?? '', body.temporaryPassword ?? ''),
    ).resolves.toBe(true);
    expect(row?.mustChangePassword).toBe(1);

    await adminRequest()
      .post('/api/v1/users')
      .send({ name: '重複', loginId: 'NEW.USER', role: 'WORKER' })
      .expect(409)
      .expect(({ body: errorBody }: { body: { code?: string } }) => {
        expect(errorBody.code).toBe('USER_LOGIN_ID_DUPLICATED');
      });

    await adminRequest()
      .post('/api/v1/users')
      .send({ name: '入力不正', loginId: 'abc', role: 'WORKER' })
      .expect(400);
  });

  it('自己降格と古いversionによる更新を409で拒否する', async () => {
    await adminRequest()
      .patch(`/api/v1/users/${adminId}`)
      .send({ name: '管理者', loginId: 'admin01', role: 'WORKER', version: 1 })
      .expect(409)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('USER_SELF_DEMOTION_FORBIDDEN');
      });

    await adminRequest()
      .patch(`/api/v1/users/${adminId}/status`)
      .send({ status: RecordStatus.INACTIVE, version: 1 })
      .expect(409)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('USER_SELF_DEACTIVATION_FORBIDDEN');
      });

    await adminRequest()
      .patch(`/api/v1/users/${workerId}`)
      .send({ name: '更新', loginId: 'worker01', role: 'WORKER', version: 999 })
      .expect(409)
      .expect(({ body }: { body: { code?: string } }) => {
        expect(body.code).toBe('USER_UPDATE_CONFLICT');
      });
  });

  it('詳細取得と編集成功をHTTP経路で確認し、管理用versionを1だけ進める', async () => {
    await adminRequest()
      .get(`/api/v1/users/${workerId}`)
      .expect(200)
      .expect(({ body }: { body: ManagedUserBody }) => {
        expect(body).toMatchObject({
          id: workerId,
          loginId: 'worker01',
          version: 1,
        });
        expect(body).not.toHaveProperty('passwordHash');
      });

    await adminRequest()
      .patch(`/api/v1/users/${workerId}`)
      .send({
        name: '更新後の作業者',
        loginId: 'worker02',
        role: 'WORKER',
        version: 1,
      })
      .expect(200)
      .expect(({ body }: { body: ManagedUserBody }) => {
        expect(body).toMatchObject({ loginId: 'worker02', version: 2 });
      });

    await adminRequest()
      .get('/api/v1/users/99999999-9999-4999-8999-999999999999')
      .expect(404);
  });

  it('2人の管理者が相互降格を同時実行しても有効な管理者を1人残す', async () => {
    const secondAdminId = '33333333-3333-4333-8333-333333333333';
    await dataSource.query(
      `INSERT INTO users
       (id, name, login_id, password_hash, role, status, must_change_password,
        auth_version, failed_login_count, locked_until)
       VALUES (?, '第二管理者', 'admin02', ?, ?, ?, false, 1, 0, NULL)`,
      [
        secondAdminId,
        await hashPassword('second admin password'),
        UserRole.ADMIN,
        RecordStatus.ACTIVE,
      ],
    );

    const firstAdmin = {
      id: adminId,
      name: '管理者',
      loginId: 'admin01',
      role: UserRole.ADMIN,
      mustChangePassword: false,
      authVersion: 1,
    };
    const secondAdmin = {
      ...firstAdmin,
      id: secondAdminId,
      name: '第二管理者',
      loginId: 'admin02',
    };
    const results = await Promise.allSettled([
      usersService.update(firstAdmin, secondAdminId, {
        name: '第二管理者',
        loginId: 'admin02',
        role: UserRole.WORKER,
        version: 1,
      }),
      usersService.update(secondAdmin, adminId, {
        name: '管理者',
        loginId: 'admin01',
        role: UserRole.WORKER,
        version: 1,
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const [count] = await dataSource.query<{ total: number }[]>(
      'SELECT COUNT(*) AS total FROM users WHERE role = ? AND status = ?',
      [UserRole.ADMIN, RecordStatus.ACTIVE],
    );
    expect(Number(count?.total)).toBe(1);
  });

  it('利用停止で既存Access Tokenと全Refresh Sessionを失効し、再有効化できる', async () => {
    const workerLogin = await login('worker01', workerPassword).expect(200);
    const workerBody = workerLogin.body as LoginBody;
    const workerCookie = extractCookie(workerLogin.headers['set-cookie']);

    const stopped = await adminRequest()
      .patch(`/api/v1/users/${workerId}/status`)
      .send({ status: RecordStatus.INACTIVE, version: 1 })
      .expect(200);

    await request(app.getHttpServer() as Server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${workerBody.accessToken}`)
      .expect(401);
    await refresh(workerCookie).expect(401);
    await login('worker01', workerPassword).expect(401);

    const stoppedBody = stopped.body as ManagedUserBody;
    expect(stoppedBody.version).toBe(2);
    await adminRequest()
      .patch(`/api/v1/users/${workerId}/status`)
      .send({ status: RecordStatus.ACTIVE, version: stoppedBody.version })
      .expect(200)
      .expect(({ body }: { body: ManagedUserBody }) => {
        expect(body.version).toBe(3);
      });
    await login('worker01', workerPassword).expect(200);
  });

  it('仮パスワード再発行で旧認証を失効し、新しい仮パスワードを要求する', async () => {
    const workerLogin = await login('worker01', workerPassword).expect(200);
    const workerBody = workerLogin.body as LoginBody;
    const workerCookie = extractCookie(workerLogin.headers['set-cookie']);

    const response = await adminRequest()
      .post(`/api/v1/users/${workerId}/temporary-password`)
      .expect(200);
    const body = response.body as ManagedUserBody;
    expect(body.version).toBe(2);

    await request(app.getHttpServer() as Server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${workerBody.accessToken}`)
      .expect(401);
    await refresh(workerCookie).expect(401);
    await login('worker01', workerPassword).expect(401);
    const nextLogin = await login(
      'worker01',
      body.temporaryPassword ?? '',
    ).expect(200);
    expect((nextLogin.body as LoginBody).user.mustChangePassword).toBe(true);
  });

  async function insertBaselineUsers(): Promise<void> {
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

  function refresh(cookie: string): request.Test {
    return request(app.getHttpServer() as Server)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', cookie);
  }
});

function extractCookie(setCookie: string | string[] | undefined): string {
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return value?.split(';')[0] ?? '';
}
