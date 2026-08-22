import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEnum, IsUUID } from 'class-validator';

import { ChecklistPeriodType } from '../../database/entities';
import { DailyChecklistDateParamsDto } from './daily-checklist-date-params.dto';

/** 日付に加え、FULL_DAY／午前／午後のどの時間帯を操作するかを検証する。 */
export class DailyChecklistPeriodParamsDto extends DailyChecklistDateParamsDto {
  @IsEnum(ChecklistPeriodType)
  period!: ChecklistPeriodType;
}

/** 項目更新URLのUUIDも検証し、不正値をDB検索へ渡さない。 */
export class DailyChecklistItemParamsDto extends DailyChecklistPeriodParamsDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID('4')
  itemId!: string;
}
