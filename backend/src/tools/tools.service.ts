import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';

import { Category, RecordStatus, Tool } from '../database/entities';
import { CreateToolDto } from './dto/create-tool.dto';
import { ListToolsQueryDto } from './dto/list-tools-query.dto';
import { UpdateToolStatusDto } from './dto/update-tool-status.dto';
import { UpdateToolDto } from './dto/update-tool.dto';
import {
  ToolListResponse,
  ToolResponse,
  ToolWithCategory,
  toToolCategoryOption,
  toToolResponse,
} from './tool.types';

/** 道具の検索、カテゴリ整合性、更新競合、状態変更を担当する業務Service。 */
@Injectable()
export class ToolsService {
  constructor(
    @InjectRepository(Tool)
    private readonly toolRepository: Repository<Tool>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: ListToolsQueryDto): Promise<ToolListResponse> {
    const builder = this.toolRepository
      .createQueryBuilder('tool')
      .innerJoinAndSelect('tool.category', 'category');
    if (query.search) {
      builder.andWhere('tool.name LIKE :search', {
        search: `%${query.search}%`,
      });
    }
    if (query.categoryId) {
      builder.andWhere('tool.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.status) {
      builder.andWhere('tool.status = :status', { status: query.status });
    }

    // 現在ページに道具がないカテゴリも、絞り込み・管理フォームで選べるよう全件返す。
    const [[tools, total], categories] = await Promise.all([
      builder
        .orderBy('category.displayOrder', 'ASC')
        .addOrderBy('tool.displayOrder', 'ASC')
        .addOrderBy('tool.name', 'ASC')
        .addOrderBy('tool.id', 'ASC')
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize)
        .getManyAndCount(),
      this.categoryRepository.find({
        order: { displayOrder: 'ASC', name: 'ASC', id: 'ASC' },
      }),
    ]);
    return {
      items: (tools as ToolWithCategory[]).map(toToolResponse),
      categories: categories.map(toToolCategoryOption),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async create(dto: CreateToolDto): Promise<ToolResponse> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const category = await this.lockActiveCategory(manager, dto.categoryId);
        const tool = manager.getRepository(Tool).create({
          id: randomUUID(),
          name: dto.name,
          categoryId: category.id,
          stockQuantity: dto.stockQuantity,
          displayOrder: dto.displayOrder,
          status: RecordStatus.ACTIVE,
        });
        const saved = await manager.getRepository(Tool).save(tool);
        return toToolResponse(Object.assign(saved, { category }));
      });
    } catch (error) {
      this.rethrowDuplicateName(error);
    }
  }

  async findOne(id: string): Promise<ToolResponse> {
    const tool = await this.toolRepository.findOne({
      where: { id },
      relations: { category: true },
    });
    if (!tool) throw new NotFoundException('道具が見つかりません。');
    return toToolResponse(tool);
  }

  async update(id: string, dto: UpdateToolDto): Promise<ToolResponse> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const tool = await this.lockTool(manager, id);
        this.assertVersion(tool, dto.version);
        // カテゴリ行を保存まで固定し、状態確認直後のカテゴリ停止を防ぐ。
        const category = await this.lockActiveCategory(manager, dto.categoryId);

        tool.name = dto.name;
        tool.categoryId = category.id;
        tool.stockQuantity = dto.stockQuantity;
        tool.displayOrder = dto.displayOrder;
        const saved = await manager.getRepository(Tool).save(tool);
        return toToolResponse(Object.assign(saved, { category }));
      });
    } catch (error) {
      this.rethrowDuplicateName(error);
    }
  }

  async updateStatus(
    id: string,
    dto: UpdateToolStatusDto,
  ): Promise<ToolResponse> {
    return this.dataSource.transaction(async (manager) => {
      const tool = await this.lockTool(manager, id);
      this.assertVersion(tool, dto.version);

      // 同じ状態への再送は更新日時・versionを不要に進めず、現在値をそのまま返す。
      if (tool.status === dto.status) {
        const currentCategory = await this.findCategory(
          manager,
          tool.categoryId,
        );
        return toToolResponse(
          Object.assign(tool, { category: currentCategory }),
        );
      }

      // 再有効化ではカテゴリ行も保存完了まで固定し、確認直後のカテゴリ停止を防ぐ。
      const currentCategory =
        dto.status === RecordStatus.ACTIVE
          ? await this.lockActiveCategory(manager, tool.categoryId)
          : await this.findCategory(manager, tool.categoryId);

      tool.status = dto.status;
      const saved = await manager.getRepository(Tool).save(tool);
      return toToolResponse(
        Object.assign(saved, { category: currentCategory }),
      );
    });
  }

  private async lockTool(manager: EntityManager, id: string): Promise<Tool> {
    const tool = await manager
      .getRepository(Tool)
      .createQueryBuilder('tool')
      .setLock('pessimistic_write')
      .where('tool.id = :id', { id })
      .getOne();
    if (!tool) throw new NotFoundException('道具が見つかりません。');
    return tool;
  }

  private async lockActiveCategory(
    manager: EntityManager,
    id: string,
  ): Promise<Category> {
    const category = await manager
      .getRepository(Category)
      .createQueryBuilder('category')
      .setLock('pessimistic_write')
      .where('category.id = :id', { id })
      .getOne();
    if (!category)
      throw new NotFoundException('作業カテゴリが見つかりません。');
    this.assertCategoryActive(category);
    return category;
  }

  private async findCategory(
    manager: EntityManager,
    id: string,
  ): Promise<Category> {
    const category = await manager.getRepository(Category).findOne({
      where: { id },
    });
    if (!category)
      throw new NotFoundException('作業カテゴリが見つかりません。');
    return category;
  }

  private assertCategoryActive(category: Category): void {
    if (category.status === RecordStatus.INACTIVE) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'CATEGORY_INACTIVE',
        message: '利用停止中の作業カテゴリは指定できません。',
      });
    }
  }

  private assertVersion(tool: Tool, version: number): void {
    if (tool.version !== version) {
      this.throwConflict(
        'TOOL_UPDATE_CONFLICT',
        '他の管理者が先に更新しました。最新の状態を確認してください。',
      );
    }
  }

  private rethrowDuplicateName(error: unknown): never {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === 'ER_DUP_ENTRY'
    ) {
      this.throwConflict(
        'TOOL_NAME_DUPLICATED',
        '同じ名前の道具が既に存在します。',
      );
    }
    throw error;
  }

  private throwConflict(code: string, message: string): never {
    throw new ConflictException({ statusCode: 409, code, message });
  }
}
