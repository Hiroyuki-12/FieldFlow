import { SetMetadata } from '@nestjs/common';

export const ALLOW_BEFORE_PASSWORD_CHANGE_KEY = 'allowBeforePasswordChange';

/**
 * 初回パスワード変更前でも例外的に呼び出せるAPIへ付ける。
 * MustChangePasswordGuardがこのmetadataを読み、Password変更APIを通過させる。
 */
export const AllowBeforePasswordChange = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_BEFORE_PASSWORD_CHANGE_KEY, true);
