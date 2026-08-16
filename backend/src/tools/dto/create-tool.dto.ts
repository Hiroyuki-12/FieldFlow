import { Transform, type TransformFnParams } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, Max, Min } from 'class-validator';

/** 道具を作成する入力。初期状態とversionはBackend側で固定する。 */
export class CreateToolDto {
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
}
