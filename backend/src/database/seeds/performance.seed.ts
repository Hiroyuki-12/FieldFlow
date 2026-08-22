import { In, Like, type DataSource, type EntityManager } from 'typeorm';

import { hashPassword } from '../../common/security/password-hashing';
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
  RefreshSession,
  ScheduleMode,
  Tool,
  User,
  UserRole,
} from '../entities';
import type { PerformanceSeedConfig } from './performance-seed.config';

export const PERFORMANCE_FIXTURE = {
  worker: {
    id: '81000000-0000-4000-8000-000000000001',
    name: 'PERF 作業者',
    loginId: 'perf.worker',
  },
  categoryCount: 10,
  toolCount: 200,
  commonToolCount: 20,
  checklistCount: 20,
} as const;

function fixtureUuid(prefix: string, index: number): string {
  return `${prefix}-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

/** 東京の業務日をCIのUTC環境でも同じYYYY-MM-DDへ揃える。 */
function todayInTokyo(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 前回の性能試験が残したPERFデータだけを、外部キーの子から順に削除する。 */
async function removePreviousPerformanceData(
  manager: EntityManager,
): Promise<void> {
  const users = await manager.getRepository(User).find({
    where: { loginId: Like('perf.%') },
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length > 0) {
    const checklists = await manager.getRepository(DailyChecklist).find({
      where: { createdByUserId: In(userIds) },
    });
    const checklistIds = checklists.map((checklist) => checklist.id);
    if (checklistIds.length > 0) {
      const periods = await manager.getRepository(DailyChecklistPeriod).find({
        where: { checklistId: In(checklistIds) },
      });
      const periodIds = periods.map((period) => period.id);
      if (periodIds.length > 0) {
        await manager.getRepository(DailyChecklistItem).delete({
          periodId: In(periodIds),
        });
        await manager.getRepository(DailyChecklistPeriodCategory).delete({
          periodId: In(periodIds),
        });
        await manager.getRepository(DailyChecklistPeriod).delete({
          id: In(periodIds),
        });
      }
      await manager.getRepository(DailyChecklist).delete({
        id: In(checklistIds),
      });
    }

    const refreshSessionRepository = manager.getRepository(RefreshSession);
    // Refresh Sessionの自己参照を先に外し、ログイン後のSeed再実行でもFK違反を防ぐ。
    await refreshSessionRepository.update(
      { userId: In(userIds) },
      { replacedBySessionId: null },
    );
    await refreshSessionRepository.delete({ userId: In(userIds) });
  }

  await manager.getRepository(Tool).delete({ name: Like('PERF %') });
  await manager.getRepository(Category).delete({ name: Like('PERF %') });
  if (userIds.length > 0) {
    await manager.getRepository(User).delete({ id: In(userIds) });
  }
}

async function seedWorker(
  manager: EntityManager,
  config: PerformanceSeedConfig,
): Promise<void> {
  const repository = manager.getRepository(User);
  // 平文はFixture生成時だけ使い、DBへは本番と同じArgon2idハッシュだけを保存する。
  const passwordHash = await hashPassword(config.workerPassword);
  await repository.save(
    repository.create({
      ...PERFORMANCE_FIXTURE.worker,
      passwordHash,
      role: UserRole.WORKER,
      status: RecordStatus.ACTIVE,
      mustChangePassword: false,
      authVersion: 1,
      failedLoginCount: 0,
      lockedUntil: null,
      version: 1,
    }),
  );
}

interface PerformanceMasterData {
  commonCategory: Category;
  workCategories: Category[];
  commonTools: Tool[];
  workToolsByCategory: Map<string, Tool[]>;
}

/** 一覧検索と日別表取得が小さすぎるFixtureだけを測らないよう、200道具を作る。 */
async function seedMasterData(
  manager: EntityManager,
): Promise<PerformanceMasterData> {
  const categoryRepository = manager.getRepository(Category);
  const commonCategory = categoryRepository.create({
    id: fixtureUuid('82000000', 1),
    name: 'PERF 共通',
    displayOrder: 0,
    categoryType: CategoryType.COMMON,
    status: RecordStatus.ACTIVE,
  });
  const workCategories = Array.from(
    { length: PERFORMANCE_FIXTURE.categoryCount },
    (_, index) =>
      categoryRepository.create({
        id: fixtureUuid('82000000', index + 2),
        name: `PERF 作業 ${String(index + 1).padStart(2, '0')}`,
        displayOrder: (index + 1) * 10,
        categoryType: CategoryType.WORK,
        status: RecordStatus.ACTIVE,
      }),
  );
  await categoryRepository.save([commonCategory, ...workCategories]);

  const toolRepository = manager.getRepository(Tool);
  const tools = Array.from(
    { length: PERFORMANCE_FIXTURE.toolCount },
    (_, index) => {
      const category =
        index < PERFORMANCE_FIXTURE.commonToolCount
          ? commonCategory
          : workCategories[
              (index - PERFORMANCE_FIXTURE.commonToolCount) %
                workCategories.length
            ];
      return toolRepository.create({
        id: fixtureUuid('83000000', index + 1),
        categoryId: category.id,
        name: `PERF 道具 ${String(index + 1).padStart(3, '0')}`,
        stockQuantity: 10,
        displayOrder: index + 1,
        status: RecordStatus.ACTIVE,
      });
    },
  );
  await toolRepository.save(tools, { chunk: 100 });

  return {
    commonCategory,
    workCategories,
    commonTools: tools.filter(
      (tool) => tool.categoryId === commonCategory.id,
    ),
    workToolsByCategory: new Map(
      workCategories.map((category) => [
        category.id,
        tools.filter((tool) => tool.categoryId === category.id),
      ]),
    ),
  };
}

/** 20 VUが別々の行を更新できるよう、今日から20日分の独立した日別表を作る。 */
async function seedChecklists(
  manager: EntityManager,
  master: PerformanceMasterData,
): Promise<void> {
  const checklistRepository = manager.getRepository(DailyChecklist);
  const periodRepository = manager.getRepository(DailyChecklistPeriod);
  const periodCategoryRepository = manager.getRepository(
    DailyChecklistPeriodCategory,
  );
  const itemRepository = manager.getRepository(DailyChecklistItem);
  const today = todayInTokyo();
  let itemSequence = 1;

  for (let index = 0; index < PERFORMANCE_FIXTURE.checklistCount; index += 1) {
    const checklistId = fixtureUuid('84000000', index + 1);
    const periodId = fixtureUuid('85000000', index + 1);
    const workDate = addDays(today, index);
    const workCategory =
      master.workCategories[index % master.workCategories.length];
    const workTools = master.workToolsByCategory.get(workCategory.id) ?? [];

    await checklistRepository.save({
      id: checklistId,
      workDate,
      activeWorkDate: workDate,
      scheduleMode: ScheduleMode.FULL_DAY,
      status: DailyChecklistStatus.ACTIVE,
      createdByUserId: PERFORMANCE_FIXTURE.worker.id,
      cancelledByUserId: null,
      cancelledAt: null,
      version: 1,
    });
    await periodRepository.save({
      id: periodId,
      checklistId,
      period: ChecklistPeriodType.FULL_DAY,
    });
    await periodCategoryRepository.save({
      id: fixtureUuid('86000000', index + 1),
      periodId,
      sourceCategoryId: workCategory.id,
      categoryNameSnapshot: workCategory.name,
      displayOrderSnapshot: workCategory.displayOrder,
    });

    const items = [...master.commonTools, ...workTools].map((tool) => {
      const category =
        tool.categoryId === master.commonCategory.id
          ? master.commonCategory
          : workCategory;
      const item = itemRepository.create({
        id: fixtureUuid('87000000', itemSequence),
        periodId,
        sourceToolId: tool.id,
        toolNameSnapshot: tool.name,
        categoryNameSnapshot: category.name,
        stockQuantitySnapshot: tool.stockQuantity,
        takeoutQuantity: 1,
        checked: false,
        displayOrderSnapshot: tool.displayOrder,
        version: 1,
      });
      itemSequence += 1;
      return item;
    });
    await itemRepository.save(items, { chunk: 100 });
  }
}

/** 性能DBを同じデータ量へ戻し、ローカルと手動CIの比較条件を揃える。 */
export async function runPerformanceSeed(
  dataSource: DataSource,
  config: PerformanceSeedConfig,
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await removePreviousPerformanceData(manager);
    await seedWorker(manager, config);
    const master = await seedMasterData(manager);
    await seedChecklists(manager, master);
  });
}
