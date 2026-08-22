import { Transform, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

/** 作成済み時間帯へ一括追加する作業カテゴリ。COMMONはServiceが拒否する。 */
export class AddDailyChecklistCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @Transform(({ value }: TransformFnParams): unknown =>
    Array.isArray(value)
      ? value.map((id: unknown) =>
          typeof id === 'string' ? id.toLowerCase() : id,
        )
      : value,
  )
  categoryIds!: string[];
}
