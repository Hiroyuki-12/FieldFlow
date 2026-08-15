import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthenticatedRequest, AuthenticatedUser } from '../auth.types';

/**
 * JWT GuardがRequestへ設定した現在ユーザーを、Controller引数へ取り出すデコレータ。
 * Controllerでは`@CurrentUser() user`と書くだけで、認証済みUserを受け取れる。
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      // 通常はJWT Guardが先に拒否するため到達しない。型上も未認証値を業務処理へ渡さない。
      throw new Error('Authenticated user is missing from the request');
    }
    return request.user;
  },
);
