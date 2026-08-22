import {
  Controller,
  ConflictException,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  INestApplication,
  Module,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  SkipThrottle,
  Throttle,
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import { ApplicationLogger } from '../src/common/logging/application-logger';
import { LoggingModule } from '../src/common/logging/logging.module';
import { configureApp } from '../src/configure-app';

interface ErrorResponseBody {
  statusCode: number;
  message: string;
  requestId: string;
  timestamp: string;
  code?: string;
  details?: unknown;
}

@Controller('v1/logging-test')
class LoggingTestController {
  @Get('ok/:id')
  ok(@Param('id') id: string): { id: string } {
    return { id };
  }

  @Get('unauthorized')
  unauthorized(): never {
    throw new UnauthorizedException('認証が必要です。');
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException('この操作を実行する権限がありません。');
  }

  @Get('conflict/:id')
  conflict(): never {
    throw new ConflictException({
      statusCode: HttpStatus.CONFLICT,
      code: 'CHECKLIST_ITEM_UPDATE_CONFLICT',
      message: '他のユーザーが更新しました。',
      details: {
        currentItem: { id: 'public-item-id', quantity: 2, version: 4 },
      },
    });
  }

  @Get('failure')
  failure(): never {
    throw new Error(
      'SELECT password_hash FROM users WHERE password = database-secret',
    );
  }

  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Get('limited')
  limited(): { status: string } {
    return { status: 'ok' };
  }

  @SkipThrottle()
  @Get('health-like')
  healthLike(): { status: string } {
    return { status: 'ok' };
  }

  @Post('body')
  @HttpCode(HttpStatus.NO_CONTENT)
  acceptBody(): void {}
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [
        (): Record<string, unknown> => ({
          NODE_ENV: 'test',
          LOG_LEVEL: 'debug',
          CORS_ORIGIN: 'http://localhost:5173',
          TRUST_PROXY_HOPS: 0,
        }),
      ],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    LoggingModule,
  ],
  controllers: [LoggingTestController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class LoggingTestModule {}

describe('Logging and security foundation (integration)', () => {
  let app: INestApplication;
  let stdoutSpy: jest.SpiedFunction<typeof process.stdout.write>;
  let stderrSpy: jest.SpiedFunction<typeof process.stderr.write>;

  beforeAll(async () => {
    // 他の結合suiteがprocess.envへ設定したログ閾値を引き継がず、このsuiteでは全Levelを検証する。
    process.env.LOG_LEVEL = 'debug';
    stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [LoggingTestModule],
    }).compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.useLogger(app.get(ApplicationLogger));
    configureApp(app);
    await app.init();
  });

  beforeEach(() => {
    stdoutSpy.mockClear();
    stderrSpy.mockClear();
  });

  afterAll(async () => {
    await app.close();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('requestIdをHeaderとJSONアクセスログで共有し実ID・Query・Bodyを記録しない', async () => {
    const actualId = '11111111-1111-4111-8111-111111111111';
    const response = await request(app.getHttpServer() as Server)
      .get(`/api/v1/logging-test/ok/${actualId}?password=do-not-log`)
      .set('X-Request-Id', 'external-request-id')
      .expect(200);
    const requestId = String(response.headers['x-request-id']);
    const accessLog = findLog('http_request_completed', requestId);

    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId).not.toBe('external-request-id');
    expect(accessLog).toMatchObject({
      level: 'info',
      method: 'GET',
      statusCode: 200,
      requestId,
    });
    expect(String(accessLog.path)).toContain(':id');
    expect(JSON.stringify(accessLog)).not.toContain(actualId);
    expect(JSON.stringify(accessLog)).not.toContain('do-not-log');
  });

  it.each([
    ['unauthorized', 401],
    ['forbidden', 403],
  ])('%sをrequestId付きの安全な共通形式で返す', async (path, status) => {
    const response = await request(app.getHttpServer() as Server)
      .get(`/api/v1/logging-test/${path}`)
      .expect(status);
    const body = response.body as ErrorResponseBody;

    expect(body.statusCode).toBe(status);
    expect(body.requestId).toBe(response.headers['x-request-id']);
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(findLog('http_exception', body.requestId)).toMatchObject({
      statusCode: status,
      requestId: body.requestId,
    });
  });

  it('409のcodeと安全な復旧detailsを維持する', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/api/v1/logging-test/conflict/22222222-2222-4222-8222-222222222222')
      .expect(409);
    const body = response.body as ErrorResponseBody;

    expect(body).toMatchObject({
      statusCode: 409,
      code: 'CHECKLIST_ITEM_UPDATE_CONFLICT',
      details: {
        currentItem: { id: 'public-item-id', quantity: 2, version: 4 },
      },
    });
    expect(body.requestId).toBe(response.headers['x-request-id']);
  });

  it('500で内部例外・SQL・秘密値を隠しrequestIdだけを調査手掛かりとして返す', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/api/v1/logging-test/failure')
      .expect(500);
    const body = response.body as ErrorResponseBody;
    const allOutput = capturedOutput();

    expect(body).toMatchObject({
      statusCode: 500,
      message: 'サーバーで予期しないエラーが発生しました。',
    });
    expect(body.requestId).toBe(response.headers['x-request-id']);
    expect(JSON.stringify(body)).not.toContain('SELECT');
    expect(allOutput).not.toContain('database-secret');
    expect(findLog('http_exception', body.requestId)).toMatchObject({
      level: 'error',
      statusCode: 500,
    });
  });

  it('同じIPから上限を超えた一般APIを429で拒否する', async () => {
    const server = app.getHttpServer() as Server;
    await request(server).get('/api/v1/logging-test/limited').expect(200);
    await request(server).get('/api/v1/logging-test/limited').expect(200);
    const response = await request(server)
      .get('/api/v1/logging-test/limited')
      .expect(429);
    const body = response.body as ErrorResponseBody;

    expect(body.message).toContain('一時的に制限');
    expect(body.requestId).toBe(response.headers['x-request-id']);
    expect(findLog('http_exception', body.requestId)).toMatchObject({
      level: 'warn',
      statusCode: 429,
    });
  });

  it('監視用Endpointをレート制限から除外する', async () => {
    const server = app.getHttpServer() as Server;
    for (let attempt = 0; attempt < 105; attempt += 1) {
      await request(server).get('/api/v1/logging-test/health-like').expect(200);
    }
  });

  it('HelmetのHeaderを返し100KBを超えるBodyをrequestId付き413で拒否する', async () => {
    const server = app.getHttpServer() as Server;
    const headerResponse = await request(server)
      .get('/api/v1/logging-test/health-like')
      .expect(200);
    expect(headerResponse.headers['x-content-type-options']).toBe('nosniff');
    expect(headerResponse.headers['x-frame-options']).toBe('SAMEORIGIN');

    const response = await request(server)
      .post('/api/v1/logging-test/body')
      .send({ data: 'x'.repeat(110 * 1024) })
      .expect(413);
    const body = response.body as ErrorResponseBody;
    expect(body.message).toContain('サイズが上限');
    expect(body.requestId).toBe(response.headers['x-request-id']);
  });

  function findLog(event: string, requestId: string): Record<string, unknown> {
    const found = parseLogs().find(
      (entry) => entry.event === event && entry.requestId === requestId,
    );
    if (!found) throw new Error(`Log not found: ${event} ${requestId}`);
    return found;
  }

  function parseLogs(): Record<string, unknown>[] {
    return capturedOutput()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  function capturedOutput(): string {
    return [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls]
      .map((call) => String(call[0]))
      .join('');
  }
});
