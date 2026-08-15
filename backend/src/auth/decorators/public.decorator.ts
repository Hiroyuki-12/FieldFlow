import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 認証不要で公開する入口を明示するデコレータ。
 * SetMetadataは`isPublic=true`をControllerへ記録し、JwtAuthGuardがReflectorで読み取る。
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
