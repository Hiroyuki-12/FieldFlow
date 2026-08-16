import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { RecordStatus } from '../../database/entities';

/** カテゴリ管理一覧の名前検索と状態絞り込み。件数が小さいマスターのためページングしない。 */
export class ListCategoriesQueryDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}
