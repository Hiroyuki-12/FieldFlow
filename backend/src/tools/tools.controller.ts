import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/entities';
import { CreateToolDto } from './dto/create-tool.dto';
import { ListToolsQueryDto } from './dto/list-tools-query.dto';
import { UpdateToolStatusDto } from './dto/update-tool-status.dto';
import { UpdateToolDto } from './dto/update-tool.dto';
import { ToolListResponse, ToolResponse } from './tool.types';
import { ToolsService } from './tools.service';

/** `/api/v1/tools`のHTTP入口。閲覧は全員、変更操作はADMINだけへ公開する。 */
@ApiTags('tools')
@ApiBearerAuth()
@Controller('v1/tools')
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  @Get()
  @ApiOperation({ summary: '道具を検索・一覧取得する' })
  findAll(@Query() query: ListToolsQueryDto): Promise<ToolListResponse> {
    return this.toolsService.findAll(query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '道具を作成する' })
  create(@Body() dto: CreateToolDto): Promise<ToolResponse> {
    return this.toolsService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '道具詳細を取得する' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<ToolResponse> {
    return this.toolsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '道具の名前・カテゴリ・在庫数・表示順を更新する' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateToolDto,
  ): Promise<ToolResponse> {
    return this.toolsService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '道具を利用停止または再有効化する' })
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateToolStatusDto,
  ): Promise<ToolResponse> {
    return this.toolsService.updateStatus(id, dto);
  }
}
