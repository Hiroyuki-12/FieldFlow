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
import { REFRESH_TOKEN_COOKIE_NAME } from '../src/auth/auth.constants';
import { hashPassword } from '../src/common/security/password-hashing';
import { environmentValidationSchema } from '../src/config/environment.schema';
import { configureApp } from '../src/configure-app';
import { createDatabaseDataSource } from '../src/database/data-source.factory';
import { RecordStatus, UserRole } from '../src/database/entities';
import { runInitialSeed } from '../src/database/seeds/initial.seed';
import { createTypeOrmOptions } from '../src/database/typeorm.config';
import { HealthModule } from '../src/health/health.module';

jest.setTimeout(120_000);

interface LoginBody {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    name: string;
    loginId: string;
    role: UserRole;
    mustChangePassword: boolean;
  };
}

interface RefreshSessionRow {
  tokenHash: string;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
}

interface UserAuthRow {
  passwordHash: string;
  mustChangePassword: number;
  authVersion: number;
  failedLoginCount: number;
  lockedUntil: Date | null;
  version: number;
}

describe('Auth API (integration)', () => {
  let container: StartedMySqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let initialAdminHash: string;
  let workerHash: string;

  const origin = 'http://localhost:5173';
  const adminId = '11111111-1111-4111-8111-111111111111';
  const workerId = '22222222-2222-4222-8222-222222222222';
  const adminPassword = 'initial admin password';
  const workerPassword = 'worker password 123';
  const newAdminPassword = 'new admin password 456';

  beforeAll(async () => {
    // 開発DBを使わず、認証テスト専用のMySQL 8.4へ本番と同じMigrationを適用する。
    container = await new MySqlContainer('mysql:8.4.10')
      .withDatabase('fieldflow_auth_test')
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
    await runInitialSeed(dataSource, {
      name: '初期管理者',
      loginId: 'admin',
      password: adminPassword,
    });

    const [seededAdmin] = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM users WHERE login_id = ?',
      ['admin'],
    );
    await dataSource.query('UPDATE users SET id = ? WHERE id = ?', [
      adminId,
      seededAdmin?.id,
    ]);

    initialAdminHash = await hashPassword(adminPassword);
    workerHash = await hashPassword(workerPassword);
    await dataSource.query(
      `INSERT INTO users
        (id, name, login_id, password_hash, role, status, must_change_password,
         auth_version, failed_login_count, locked_until)
       VALUES (?, 'テスト作業者', 'worker01', ?, ?, ?, false, 1, 0, NULL)`,
      [workerId, workerHash, UserRole.WORKER, RecordStatus.ACTIVE],
    );

    // AppModuleと同じ構成を、Testcontainersの動的接続先を設定した後で組み立てる。
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
        HealthModule,
      ],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(async () => {
    // 各シナリオのSession・パスワード・ロック状態を初期化し、テスト順への依存をなくす。
    // ローテーション履歴は自己参照外部キーで保護されるため、テストデータだけ参照を外してから消す。
    await dataSource.query(
      'UPDATE refresh_sessions SET replaced_by_session_id = NULL',
    );
    await dataSource.query('DELETE FROM refresh_sessions');
    await dataSource.query(
      `UPDATE users
       SET password_hash = ?, status = ?, must_change_password = true,
           auth_version = 1, failed_login_count = 0, locked_until = NULL, version = 1
       WHERE id = ?`,
      [initialAdminHash, RecordStatus.ACTIVE, adminId],
    );
    await dataSource.query(
      `UPDATE users
       SET password_hash = ?, status = ?, must_change_password = false,
           auth_version = 1, failed_login_count = 0, locked_until = NULL, version = 1
       WHERE id = ?`,
      [workerHash, RecordStatus.ACTIVE, workerId],
    );
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (container) {
      await container.stop();
    }
  });

  it('ログインでAccess TokenとHttpOnly Refresh Cookieを発行する', async () => {
    const response = await login('worker01', workerPassword).expect(200);
    const body = response.body as LoginBody;
    const setCookies = normalizeSetCookies(response.headers['set-cookie']);
    const cookie = extractRefreshCookie(setCookies);
    const rawRefreshToken = cookie.split('=')[1] ?? '';

    expect(body).toMatchObject({
      expiresIn: 900,
      user: {
        id: workerId,
        loginId: 'worker01',
        role: UserRole.WORKER,
        mustChangePassword: false,
      },
    });
    expect(body.accessToken).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain(workerPassword);
    expect(setCookies[0]).toContain('HttpOnly');
    expect(setCookies[0]).toContain('SameSite=Lax');
    expect(setCookies[0]).toContain('Path=/api/v1/auth');

    const [session] = await dataSource.query<RefreshSessionRow[]>(
      `SELECT token_hash AS tokenHash, revoked_at AS revokedAt,
              replaced_by_session_id AS replacedBySessionId
       FROM refresh_sessions`,
    );
    expect(session?.tokenHash).toHaveLength(64);
    expect(session?.tokenHash).not.toBe(rawRefreshToken);
    expect(session?.revokedAt).toBeNull();
  });

  it('5回失敗後にアカウントを15分ロックし失敗理由を統一する', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await login('worker01', 'wrong password 123').expect(
        401,
      );
      expect(response.body).toMatchObject({
        message: 'ログインIDまたはパスワードが正しくありません。',
      });
    }

    const [user] = await dataSource.query<UserAuthRow[]>(
      `SELECT failed_login_count AS failedLoginCount, locked_until AS lockedUntil,
              password_hash AS passwordHash,
              must_change_password AS mustChangePassword,
              auth_version AS authVersion, version
       FROM users WHERE id = ?`,
      [workerId],
    );
    expect(user?.failedLoginCount).toBe(5);
    expect(user?.lockedUntil).toBeInstanceOf(Date);
    // 認証試行の状態更新は、管理画面の楽観ロック世代へ影響させない。
    expect(user?.version).toBe(1);

    // 正しいパスワードへ切り替えても、ロック期限までは認証できない。
    await login('worker01', workerPassword).expect(401);
  });

  it('ログイン失敗後に成功して失敗状態を初期化しても管理用versionを増やさない', async () => {
    await login('worker01', 'wrong password 123').expect(401);
    await login('worker01', workerPassword).expect(200);

    const [worker] = await dataSource.query<UserAuthRow[]>(
      `SELECT password_hash AS passwordHash,
              must_change_password AS mustChangePassword,
              auth_version AS authVersion,
              failed_login_count AS failedLoginCount,
              locked_until AS lockedUntil, version
       FROM users WHERE id = ?`,
      [workerId],
    );
    expect(worker?.failedLoginCount).toBe(0);
    expect(worker?.lockedUntil).toBeNull();
    expect(worker?.version).toBe(1);
  });

  it('存在しないユーザーと利用停止ユーザーを同じ401で拒否する', async () => {
    const missingResponse = await login(
      'missing01',
      'unknown password 123',
    ).expect(401);

    await dataSource.query('UPDATE users SET status = ? WHERE id = ?', [
      RecordStatus.INACTIVE,
      workerId,
    ]);
    const inactiveResponse = await login('worker01', workerPassword).expect(
      401,
    );

    expect(missingResponse.body).toMatchObject({
      message: 'ログインIDまたはパスワードが正しくありません。',
    });
    expect(inactiveResponse.body).toMatchObject({
      message: 'ログインIDまたはパスワードが正しくありません。',
    });
  });

  it('期限切れRefresh Sessionを失効して401を返す', async () => {
    const loginResponse = await login('worker01', workerPassword).expect(200);
    const cookie = extractRefreshCookie(loginResponse.headers['set-cookie']);
    await dataSource.query(
      'UPDATE refresh_sessions SET expires_at = ? WHERE user_id = ?',
      [new Date('2000-01-01T00:00:00.000Z'), workerId],
    );

    await refresh(cookie).expect(401);
    const [session] = await dataSource.query<RefreshSessionRow[]>(
      `SELECT token_hash AS tokenHash, revoked_at AS revokedAt,
              replaced_by_session_id AS replacedBySessionId
       FROM refresh_sessions WHERE user_id = ?`,
      [workerId],
    );
    expect(session?.revokedAt).not.toBeNull();
  });

  it('Refreshをローテーションし、旧Token再利用時は全Sessionを失効する', async () => {
    const loginResponse = await login('worker01', workerPassword).expect(200);
    const oldCookie = extractRefreshCookie(loginResponse.headers['set-cookie']);
    const refreshResponse = await refresh(oldCookie).expect(200);
    const nextCookie = extractRefreshCookie(
      refreshResponse.headers['set-cookie'],
    );
    expect(nextCookie).not.toBe(oldCookie);

    // ローテーション済みの旧Tokenは盗難再利用として検知する。
    await refresh(oldCookie).expect(401);
    // 検知時に新Tokenを含む全端末Sessionが失効している。
    await refresh(nextCookie).expect(401);

    const sessions = await dataSource.query<RefreshSessionRow[]>(
      `SELECT token_hash AS tokenHash, revoked_at AS revokedAt,
              replaced_by_session_id AS replacedBySessionId
       FROM refresh_sessions WHERE user_id = ?`,
      [workerId],
    );
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
    expect(
      sessions.some((session) => session.replacedBySessionId !== null),
    ).toBe(true);
  });

  it('Logoutは現在端末だけを失効し、別端末はRefreshを継続できる', async () => {
    const firstLogin = await login('worker01', workerPassword).expect(200);
    const secondLogin = await login('worker01', workerPassword).expect(200);
    const firstCookie = extractRefreshCookie(firstLogin.headers['set-cookie']);
    const secondCookie = extractRefreshCookie(
      secondLogin.headers['set-cookie'],
    );

    const logoutResponse = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', firstCookie)
      .expect(204);
    expect(
      normalizeSetCookies(logoutResponse.headers['set-cookie'])[0],
    ).toContain(`${REFRESH_TOKEN_COOKIE_NAME}=;`);

    await refresh(firstCookie).expect(401);
    await refresh(secondCookie).expect(200);
  });

  it('初回変更前はmeを拒否し、パスワード変更後に全Tokenを失効する', async () => {
    const loginResponse = await login('admin', adminPassword).expect(200);
    const body = loginResponse.body as LoginBody;
    const refreshCookie = extractRefreshCookie(
      loginResponse.headers['set-cookie'],
    );

    await request(app.getHttpServer() as Server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(403);

    await request(app.getHttpServer() as Server)
      .patch('/api/v1/auth/password')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({
        currentPassword: adminPassword,
        newPassword: newAdminPassword,
      })
      .expect(204);

    await request(app.getHttpServer() as Server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(401);
    await refresh(refreshCookie).expect(401);

    const [admin] = await dataSource.query<UserAuthRow[]>(
      `SELECT password_hash AS passwordHash,
              must_change_password AS mustChangePassword,
              auth_version AS authVersion,
              failed_login_count AS failedLoginCount,
              locked_until AS lockedUntil, version
       FROM users WHERE id = ?`,
      [adminId],
    );
    await expect(
      verify(admin?.passwordHash ?? '', newAdminPassword),
    ).resolves.toBe(true);
    expect(admin?.mustChangePassword).toBe(0);
    expect(admin?.authVersion).toBe(2);
    // 本人の認証情報変更は管理者が編集するname／loginId／roleの競合世代と分離する。
    expect(admin?.version).toBe(1);

    const nextLogin = await login('admin', newAdminPassword).expect(200);
    const nextBody = nextLogin.body as LoginBody;
    await request(app.getHttpServer() as Server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${nextBody.accessToken}`)
      .expect(200)
      .expect(({ body: meBody }: { body: unknown }) => {
        expect(meBody).toMatchObject({
          id: adminId,
          mustChangePassword: false,
        });
      });
  });

  it('Refresh Cookieを使うAPIで不正Originを拒否する', async () => {
    const loginResponse = await login('worker01', workerPassword).expect(200);
    const cookie = extractRefreshCookie(loginResponse.headers['set-cookie']);

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/refresh')
      .set('Origin', 'https://attacker.example')
      .set('Cookie', cookie)
      .expect(403);
  });

  it('DTOにない余分な認証情報を400で拒否する', async () => {
    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/login')
      .send({
        loginId: 'worker01',
        password: workerPassword,
        role: UserRole.ADMIN,
      })
      .expect(400);
  });

  function login(loginId: string, password: string): request.Test {
    return request(app.getHttpServer() as Server)
      .post('/api/v1/auth/login')
      .send({ loginId, password });
  }

  function refresh(cookie: string): request.Test {
    return request(app.getHttpServer() as Server)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', cookie);
  }
});

function normalizeSetCookies(
  setCookie: string | string[] | undefined,
): string[] {
  if (!setCookie) {
    return [];
  }
  return Array.isArray(setCookie) ? setCookie : [setCookie];
}

function extractRefreshCookie(
  setCookie: string | string[] | undefined,
): string {
  const setCookies = normalizeSetCookies(setCookie);
  const refreshCookie = setCookies.find((value) =>
    value.startsWith(`${REFRESH_TOKEN_COOKIE_NAME}=`),
  );
  if (!refreshCookie) {
    throw new Error('Refresh Cookie was not returned');
  }
  return refreshCookie.split(';')[0] ?? '';
}
