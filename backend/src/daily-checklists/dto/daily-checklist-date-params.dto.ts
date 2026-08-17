import { IsDateString, Matches } from 'class-validator';

/** 日別表URLの日付。時刻付きISO文字列を許さず、業務日だけを受け取る。 */
export class DailyChecklistDateParamsDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true, strictSeparator: true })
  date!: string;
}
