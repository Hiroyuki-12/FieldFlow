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
import {
  CategoryListResponse,
  CategoryResponse,
} from './category.types';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { UpdateCategoryStatusDto } from './dto/update-category-status.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/** `/api/v1/categories`のHTTP入口。マスター管理操作はADMINだけへ公開する。 */
@ApiTags('categories')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('v1/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: '作業カテゴリを検索・一覧取得する' })
  findAll(
    @Query() query: ListCategoriesQueryDto,
  ): Promise<CategoryListResponse> {
    return this.categoriesService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: '通常の作業カテゴリを作成する' })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponse> {
    return this.categoriesService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '作業カテゴリ詳細を取得する' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CategoryResponse> {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '作業カテゴリの名前・表示順を更新する' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.categoriesService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '作業カテゴリを利用停止または再有効化する' })
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryStatusDto,
  ): Promise<CategoryResponse> {
    return this.categoriesService.updateStatus(id, dto);
  }
}
