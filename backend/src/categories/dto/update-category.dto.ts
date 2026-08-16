import { Transform, type TransformFnParams } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';

/** 一覧で取得したversionを必須にし、古い画面による上書きを検出する。 */
export class UpdateCategoryDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 50)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(9999)
  displayOrder!: number;

  @IsInt()
  @Min(1)
  version!: number;
}
