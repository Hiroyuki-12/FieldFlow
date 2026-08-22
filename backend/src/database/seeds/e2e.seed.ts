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
import type { E2ESeedConfig } from './e2e-seed.config';

export const E2E_FIXTURE = {
  users: {
    admin: {
      id: '10000000-0000-4000-8000-000000000001',
      name: 'E2E 管理者',
      loginId: 'e2e.admin',
    },
    worker: {
      id: '10000000-0000-4000-8000-000000000002',
      name: 'E2E 作業者',
      loginId: 'e2e.worker',
    },
    firstLogin: {
      id: '10000000-0000-4000-8000-000000000003',
      name: 'E2E 初回変更者',
      loginId: 'e2e.first',
    },
  },
  categories: {
    common: {
      id: '20000000-0000-4000-8000-000000000001',
      name: '共通',
    },
    electrical: {
      id: '20000000-0000-4000-8000-000000000002',
      name: 'E2E 電気工事',
    },
    plumbing: {
      id: '20000000-0000-4000-8000-000000000003',
      name: 'E2E 配管工事',
    },
    addition: {
      id: '20000000-0000-4000-8000-000000000004',
      name: 'E2E 追加作業',
    },
  },
  tools: {
    helmet: {
      id: '30000000-0000-4000-8000-000000000001',
      name: 'E2E ヘルメット',
    },
    tester: {
      id: '30000000-0000-4000-8000-000000000002',
      name: 'E2E テスター',
    },
    wrench: {
      id: '30000000-0000-4000-8000-000000000003',
      name: 'E2E パイプレンチ',
    },
    addition: {
      id: '30000000-0000-4000-8000-000000000004',
      name: 'E2E 追加工具',
    },
  },
} as const;

/** 東京の業務日をUTCの実行環境でも同じYYYY-MM-DDへ揃える。 */
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

/** 前回のE2E実行が残した識別可能なデータだけを外部キーの子から順に削除する。 */
async function removePreviousE2EData(manager: EntityManager): Promise<void> {
  const users = await manager.getRepository(User).find({
    where: { loginId: Like('e2e.%') },
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
    // Refreshローテーションの自己参照を先に外し、親Sessionを参照中のまま削除してFK違反になるのを防ぐ。
    await refreshSessionRepository.update(
      { userId: In(userIds) },
      { replacedBySessionId: null },
    );
    await refreshSessionRepository.delete({ userId: In(userIds) });
  }

  // 管理シナリオが画面から作ったUUID不定のデータも、E2E接頭辞だけを対象に再実行前へ戻す。
  await manager.getRepository(Tool).delete({ name: Like('E2E %') });
  await manager.getRepository(Category).delete({ name: Like('E2E %') });
  if (userIds.length > 0) {
    await manager.getRepository(User).delete({ id: In(userIds) });
  }
}

async function seedUsers(
  manager: EntityManager,
  config: E2ESeedConfig,
): Promise<void> {
  const repository = manager.getRepository(User);
  const [adminHash, workerHash, firstLoginHash] = await Promise.all([
    hashPassword(config.adminPassword),
    hashPassword(config.workerPassword),
    hashPassword(config.firstLoginPassword),
  ]);
  await repository.save([
    repository.create({
      ...E2E_FIXTURE.users.admin,
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      status: RecordStatus.ACTIVE,
      mustChangePassword: false,
      authVersion: 1,
      failedLoginCount: 0,
      lockedUntil: null,
      version: 1,
    }),
    repository.create({
      ...E2E_FIXTURE.users.worker,
      passwordHash: workerHash,
      role: UserRole.WORKER,
      status: RecordStatus.ACTIVE,
      mustChangePassword: false,
      authVersion: 1,
      failedLoginCount: 0,
      lockedUntil: null,
      version: 1,
    }),
    repository.create({
      ...E2E_FIXTURE.users.firstLogin,
      passwordHash: firstLoginHash,
      role: UserRole.WORKER,
      status: RecordStatus.ACTIVE,
      mustChangePassword: true,
      authVersion: 1,
      failedLoginCount: 0,
      lockedUntil: null,
      version: 1,
    }),
  ]);
}

async function seedMasterData(manager: EntityManager): Promise<void> {
  const categoryRepository = manager.getRepository(Category);
  const existingCommonCategories = await categoryRepository.find({
    where: { categoryType: CategoryType.COMMON },
  });
  if (existingCommonCategories.length > 1) {
    throw new Error('E2E database has multiple COMMON categories');
  }
  const common =
    existingCommonCategories[0] ??
    categoryRepository.create({ id: E2E_FIXTURE.categories.common.id });
  Object.assign(common, {
    name: E2E_FIXTURE.categories.common.name,
    displayOrder: 0,
    categoryType: CategoryType.COMMON,
    status: RecordStatus.ACTIVE,
  });

  await categoryRepository.save([
    common,
    categoryRepository.create({
      ...E2E_FIXTURE.categories.electrical,
      displayOrder: 10,
      categoryType: CategoryType.WORK,
      status: RecordStatus.ACTIVE,
    }),
    categoryRepository.create({
      ...E2E_FIXTURE.categories.plumbing,
      displayOrder: 20,
      categoryType: CategoryType.WORK,
      status: RecordStatus.ACTIVE,
    }),
    categoryRepository.create({
      ...E2E_FIXTURE.categories.addition,
      displayOrder: 30,
      categoryType: CategoryType.WORK,
      status: RecordStatus.ACTIVE,
    }),
  ]);

  const toolRepository = manager.getRepository(Tool);
  await toolRepository.save([
    toolRepository.create({
      ...E2E_FIXTURE.tools.helmet,
      categoryId: common.id,
      stockQuantity: 8,
      displayOrder: 10,
      status: RecordStatus.ACTIVE,
    }),
    toolRepository.create({
      ...E2E_FIXTURE.tools.tester,
      categoryId: E2E_FIXTURE.categories.electrical.id,
      stockQuantity: 5,
      displayOrder: 10,
      status: RecordStatus.ACTIVE,
    }),
    toolRepository.create({
      ...E2E_FIXTURE.tools.wrench,
      categoryId: E2E_FIXTURE.categories.plumbing.id,
      stockQuantity: 4,
      displayOrder: 10,
      status: RecordStatus.ACTIVE,
    }),
    toolRepository.create({
      ...E2E_FIXTURE.tools.addition,
      categoryId: E2E_FIXTURE.categories.addition.id,
      stockQuantity: 3,
      displayOrder: 10,
      status: RecordStatus.ACTIVE,
    }),
  ]);
}

/** 過去日閲覧をUIから確認できる最小のFULL_DAYスナップショットを作る。 */
async function seedPastChecklist(manager: EntityManager): Promise<void> {
  const checklistId = '40000000-0000-4000-8000-000000000001';
  const periodId = '50000000-0000-4000-8000-000000000001';
  const workDate = addDays(todayInTokyo(), -1);
  await manager.getRepository(DailyChecklist).save({
    id: checklistId,
    workDate,
    activeWorkDate: workDate,
    scheduleMode: ScheduleMode.FULL_DAY,
    status: DailyChecklistStatus.ACTIVE,
    createdByUserId: E2E_FIXTURE.users.worker.id,
    cancelledByUserId: null,
    cancelledAt: null,
    version: 1,
  });
  await manager.getRepository(DailyChecklistPeriod).save({
    id: periodId,
    checklistId,
    period: ChecklistPeriodType.FULL_DAY,
  });
  await manager.getRepository(DailyChecklistPeriodCategory).save({
    id: '60000000-0000-4000-8000-000000000001',
    periodId,
    sourceCategoryId: E2E_FIXTURE.categories.electrical.id,
    categoryNameSnapshot: E2E_FIXTURE.categories.electrical.name,
    displayOrderSnapshot: 10,
  });
  await manager.getRepository(DailyChecklistItem).save([
    {
      id: '70000000-0000-4000-8000-000000000001',
      periodId,
      sourceToolId: E2E_FIXTURE.tools.tester.id,
      toolNameSnapshot: E2E_FIXTURE.tools.tester.name,
      categoryNameSnapshot: E2E_FIXTURE.categories.electrical.name,
      stockQuantitySnapshot: 5,
      takeoutQuantity: 2,
      checked: true,
      displayOrderSnapshot: 10,
      version: 1,
    },
    {
      id: '70000000-0000-4000-8000-000000000002',
      periodId,
      sourceToolId: E2E_FIXTURE.tools.helmet.id,
      toolNameSnapshot: E2E_FIXTURE.tools.helmet.name,
      categoryNameSnapshot: E2E_FIXTURE.categories.common.name,
      stockQuantitySnapshot: 8,
      takeoutQuantity: 1,
      checked: false,
      displayOrderSnapshot: 10,
      version: 1,
    },
  ]);
}

/** E2E専用DBを毎回同じ開始状態へ戻し、各specが実行順へ依存しないFixtureを作る。 */
export async function runE2ESeed(
  dataSource: DataSource,
  config: E2ESeedConfig,
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await removePreviousE2EData(manager);
    await seedUsers(manager, config);
    await seedMasterData(manager);
    await seedPastChecklist(manager);
  });
}
