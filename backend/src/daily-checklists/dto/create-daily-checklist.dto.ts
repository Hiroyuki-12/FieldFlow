import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import { ChecklistPeriodType, ScheduleMode } from '../../database/entities';

/** 1つの時間帯で利用者が選択する作業カテゴリ。 */
export class CreateDailyChecklistPeriodDto {
  @IsEnum(ChecklistPeriodType)
  period!: ChecklistPeriodType;

  @IsArray()
  @ArrayMinSize(1)
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

/** FULL_DAYまたはSPLIT方式の日別表を一括作成する入力。 */
export class CreateDailyChecklistDto {
  @IsEnum(ScheduleMode)
  scheduleMode!: ScheduleMode;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateDailyChecklistPeriodDto)
  periods!: CreateDailyChecklistPeriodDto[];
}
