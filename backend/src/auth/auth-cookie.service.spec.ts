import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import {
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
} from './auth.constants';
import { AuthCookieService } from './auth-cookie.service';
import { TokenService } from './token.service';

describe('AuthCookieService', () => {
  const cookie = jest.fn();
  const clearCookie = jest.fn();
  const response = { cookie, clearCookie } as unknown as Response;
  const configService = {
    getOrThrow: <T>(key: string): T => (key === 'COOKIE_SECURE' ? false : '') as T,
  } as ConfigService;
  const tokenService = {
    getRefreshTokenTtlSeconds: () => 604800,
  } as TokenService;
  const service = new AuthCookieService(configService, tokenService);

  beforeEach(() => {
    cookie.mockReset();
    clearCookie.mockReset();
  });

  it('JavaScriptから読めず認証APIだけへ送るRefresh Cookieを設定する', () => {
    service.setRefreshToken(response, 'raw-refresh-token');

    expect(cookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE_NAME,
      'raw-refresh-token',
      {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: REFRESH_TOKEN_COOKIE_PATH,
        maxAge: 604800000,
      },
    );
  });

  it('発行時と同じ属性でRefresh Cookieを削除する', () => {
    service.clearRefreshToken(response);

    expect(clearCookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: REFRESH_TOKEN_COOKIE_PATH,
    });
  });
});
