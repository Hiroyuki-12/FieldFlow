import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { UserRole } from '../../database/entities';
import { AuthenticatedRequest } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * `@Roles(UserRole.ADMIN)`のようにControllerが宣言したRoleと、現在ユーザーを比較する。
 * 認証済みでも権限が足りない場合は403を返す。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    // `@Roles()`が付いていないAPIは、ADMIN／WORKERどちらの認証ユーザーも通す。
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      targets,
    );
    if (!requiredRoles?.length) {
      return true;
    }

    // userは先に動いたJwtAuthGuardがDB確認後にRequestへ設定している。
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user || !requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException('この操作を実行する権限がありません。');
    }
    return true;
  }
}
