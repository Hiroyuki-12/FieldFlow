import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEnum, IsInt, IsString, Length, Matches, Min } from 'class-validator';

import { UserRole } from '../../database/entities';

/** 一覧で取得したversionを必須にし、古い画面による上書きを検出する。 */
export class UpdateUserDto {
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

  @IsInt()
  @Min(1)
  version!: number;
}
