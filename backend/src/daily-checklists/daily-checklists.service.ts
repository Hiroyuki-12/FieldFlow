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
  DailyChecklistStatus,
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
import { CancelDailyChecklistDto } from './dto/cancel-daily-checklist.dto';
import { UpdateDailyChecklistConfigurationDto } from './dto/update-daily-checklist-configuration.dto';

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
          .findOne({
            where: { workDate, status: DailyChecklistStatus.ACTIVE },
          });
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

  /**
   * 現行版を履歴化して新しい版を作る。既存行を上書きしないため、変更前の設定と入力値を追跡できる。
   */
  async updateConfiguration(
    workDate: string,
    dto: UpdateDailyChecklistConfigurationDto,
    changedByUserId: string,
  ): Promise<DailyChecklistResponse> {
    this.assertPeriodStructure(dto);
    this.assertEditableDate(workDate);

    const checklist = await this.dataSource.transaction(async (manager) => {
      const currentHeader = await this.lockActiveHeader(manager, workDate);
      this.assertCurrentRevision(currentHeader, dto.checklistId, dto.version);
      const current = await this.loadRequiredById(manager, currentHeader.id);
      this.assertDataLossConfirmed(
        current,
        dto.confirmDataLoss,
        'CHECKLIST_RECONFIGURATION_DATA_LOSS',
      );

      // 新版で同じ時間帯・同じ道具が残る場合だけ、入力済みの数量と準備状態を引き継ぐ。
      const preservedItems = new Map(
        current.periods.flatMap((period) =>
          period.items.map(
            (item) =>
              [this.itemPreservationKey(period.period, item.sourceToolId), item] as const,
          ),
        ),
      );
      await this.cancelHeader(manager, currentHeader, changedByUserId);
      return this.createSnapshot(
        manager,
        workDate,
        dto,
        changedByUserId,
        preservedItems,
      );
    });
    return this.toResponse(checklist);
  }

  /** 利用者には削除と見せるが、現行版をCANCELLEDへ変えて入力内容を履歴として保持する。 */
  async cancel(
    workDate: string,
    dto: CancelDailyChecklistDto,
    cancelledByUserId: string,
  ): Promise<void> {
    this.assertEditableDate(workDate);
    await this.dataSource.transaction(async (manager) => {
      const currentHeader = await this.lockActiveHeader(manager, workDate);
      this.assertCurrentRevision(currentHeader, dto.checklistId, dto.version);
      const current = await this.loadRequiredById(manager, currentHeader.id);
      this.assertDataLossConfirmed(
        current,
        dto.confirmDataLoss,
        'CHECKLIST_CANCELLATION_DATA_LOSS',
      );
      await this.cancelHeader(manager, currentHeader, cancelledByUserId);
    });
  }

  private async createSnapshot(
    manager: EntityManager,
    workDate: string,
    dto: CreateDailyChecklistDto,
    createdByUserId: string,
    preservedItems = new Map<string, DailyChecklistItem>(),
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
      activeWorkDate: workDate,
      scheduleMode: dto.scheduleMode,
      status: DailyChecklistStatus.ACTIVE,
      createdByUserId,
      cancelledByUserId: null,
      cancelledAt: null,
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
        preservedItems,
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
    preservedItems: Map<string, DailyChecklistItem>,
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
      (toolsByCategory.get(category.id) ?? []).map((tool) => {
        const preserved = preservedItems.get(
          this.itemPreservationKey(requestedPeriod.period, tool.id),
        );
        // 在庫上限が下がって旧数量を保存できない場合は、DB制約違反にせず未設定へ戻す。
        const canPreserveQuantity =
          preserved !== undefined &&
          preserved.takeoutQuantity <= tool.stockQuantity;
        return manager.getRepository(DailyChecklistItem).create({
          id: randomUUID(),
          periodId: period.id,
          sourceToolId: tool.id,
          toolNameSnapshot: tool.name,
          categoryNameSnapshot: category.name,
          stockQuantitySnapshot: tool.stockQuantity,
          takeoutQuantity: canPreserveQuantity
            ? preserved.takeoutQuantity
            : 0,
          checked: canPreserveQuantity ? preserved.checked : false,
          displayOrderSnapshot: tool.displayOrder,
        });
      }),
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

  private assertEditableDate(workDate: string): void {
    if (workDate < this.todayInTokyo()) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'CHECKLIST_PAST_DATE',
        message: '過去日の日別チェックは変更・削除できません。',
      });
    }
  }

  /** 現行ヘッダーを固定し、同じ表への設定変更・削除を直列化する。 */
  private async lockActiveHeader(
    manager: EntityManager,
    workDate: string,
  ): Promise<DailyChecklist> {
    const checklist = await manager
      .getRepository(DailyChecklist)
      .createQueryBuilder('checklist')
      .setLock('pessimistic_write')
      .where('checklist.workDate = :workDate', { workDate })
      .andWhere('checklist.status = :status', {
        status: DailyChecklistStatus.ACTIVE,
      })
      .getOne();
    if (!checklist) this.throwChecklistNotFound();
    return checklist;
  }

  private assertCurrentRevision(
    checklist: DailyChecklist,
    requestedId: string,
    requestedVersion: number,
  ): void {
    if (
      checklist.id !== requestedId ||
      checklist.version !== requestedVersion
    ) {
      throw new ConflictException({
        statusCode: 409,
        code: 'CHECKLIST_UPDATE_CONFLICT',
        message:
          '他の利用者が先に日別チェックを変更しました。最新の状態を確認してください。',
      });
    }
  }

  private assertDataLossConfirmed(
    checklist: DailyChecklistGraph,
    confirmed: boolean,
    code: string,
  ): void {
    const enteredItemCount = checklist.periods
      .flatMap((period) => period.items)
      .filter((item) => item.takeoutQuantity > 0 || item.checked).length;
    if (enteredItemCount > 0 && !confirmed) {
      throw new ConflictException({
        statusCode: 409,
        code,
        message: '入力済みの持ち出し数・準備状態があります。',
        details: { enteredItemCount },
      });
    }
  }

  private async cancelHeader(
    manager: EntityManager,
    checklist: DailyChecklist,
    cancelledByUserId: string,
  ): Promise<void> {
    checklist.status = DailyChecklistStatus.CANCELLED;
    // NULLは一意制約上複数保持できるため、同日の新しいACTIVE版を作成可能にする。
    checklist.activeWorkDate = null;
    checklist.cancelledByUserId = cancelledByUserId;
    checklist.cancelledAt = new Date();
    await manager.getRepository(DailyChecklist).save(checklist);
  }

  private itemPreservationKey(
    period: ChecklistPeriodType,
    sourceToolId: string,
  ): string {
    return `${period}:${sourceToolId}`;
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

  private async loadRequiredById(
    manager: EntityManager,
    id: string,
  ): Promise<DailyChecklistGraph> {
    const checklist = await manager.getRepository(DailyChecklist).findOne({
      where: { id },
      relations: {
        periods: {
          categories: true,
          items: true,
        },
      },
    });
    if (!checklist) this.throwChecklistNotFound();
    return checklist;
  }

  private async loadByDate(
    manager: EntityManager,
    workDate: string,
  ): Promise<DailyChecklistGraph | null> {
    const checklist = await manager.getRepository(DailyChecklist).findOne({
      where: { workDate, status: DailyChecklistStatus.ACTIVE },
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
