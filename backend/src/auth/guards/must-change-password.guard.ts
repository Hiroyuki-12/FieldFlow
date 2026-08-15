import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthenticatedRequest } from '../auth.types';
import { ALLOW_BEFORE_PASSWORD_CHANGE_KEY } from '../decorators/allow-password-change.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * 初期・仮パスワードのまま業務機能を利用することを防ぐGuard。
 * JWT Guardの後に動くため、request.userはDB確認済みの情報として扱える。
 */
@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // メソッド側の設定を優先し、なければController側の設定を読む。
    const targets = [context.getHandler(), context.getClass()];
    // 公開APIと`@AllowBeforePasswordChange()`付きAPIは、この制限の対象外。
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) ||
      this.reflector.getAllAndOverride<boolean>(
        ALLOW_BEFORE_PASSWORD_CHANGE_KEY,
        targets,
      )
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.mustChangePassword) {
      // ログイン済みだが操作条件を満たさないため、401ではなく403を返す。
      throw new ForbiddenException('パスワードの変更が必要です。');
    }
    return true;
  }
}
