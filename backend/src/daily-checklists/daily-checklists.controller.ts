import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type {
  DailyChecklistItemResponse,
  DailyChecklistResponse,
} from './daily-checklist.types';
import { DailyChecklistsService } from './daily-checklists.service';
import { AddDailyChecklistCategoriesDto } from './dto/add-daily-checklist-categories.dto';
import { CreateDailyChecklistDto } from './dto/create-daily-checklist.dto';
import { CancelDailyChecklistDto } from './dto/cancel-daily-checklist.dto';
import { DailyChecklistDateParamsDto } from './dto/daily-checklist-date-params.dto';
import {
  DailyChecklistItemParamsDto,
  DailyChecklistPeriodParamsDto,
} from './dto/daily-checklist-period-params.dto';
import { UpdateDailyChecklistItemDto } from './dto/update-daily-checklist-item.dto';
import { UpdateDailyChecklistConfigurationDto } from './dto/update-daily-checklist-configuration.dto';

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

  @Patch(':date/periods/:period/items/:itemId')
  @ApiOperation({ summary: '日別チェックの数量・準備状態を行単位で更新する' })
  updateItem(
    @Param() params: DailyChecklistItemParamsDto,
    @Body() dto: UpdateDailyChecklistItemDto,
  ): Promise<DailyChecklistItemResponse> {
    return this.dailyChecklistsService.updateItem(
      params.date,
      params.period,
      params.itemId,
      dto,
    );
  }

  @Post(':date/periods/:period/categories')
  @ApiOperation({ summary: '作成済み時間帯へ作業カテゴリと道具を追加する' })
  addCategories(
    @Param() params: DailyChecklistPeriodParamsDto,
    @Body() dto: AddDailyChecklistCategoriesDto,
  ): Promise<DailyChecklistResponse> {
    return this.dailyChecklistsService.addCategories(
      params.date,
      params.period,
      dto,
    );
  }

  @Patch(':date/configuration')
  @ApiOperation({ summary: '日別チェックの時間帯・作業内容を変更する' })
  updateConfiguration(
    @Param() params: DailyChecklistDateParamsDto,
    @Body() dto: UpdateDailyChecklistConfigurationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DailyChecklistResponse> {
    return this.dailyChecklistsService.updateConfiguration(
      params.date,
      dto,
      user.id,
    );
  }

  @Delete(':date')
  @HttpCode(204)
  @ApiOperation({ summary: '日別チェックの現行版を取り消して履歴へ残す' })
  async cancel(
    @Param() params: DailyChecklistDateParamsDto,
    @Body() dto: CancelDailyChecklistDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.dailyChecklistsService.cancel(params.date, dto, user.id);
  }
}
