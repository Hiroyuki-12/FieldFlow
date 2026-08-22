import { IsBoolean, IsInt, Max, Min } from 'class-validator';

/** 行単位自動保存の入力。実際の在庫上限は項目スナップショットとServiceで照合する。 */
export class UpdateDailyChecklistItemDto {
  @IsInt()
  @Min(0)
  @Max(9999)
  takeoutQuantity!: number;

  @IsBoolean()
  checked!: boolean;

  // 画面が取得した版を必須にし、別利用者の先行更新を黙って上書きしない。
  @IsInt()
  @Min(1)
  version!: number;
}
