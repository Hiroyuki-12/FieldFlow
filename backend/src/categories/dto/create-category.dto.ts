import { Transform, type TransformFnParams } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';

/** 通常の作業カテゴリを作成する入力。種別と初期状態はBackend側で固定する。 */
export class CreateCategoryDto {
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
}
