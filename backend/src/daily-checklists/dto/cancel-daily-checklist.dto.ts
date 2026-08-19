import { IsBoolean, IsInt, IsUUID, Min } from 'class-validator';

/** 削除対象の現行版と、入力済み内容を含む取消への明示確認を受け取る。 */
export class CancelDailyChecklistDto {
  @IsUUID('4')
  checklistId!: string;

  @IsInt()
  @Min(1)
  version!: number;

  @IsBoolean()
  confirmDataLoss!: boolean;
}
