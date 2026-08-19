import { IsBoolean, IsInt, IsUUID, Min } from 'class-validator';

import { CreateDailyChecklistDto } from './create-daily-checklist.dto';

/** 現行版を特定し、入力済み内容への影響を確認したうえで設定を置き換える入力。 */
export class UpdateDailyChecklistConfigurationDto extends CreateDailyChecklistDto {
  @IsUUID('4')
  checklistId!: string;

  @IsInt()
  @Min(1)
  version!: number;

  @IsBoolean()
  confirmDataLoss!: boolean;
}
