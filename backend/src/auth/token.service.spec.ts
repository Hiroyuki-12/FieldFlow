import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { RecordStatus, User, UserRole } from '../database/entities';
import { TokenService } from './token.service';

describe('TokenService', () => {
  const secret = 'unit-test-secret-with-at-least-32-characters';
  const configValues = new Map<string, number>([
    ['JWT_ACCESS_TTL_SECONDS', 900],
    ['REFRESH_TOKEN_TTL_SECONDS', 604800],
  ]);
  const configService = {
    getOrThrow: <T>(key: string): T => configValues.get(key) as T,
  } as ConfigService;
  const jwtService = new JwtService({
    secret,
    signOptions: { expiresIn: 900 },
  });
  const service = new TokenService(jwtService, configService);

  const user = Object.assign(new User(), {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'テスト作業者',
    loginId: 'worker01',
    passwordHash: 'not-used',
    role: UserRole.WORKER,
    status: RecordStatus.ACTIVE,
    mustChangePassword: false,
    authVersion: 3,
  });

  it('個人情報を含めず認可と失効に必要なJWTクレームを発行する', async () => {
    const token = await service.createAccessToken(user);
    const payload = await service.verifyAccessToken(token);

    expect(payload).toMatchObject({
      sub: user.id,
      role: UserRole.WORKER,
      mustChangePassword: false,
      authVersion: 3,
    });
    expect(payload.jti).toEqual(expect.any(String));
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('loginId');
  });

  it('改ざんされたAccess Tokenを拒否する', async () => {
    const token = await service.createAccessToken(user);

    await expect(
      service.verifyAccessToken(`${token.slice(0, -1)}x`),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('Refresh Token本体とDB保存用ハッシュを分離する', () => {
    const now = new Date('2026-08-15T00:00:00.000Z');
    const first = service.createRefreshToken(now);
    const second = service.createRefreshToken(now);

    expect(first.rawToken).not.toBe(first.tokenHash);
    expect(first.tokenHash).toHaveLength(64);
    expect(first.tokenHash).toBe(service.hashRefreshToken(first.rawToken));
    expect(first.rawToken).not.toBe(second.rawToken);
    expect(first.expiresAt.toISOString()).toBe('2026-08-22T00:00:00.000Z');
  });
});
