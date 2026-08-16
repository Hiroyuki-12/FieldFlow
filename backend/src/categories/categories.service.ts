import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';

import {
  Category,
  CategoryType,
  RecordStatus,
  Tool,
} from '../database/entities';
import {
  CategoryListResponse,
  CategoryResponse,
  toCategoryResponse,
} from './category.types';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { UpdateCategoryStatusDto } from './dto/update-category-status.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/** 作業カテゴリの検索、更新競合、COMMON保護、使用中判定を担当する業務Service。 */
@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: ListCategoriesQueryDto): Promise<CategoryListResponse> {
    const builder = this.categoryRepository.createQueryBuilder('category');
    if (query.search) {
      builder.andWhere('category.name LIKE :search', {
        search: `%${query.search}%`,
      });
    }
    if (query.status) {
      builder.andWhere('category.status = :status', { status: query.status });
    }

    const categories = await builder
      .orderBy('category.displayOrder', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .addOrderBy('category.id', 'ASC')
      .getMany();
    return { items: categories.map(toCategoryResponse) };
  }

  async create(dto: CreateCategoryDto): Promise<CategoryResponse> {
    // COMMONはSeedだけが作成できるよう、クライアント入力ではなくBackendでWORKへ固定する。
    const category = this.categoryRepository.create({
      id: randomUUID(),
      name: dto.name,
      displayOrder: dto.displayOrder,
      categoryType: CategoryType.WORK,
      status: RecordStatus.ACTIVE,
    });
    try {
      return toCategoryResponse(await this.categoryRepository.save(category));
    } catch (error) {
      this.rethrowDuplicateName(error);
    }
  }

  async findOne(id: string): Promise<CategoryResponse> {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) throw new NotFoundException('作業カテゴリが見つかりません。');
    return toCategoryResponse(category);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryResponse> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const category = await this.lockCategory(manager, id);
        this.assertVersion(category, dto.version);
        if (
          category.categoryType === CategoryType.COMMON &&
          category.name !== dto.name
        ) {
          this.throwConflict(
            'COMMON_CATEGORY_PROTECTED',
            '共通カテゴリの名前は変更できません。',
          );
        }

        category.name = dto.name;
        category.displayOrder = dto.displayOrder;
        return toCategoryResponse(
          await manager.getRepository(Category).save(category),
        );
      });
    } catch (error) {
      this.rethrowDuplicateName(error);
    }
  }

  async updateStatus(
    id: string,
    dto: UpdateCategoryStatusDto,
  ): Promise<CategoryResponse> {
    return this.dataSource.transaction(async (manager) => {
      const category = await this.lockCategory(manager, id);
      this.assertVersion(category, dto.version);

      // 同じ状態への再送は更新日時・versionを不要に進めず、現在値をそのまま返す。
      if (category.status === dto.status) return toCategoryResponse(category);
      if (
        category.categoryType === CategoryType.COMMON &&
        dto.status === RecordStatus.INACTIVE
      ) {
        this.throwConflict(
          'COMMON_CATEGORY_PROTECTED',
          '共通カテゴリは利用停止にできません。',
        );
      }
      if (dto.status === RecordStatus.INACTIVE) {
        // 無効な道具は新しい日別表の対象外なので、有効な道具だけを使用中と判断する。
        const activeToolCount = await manager.getRepository(Tool).count({
          where: { categoryId: category.id, status: RecordStatus.ACTIVE },
        });
        if (activeToolCount > 0) {
          this.throwConflict(
            'CATEGORY_IN_USE',
            '利用中の道具がある作業カテゴリは利用停止にできません。',
          );
        }
      }

      category.status = dto.status;
      return toCategoryResponse(
        await manager.getRepository(Category).save(category),
      );
    });
  }

  private async lockCategory(
    manager: EntityManager,
    id: string,
  ): Promise<Category> {
    // 判定から保存まで対象行を固定し、同じカテゴリへの管理操作を直列化する。
    const category = await manager
      .getRepository(Category)
      .createQueryBuilder('category')
      .setLock('pessimistic_write')
      .where('category.id = :id', { id })
      .getOne();
    if (!category) throw new NotFoundException('作業カテゴリが見つかりません。');
    return category;
  }

  private assertVersion(category: Category, version: number): void {
    if (category.version !== version) {
      this.throwConflict(
        'CATEGORY_UPDATE_CONFLICT',
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
        'CATEGORY_NAME_DUPLICATED',
        '同じ名前の作業カテゴリが既に存在します。',
      );
    }
    throw error;
  }

  private throwConflict(code: string, message: string): never {
    throw new ConflictException({ statusCode: 409, code, message });
  }
}
