import { ConfigService } from '@nestjs/config';

import { ApplicationLogger, sanitizeLogValue } from './application-logger';
import { runWithRequestContext } from './request-context';

describe('ApplicationLogger', () => {
  let stdoutSpy: jest.SpiedFunction<typeof process.stdout.write>;
  let stderrSpy: jest.SpiedFunction<typeof process.stderr.write>;

  beforeEach(() => {
    stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('共通項目とrequestIdを持つ1行JSONを出力する', () => {
    const logger = createLogger('debug');

    runWithRequestContext({ requestId: 'request-id-123' }, () => {
      logger.event('info', 'test_event', {
        userId: 'user-id',
        requestId: 'untrusted-override',
        event: 'untrusted-event',
      });
    });

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const line = String(stdoutSpy.mock.calls[0]?.[0]);
    expect(line.endsWith('\n')).toBe(true);
    expect(line.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(line) as unknown).toMatchObject({
      level: 'info',
      service: 'fieldflow-backend',
      environment: 'test',
      requestId: 'request-id-123',
      event: 'test_event',
      userId: 'user-id',
    });
  });

  it('秘密キーを階層にかかわらずマスキングする', () => {
    const logger = createLogger('info');

    logger.event('warn', 'security_event', {
      password: 'plain-password',
      nested: {
        accessToken: 'access-token-value',
        headers: { authorization: 'Bearer secret-value' },
      },
      userId: 'safe-user-id',
    });

    const line = String(stdoutSpy.mock.calls[0]?.[0]);
    expect(line).toContain('safe-user-id');
    expect(line).not.toContain('plain-password');
    expect(line).not.toContain('access-token-value');
    expect(line).not.toContain('Bearer secret-value');
    expect(line.match(/\[REDACTED\]/g)?.length).toBe(3);
  });

  it('Errorのmessageとstackをそのまま直列化しない', () => {
    const sanitized = sanitizeLogValue(
      new Error('SQL failed with password=database-secret'),
    );

    expect(sanitized).toEqual({ name: 'Error' });
    expect(JSON.stringify(sanitized)).not.toContain('database-secret');
  });

  it('既知の環境変数秘密値が自由文へ混入してもマスキングする', () => {
    const logger = new ApplicationLogger(
      new ConfigService({
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
        DB_PASSWORD: 'known-database-secret',
      }),
    );

    logger.error('Connection failed: known-database-secret');

    const line = String(stderrSpy.mock.calls[0]?.[0]);
    expect(line).not.toContain('known-database-secret');
    expect(line).toContain('[REDACTED]');
  });

  it('設定レベルより詳細なログを出力しない', () => {
    const logger = createLogger('warn');

    logger.event('info', 'ignored_event');
    logger.event('warn', 'recorded_event');

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    expect(String(stdoutSpy.mock.calls[0]?.[0])).toContain('recorded_event');
  });

  function createLogger(level: string): ApplicationLogger {
    return new ApplicationLogger(
      new ConfigService({ NODE_ENV: 'test', LOG_LEVEL: level }),
    );
  }
});
