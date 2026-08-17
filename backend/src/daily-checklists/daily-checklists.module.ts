import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  Category,
  DailyChecklist,
  DailyChecklistItem,
  DailyChecklistPeriod,
  DailyChecklistPeriodCategory,
  Tool,
} from '../database/entities';
import { DailyChecklistsController } from './daily-checklists.controller';
import { DailyChecklistsService } from './daily-checklists.service';

/** 日別表の作成・取得に必要なController、Service、RepositoryをまとめるModule。 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyChecklist,
      DailyChecklistPeriod,
      DailyChecklistPeriodCategory,
      DailyChecklistItem,
      Category,
      Tool,
    ]),
  ],
  controllers: [DailyChecklistsController],
  providers: [DailyChecklistsService],
})
export class DailyChecklistsModule {}
