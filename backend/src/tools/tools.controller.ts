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

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditLogService } from '../common/logging/audit-log.service';
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
  constructor(
    private readonly toolsService: ToolsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: '道具を検索・一覧取得する' })
  findAll(@Query() query: ListToolsQueryDto): Promise<ToolListResponse> {
    return this.toolsService.findAll(query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '道具を作成する' })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateToolDto,
  ): Promise<ToolResponse> {
    const created = await this.toolsService.create(dto);
    this.auditLogService.management(
      currentUser.id,
      'tool_created',
      'tool',
      created.id,
    );
    return created;
  }

  @Get(':id')
  @ApiOperation({ summary: '道具詳細を取得する' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<ToolResponse> {
    return this.toolsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '道具の名前・カテゴリ・在庫数・表示順を更新する' })
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateToolDto,
  ): Promise<ToolResponse> {
    const updated = await this.toolsService.update(id, dto);
    this.auditLogService.management(
      currentUser.id,
      'tool_updated',
      'tool',
      updated.id,
    );
    return updated;
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '道具を利用停止または再有効化する' })
  async updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateToolStatusDto,
  ): Promise<ToolResponse> {
    const updated = await this.toolsService.updateStatus(id, dto);
    this.auditLogService.management(
      currentUser.id,
      'tool_status_updated',
      'tool',
      updated.id,
    );
    return updated;
  }
}
