import { Transform, type TransformFnParams } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, Max, Min } from 'class-validator';

/** 一覧で取得したversionを必須にし、古い画面による上書きを検出する。 */
export class UpdateToolDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsUUID()
  categoryId!: string;

  @IsInt()
  @Min(0)
  @Max(9999)
  stockQuantity!: number;

  @IsInt()
  @Min(0)
  @Max(9999)
  displayOrder!: number;

  @IsInt()
  @Min(1)
  version!: number;
}
