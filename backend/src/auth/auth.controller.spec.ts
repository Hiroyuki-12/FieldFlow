import type { Response } from 'express';

import { UserRole } from '../database/entities';
import { AuthCookieService } from './auth-cookie.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest, LoginResponse } from './auth.types';

describe('AuthController', () => {
  const loginResponse: LoginResponse = {
    accessToken: 'access-token',
    expiresIn: 900,
    user: {
      id: 'user-id',
      name: '作業者',
      loginId: 'worker01',
      role: UserRole.WORKER,
      mustChangePassword: false,
    },
  };
  const loginMock = jest.fn();
  const changePasswordMock = jest.fn();
  const setRefreshTokenMock = jest.fn();
  const clearRefreshTokenMock = jest.fn();
  const authService = {
    login: loginMock,
    changePassword: changePasswordMock,
  } as unknown as AuthService;
  const authCookieService = {
    setRefreshToken: setRefreshTokenMock,
    clearRefreshToken: clearRefreshTokenMock,
  } as unknown as AuthCookieService;
  const controller = new AuthController(authService, authCookieService);
  const request = {
    ip: '127.0.0.1',
    get: ((name: string) =>
      name === 'user-agent' ? 'test-browser' : undefined) as unknown,
    cookies: {},
  } as AuthenticatedRequest;
  const response = {} as Response;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Login結果のRefresh TokenだけをCookieへ移し公開レスポンスから除外する', async () => {
    loginMock.mockResolvedValue({
      response: loginResponse,
      refreshToken: 'raw-refresh-token',
    });

    await expect(
      controller.login(
        { loginId: 'worker01', password: 'worker password 123' },
        request,
        response,
      ),
    ).resolves.toEqual(loginResponse);
    expect(setRefreshTokenMock).toHaveBeenCalledWith(
      response,
      'raw-refresh-token',
    );
    expect(JSON.stringify(loginResponse)).not.toContain('raw-refresh-token');
  });

  it('パスワード変更成功後にブラウザのRefresh Cookieも削除する', async () => {
    changePasswordMock.mockResolvedValue(undefined);
    const user = {
      id: 'user-id',
      name: '作業者',
      loginId: 'worker01',
      role: UserRole.WORKER,
      mustChangePassword: true,
      authVersion: 1,
    };

    await controller.changePassword(
      user,
      {
        currentPassword: 'worker password 123',
        newPassword: 'new worker password 456',
      },
      response,
    );

    expect(changePasswordMock).toHaveBeenCalledWith(
      user,
      expect.any(Object),
    );
    expect(clearRefreshTokenMock).toHaveBeenCalledWith(response);
  });
});
