import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';

import { RecordStatus, User, UserRole } from '../../database/entities';
import { AuthenticatedRequest } from '../auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MustChangePasswordGuard } from './must-change-password.guard';
import { OriginGuard } from './origin.guard';
import { RolesGuard } from './roles.guard';
import { TokenService } from '../token.service';

function createContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    getHandler: () => (): void => undefined,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: <T>(): T => request as T,
      getResponse: <T>(): T => ({}) as T,
      getNext: <T>(): T => ({}) as T,
    }),
  } as unknown as ExecutionContext;
}

describe('Authentication guards', () => {
  it('JWTとDB状態が一致する利用中ユーザーをRequestへ設定する', async () => {
    const request = {
      get: (name: string) =>
        name === 'authorization' ? 'Bearer valid-token' : undefined,
    } as Partial<AuthenticatedRequest>;
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const tokenService = {
      verifyAccessToken: jest.fn().mockResolvedValue({
        sub: 'user-id',
        role: UserRole.WORKER,
        mustChangePassword: false,
        authVersion: 2,
        jti: 'token-id',
      }),
    } as unknown as TokenService;
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-id',
        name: '作業者',
        loginId: 'worker01',
        role: UserRole.WORKER,
        status: RecordStatus.ACTIVE,
        mustChangePassword: false,
        authVersion: 2,
      }),
    } as unknown as Repository<User>;
    const guard = new JwtAuthGuard(reflector, tokenService, userRepository);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: 'user-id', role: UserRole.WORKER });
  });

  it('初回パスワード変更前の業務APIを403で拒否する', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new MustChangePasswordGuard(reflector);
    const context = createContext({
      user: {
        id: 'user-id',
        name: '管理者',
        loginId: 'admin',
        role: UserRole.ADMIN,
        mustChangePassword: true,
        authVersion: 1,
      },
    });

    expect(() => guard.canActivate(context)).toThrow(
      'パスワードの変更が必要です。',
    );
  });

  it('必要Roleを持たない認証済みユーザーを403で拒否する', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce([UserRole.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = createContext({
      user: {
        id: 'user-id',
        name: '作業者',
        loginId: 'worker01',
        role: UserRole.WORKER,
        mustChangePassword: false,
        authVersion: 1,
      },
    });

    expect(() => guard.canActivate(context)).toThrow(
      'この操作を実行する権限がありません。',
    );
  });

  it('RefreshとLogoutで許可Origin以外を拒否する', () => {
    const configService = {
      getOrThrow: () => 'http://localhost:5173',
    } as unknown as ConfigService;
    const guard = new OriginGuard(configService);
    const context = createContext({
      get: (() =>
        'https://attacker.example') as unknown as AuthenticatedRequest['get'],
    });

    expect(() => guard.canActivate(context)).toThrow(
      '許可されていない送信元です。',
    );
  });
});
