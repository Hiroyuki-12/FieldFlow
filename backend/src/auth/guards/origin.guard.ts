import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthenticatedRequest } from '../auth.types';

/**
 * Cookieを使うRefresh／LogoutでOrigin Headerを照合するGuard。
 * ブラウザがCookieを自動送信しても、許可していない別サイトからの操作は403にする。
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const allowedOrigin = this.configService.getOrThrow<string>('CORS_ORIGIN');

    // Originがない場合も安全側で拒否し、完全一致したFrontendだけを許可する。
    if (request.get('origin') !== allowedOrigin) {
      throw new ForbiddenException('許可されていない送信元です。');
    }
    return true;
  }
}
