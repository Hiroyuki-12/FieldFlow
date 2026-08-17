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

import {
  Category,
  CategoryType,
  ChecklistPeriodType,
  DailyChecklist,
  DailyChecklistItem,
  DailyChecklistPeriod,
  DailyChecklistPeriodCategory,
  RecordStatus,
  ScheduleMode,
  Tool,
} from '../database/entities';
import {
  DailyChecklistGraph,
  DailyChecklistResponse,
  toDailyChecklistResponse,
} from './daily-checklist.types';
import {
  CreateDailyChecklistDto,
  CreateDailyChecklistPeriodDto,
} from './dto/create-daily-checklist.dto';

/** 日別表の取得、方式検証、スナップショット作成、冪等性を担当する業務Service。 */
@Injectable()
export class DailyChecklistsService {
  constructor(
    @InjectRepository(DailyChecklist)
    private readonly checklistRepository: Repository<DailyChecklist>,
    private readonly dataSource: DataSource,
  ) {}

  async findByDate(workDate: string): Promise<DailyChecklistResponse> {
    const checklist = await this.loadByDate(
      this.checklistRepository.manager,
      workDate,
    );
    if (!checklist) this.throwChecklistNotFound();
    return this.toResponse(checklist);
  }

  async createOrGet(
    workDate: string,
    dto: CreateDailyChecklistDto,
    createdByUserId: string,
  ): Promise<DailyChecklistResponse> {
    this.assertPeriodStructure(dto);
    if (workDate < this.todayInTokyo()) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'CHECKLIST_PAST_DATE',
        message: '過去日の日別チェックは作成できません。',
      });
    }

    try {
      const checklist = await this.dataSource.transaction(async (manager) => {
        // 作成済み表は方式を変更しないため読取だけでよい。未作成行へのgap lockを避け、
        // 同時INSERTはwork_date一意制約へ収束させる。
        const existingHeader = await manager
          .getRepository(DailyChecklist)
          .findOne({ where: { workDate } });
        if (existingHeader) {
          this.assertSameScheduleMode(existingHeader, dto.scheduleMode);
          return this.loadRequiredByDate(manager, workDate);
        }

        return this.createSnapshot(manager, workDate, dto, createdByUserId);
      });
      return this.toResponse(checklist);
    } catch (error) {
      // 同時作成で一意制約に負けた側は、先に完成した表を読み直して冪等に収束させる。
      if (this.isDuplicateEntry(error)) {
        const existing = await this.loadByDate(
          this.checklistRepository.manager,
          workDate,
        );
        if (existing) {
          this.assertSameScheduleMode(existing, dto.scheduleMode);
          return this.toResponse(existing);
        }
      }
      throw error;
    }
  }

  private async createSnapshot(
    manager: EntityManager,
    workDate: string,
    dto: CreateDailyChecklistDto,
    createdByUserId: string,
  ): Promise<DailyChecklistGraph> {
    const requestedCategoryIds = [
      ...new Set(dto.periods.flatMap((period) => period.categoryIds)),
    ];
    const categories = await this.lockCategories(manager, requestedCategoryIds);
    const categoryById = new Map(
      categories.map((category) => [category.id, category]),
    );
    this.assertRequestedCategories(requestedCategoryIds, categoryById);
    const commonCategories = categories.filter(
      (category) => category.categoryType === CategoryType.COMMON,
    );
    if (
      commonCategories.length !== 1 ||
      commonCategories[0].status !== RecordStatus.ACTIVE
    ) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'COMMON_CATEGORY_UNAVAILABLE',
        message: '有効な共通カテゴリを1件設定してください。',
      });
    }

    // 道具行も読取ロックし、スナップショット保存前の編集・利用停止を待たせる。
    const tools = await this.lockActiveTools(manager, [
      ...requestedCategoryIds,
      commonCategories[0].id,
    ]);
    const toolsByCategory = this.groupToolsByCategory(tools);

    const checklist = manager.getRepository(DailyChecklist).create({
      id: randomUUID(),
      workDate,
      scheduleMode: dto.scheduleMode,
      createdByUserId,
    });
    await manager.getRepository(DailyChecklist).save(checklist);

    // SPLITも同じTransaction内で全時間帯を作り、片方だけ残る状態を防止する。
    for (const requestedPeriod of dto.periods) {
      await this.createPeriodSnapshot(
        manager,
        checklist.id,
        requestedPeriod,
        categoryById,
        commonCategories[0],
        toolsByCategory,
      );
    }
    return this.loadRequiredByDate(manager, workDate);
  }

  private async createPeriodSnapshot(
    manager: EntityManager,
    checklistId: string,
    requestedPeriod: CreateDailyChecklistPeriodDto,
    categoryById: Map<string, Category>,
    commonCategory: Category,
    toolsByCategory: Map<string, Tool[]>,
  ): Promise<void> {
    const period = manager.getRepository(DailyChecklistPeriod).create({
      id: randomUUID(),
      checklistId,
      period: requestedPeriod.period,
    });
    await manager.getRepository(DailyChecklistPeriod).save(period);

    const periodCategories = requestedPeriod.categoryIds.map((categoryId) => {
      const category = categoryById.get(categoryId);
      if (!category) {
        // 事前検証済みのため通常は到達しない。誤った空値を履歴へ保存しない最終防壁。
        throw new Error(`Validated category is missing: ${categoryId}`);
      }
      return manager.getRepository(DailyChecklistPeriodCategory).create({
        id: randomUUID(),
        periodId: period.id,
        sourceCategoryId: category.id,
        categoryNameSnapshot: category.name,
        displayOrderSnapshot: category.displayOrder,
      });
    });
    await manager
      .getRepository(DailyChecklistPeriodCategory)
      .save(periodCategories);

    const snapshotCategories = [
      ...requestedPeriod.categoryIds.map((id) => categoryById.get(id)),
      commonCategory,
    ].filter((category): category is Category => Boolean(category));
    const items = snapshotCategories.flatMap((category) =>
      (toolsByCategory.get(category.id) ?? []).map((tool) =>
        manager.getRepository(DailyChecklistItem).create({
          id: randomUUID(),
          periodId: period.id,
          sourceToolId: tool.id,
          toolNameSnapshot: tool.name,
          categoryNameSnapshot: category.name,
          stockQuantitySnapshot: tool.stockQuantity,
          takeoutQuantity: 0,
          checked: false,
          displayOrderSnapshot: tool.displayOrder,
        }),
      ),
    );
    if (items.length > 0) {
      await manager.getRepository(DailyChecklistItem).save(items);
    }
  }

  private async lockCategories(
    manager: EntityManager,
    requestedCategoryIds: string[],
  ): Promise<Category[]> {
    // ID順で固定して複数リクエストのロック順を揃え、デッドロックを起こしにくくする。
    return manager
      .getRepository(Category)
      .createQueryBuilder('category')
      .setLock('pessimistic_read')
      .where('category.id IN (:...requestedCategoryIds)', {
        requestedCategoryIds,
      })
      .orWhere('category.categoryType = :commonType', {
        commonType: CategoryType.COMMON,
      })
      .orderBy('category.id', 'ASC')
      .getMany();
  }

  private async lockActiveTools(
    manager: EntityManager,
    categoryIds: string[],
  ): Promise<Tool[]> {
    return manager
      .getRepository(Tool)
      .createQueryBuilder('tool')
      .setLock('pessimistic_read')
      .where('tool.categoryId IN (:...categoryIds)', { categoryIds })
      .andWhere('tool.status = :status', { status: RecordStatus.ACTIVE })
      .orderBy('tool.id', 'ASC')
      .getMany();
  }

  private assertPeriodStructure(dto: CreateDailyChecklistDto): void {
    const actualPeriods = dto.periods.map((period) => period.period);
    const expectedPeriods =
      dto.scheduleMode === ScheduleMode.FULL_DAY
        ? [ChecklistPeriodType.FULL_DAY]
        : [ChecklistPeriodType.MORNING, ChecklistPeriodType.AFTERNOON];
    if (
      actualPeriods.length !== expectedPeriods.length ||
      new Set(actualPeriods).size !== actualPeriods.length ||
      expectedPeriods.some((period) => !actualPeriods.includes(period))
    ) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'CHECKLIST_PERIODS_INVALID',
        message: '作成方式と時間帯の組み合わせが正しくありません。',
      });
    }
  }

  private assertRequestedCategories(
    categoryIds: string[],
    categoryById: Map<string, Category>,
  ): void {
    for (const categoryId of categoryIds) {
      const category = categoryById.get(categoryId);
      if (!category) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'CATEGORY_NOT_FOUND',
          message: '作業カテゴリが見つかりません。',
        });
      }
      if (category.categoryType !== CategoryType.WORK) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          code: 'CHECKLIST_CATEGORY_TYPE_INVALID',
          message: '共通カテゴリは明示的に選択できません。',
        });
      }
      if (category.status !== RecordStatus.ACTIVE) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          code: 'CATEGORY_INACTIVE',
          message: '利用停止中の作業カテゴリは指定できません。',
        });
      }
    }
  }

  private assertSameScheduleMode(
    checklist: Pick<DailyChecklist, 'scheduleMode'>,
    requestedMode: ScheduleMode,
  ): void {
    if (checklist.scheduleMode !== requestedMode) {
      throw new ConflictException({
        statusCode: 409,
        code: 'CHECKLIST_ALREADY_CONFIGURED',
        message: 'この日の日別チェックは別の方式で作成済みです。',
      });
    }
  }

  private async loadRequiredByDate(
    manager: EntityManager,
    workDate: string,
  ): Promise<DailyChecklistGraph> {
    const checklist = await this.loadByDate(manager, workDate);
    if (!checklist) {
      throw new Error('Saved daily checklist could not be reloaded');
    }
    return checklist;
  }

  private async loadByDate(
    manager: EntityManager,
    workDate: string,
  ): Promise<DailyChecklistGraph | null> {
    const checklist = await manager.getRepository(DailyChecklist).findOne({
      where: { workDate },
      relations: {
        periods: {
          categories: true,
          items: true,
        },
      },
    });
    return checklist;
  }

  private groupToolsByCategory(tools: Tool[]): Map<string, Tool[]> {
    const grouped = new Map<string, Tool[]>();
    for (const tool of tools) {
      const current = grouped.get(tool.categoryId) ?? [];
      current.push(tool);
      grouped.set(tool.categoryId, current);
    }
    return grouped;
  }

  private toResponse(checklist: DailyChecklistGraph): DailyChecklistResponse {
    return toDailyChecklistResponse(checklist, this.todayInTokyo());
  }

  private todayInTokyo(now = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  }

  private isDuplicateEntry(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === 'ER_DUP_ENTRY'
    );
  }

  private throwChecklistNotFound(): never {
    throw new NotFoundException({
      statusCode: 404,
      code: 'CHECKLIST_NOT_FOUND',
      message: '指定した日の日別チェックが見つかりません。',
    });
  }
}
