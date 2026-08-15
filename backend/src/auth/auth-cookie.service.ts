import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';

import {
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
} from './auth.constants';
import { TokenService } from './token.service';

/**
 * ExpressのResponseへRefresh Cookieを付け外しするService。
 * Cookie属性をControllerごとに書かず、このクラスへ集約して設定漏れを防ぐ。
 */
@Injectable()
export class AuthCookieService {
  constructor(
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
  ) {}

  /** Login／Refresh成功時に、生のRefresh TokenをHttpOnly Cookieとして返す。 */
  setRefreshToken(response: Response, token: string): void {
    response.cookie(REFRESH_TOKEN_COOKIE_NAME, token, {
      ...this.baseOptions(),
      maxAge: this.tokenService.getRefreshTokenTtlSeconds() * 1000,
    });
  }

  /** Logout／パスワード変更後に、ブラウザへCookie削除を指示する。 */
  clearRefreshToken(response: Response): void {
    // 発行時と同じPath・Secure・SameSiteを指定し、対象Cookieを確実に削除する。
    response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, this.baseOptions());
  }

  private baseOptions(): CookieOptions {
    return {
      // ブラウザのJavaScriptから読めなくし、XSS時のToken窃取を難しくする。
      httpOnly: true,
      // 本番ではHTTPS通信だけにCookieを送る。ローカルHTTPでは環境変数でfalseにする。
      secure: this.configService.getOrThrow<boolean>('COOKIE_SECURE'),
      // 別サイトからの通常のPOSTではCookieを送らず、CSRFの危険を下げる。
      sameSite: 'lax',
      // 認証API以外のリクエストへRefresh Tokenを付けない。
      path: REFRESH_TOKEN_COOKIE_PATH,
    };
  }
}
