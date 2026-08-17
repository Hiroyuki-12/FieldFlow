import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { DailyChecklistResponse } from './daily-checklist.types';
import { DailyChecklistsService } from './daily-checklists.service';
import { CreateDailyChecklistDto } from './dto/create-daily-checklist.dto';
import { DailyChecklistDateParamsDto } from './dto/daily-checklist-date-params.dto';

/** `/api/v1/daily-checklists`のHTTP入口。管理者・作業者の両方が利用できる。 */
@ApiTags('daily-checklists')
@ApiBearerAuth()
@Controller('v1/daily-checklists')
export class DailyChecklistsController {
  constructor(
    private readonly dailyChecklistsService: DailyChecklistsService,
  ) {}

  @Get(':date')
  @ApiOperation({ summary: '作成済みの日別チェックを取得する' })
  findByDate(
    @Param() params: DailyChecklistDateParamsDto,
  ): Promise<DailyChecklistResponse> {
    return this.dailyChecklistsService.findByDate(params.date);
  }

  @Put(':date')
  @ApiOperation({ summary: '日別チェックを冪等に作成または取得する' })
  createOrGet(
    @Param() params: DailyChecklistDateParamsDto,
    @Body() dto: CreateDailyChecklistDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DailyChecklistResponse> {
    return this.dailyChecklistsService.createOrGet(params.date, dto, user.id);
  }
}
