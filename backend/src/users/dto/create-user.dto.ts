import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEnum, IsString, Length, Matches } from 'class-validator';

import { UserRole } from '../../database/entities';

/** 管理者が新しい利用者を作成するときの入力。状態とパスワードはシステム側で決める。 */
export class CreateUserDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string;

  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Length(4, 50)
  @Matches(/^[a-z0-9._-]+$/)
  loginId!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
