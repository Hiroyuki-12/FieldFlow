import { IsEnum, IsInt, Min } from 'class-validator';

import { RecordStatus } from '../../database/entities';

export class UpdateUserStatusDto {
  @IsEnum(RecordStatus)
  status!: RecordStatus;

  @IsInt()
  @Min(1)
  version!: number;
}
