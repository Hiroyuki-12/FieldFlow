import { DataSource, EntityManager, Repository } from 'typeorm';

import {
  ChecklistPeriodType,
  DailyChecklist,
  DailyChecklistStatus,
  ScheduleMode,
} from '../database/entities';
import type { DailyChecklistGraph } from './daily-checklist.types';
import { DailyChecklistsService } from './daily-checklists.service';
import type { CreateDailyChecklistDto } from './dto/create-daily-checklist.dto';

describe('DailyChecklistsService', () => {
  const findOne = jest.fn();
  const manager = {
    getRepository: jest.fn(() => ({ findOne })),
  } as unknown as EntityManager;
  const repository = {
    manager,
  } as Repository<DailyChecklist>;

  beforeEach(() => jest.clearAllMocks());

  it('未作成日の取得を404相当で拒否し、暗黙作成しない', async () => {
    findOne.mockResolvedValue(null);
    const transaction = jest.fn();
    const service = new DailyChecklistsService(repository, {
      transaction,
    } as unknown as DataSource);

    await expect(service.findByDate('2026-08-17')).rejects.toMatchObject({
      response: { code: 'CHECKLIST_NOT_FOUND' },
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('取得レスポンスではスナップショットだけを公開し、過去日を編集不可にする', async () => {
    findOne.mockResolvedValue(checklistFixture());
    const service = new DailyChecklistsService(repository, {} as DataSource);

    const response = await service.findByDate('2000-01-01');

    expect(response).toMatchObject({
      workDate: '2000-01-01',
      editable: false,
      periods: [
        {
          period: ChecklistPeriodType.FULL_DAY,
          categories: [{ categoryName: '清掃' }],
          items: [{ toolName: 'モップ', stockQuantity: 2, version: 1 }],
        },
      ],
    });
    expect(response).not.toHaveProperty('createdByUserId');
  });

  it('作成方式と時間帯が一致しない入力をTransaction前に拒否する', async () => {
    const transaction = jest.fn();
    const service = new DailyChecklistsService(repository, {
      transaction,
    } as unknown as DataSource);

    await expect(
      service.createOrGet(
        '2999-01-01',
        {
          scheduleMode: ScheduleMode.SPLIT,
          periods: [
            {
              period: ChecklistPeriodType.MORNING,
              categoryIds: ['category-1'],
            },
          ],
        },
        'user-1',
      ),
    ).rejects.toMatchObject({
      response: { code: 'CHECKLIST_PERIODS_INVALID' },
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('過去日の作成をTransaction前に拒否する', async () => {
    const transaction = jest.fn();
    const service = new DailyChecklistsService(repository, {
      transaction,
    } as unknown as DataSource);

    await expect(
      service.createOrGet('2000-01-01', fullDayDto(), 'user-1'),
    ).rejects.toMatchObject({ response: { code: 'CHECKLIST_PAST_DATE' } });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('同じ方式の再送は保存せず現在の表を返す', async () => {
    const graph = checklistFixture({ workDate: '2999-01-01' });
    const getRepository = jest.fn(() => ({
      findOne: jest
        .fn()
        .mockResolvedValueOnce(graph)
        .mockResolvedValueOnce(graph),
    }));
    const transactionManager = { getRepository } as unknown as EntityManager;
    const transaction = jest.fn(
      async <T>(callback: (value: EntityManager) => Promise<T>): Promise<T> =>
        callback(transactionManager),
    );
    const service = new DailyChecklistsService(repository, {
      transaction,
    } as unknown as DataSource);

    const response = await service.createOrGet(
      '2999-01-01',
      fullDayDto(),
      'user-1',
    );

    expect(response.id).toBe('checklist-1');
    expect(getRepository).toHaveBeenCalledWith(DailyChecklist);
  });

  it('作成済み表と異なる方式の再送を409相当で拒否する', async () => {
    const graph = checklistFixture({
      workDate: '2999-01-01',
      scheduleMode: ScheduleMode.SPLIT,
    });
    const transactionManager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(graph),
      })),
    } as unknown as EntityManager;
    const service = new DailyChecklistsService(repository, {
      transaction: async <T>(
        callback: (value: EntityManager) => Promise<T>,
      ): Promise<T> => callback(transactionManager),
    } as unknown as DataSource);

    await expect(
      service.createOrGet('2999-01-01', fullDayDto(), 'user-1'),
    ).rejects.toMatchObject({
      response: { code: 'CHECKLIST_ALREADY_CONFIGURED' },
    });
  });

  it('過去日の設定変更と削除をTransaction前に拒否する', async () => {
    const transaction = jest.fn();
    const service = new DailyChecklistsService(repository, {
      transaction,
    } as unknown as DataSource);
    const revision = {
      checklistId: '11111111-1111-4111-8111-111111111111',
      version: 1,
      confirmDataLoss: true,
    };

    await expect(
      service.updateConfiguration(
        '2000-01-01',
        { ...fullDayDto(), ...revision },
        'user-1',
      ),
    ).rejects.toMatchObject({ response: { code: 'CHECKLIST_PAST_DATE' } });
    await expect(
      service.cancel('2000-01-01', revision, 'user-1'),
    ).rejects.toMatchObject({ response: { code: 'CHECKLIST_PAST_DATE' } });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('過去日の項目更新とカテゴリ追加をTransaction前に拒否する', async () => {
    const transaction = jest.fn();
    const service = new DailyChecklistsService(repository, {
      transaction,
    } as unknown as DataSource);

    await expect(
      service.updateItem(
        '2000-01-01',
        ChecklistPeriodType.FULL_DAY,
        '11111111-1111-4111-8111-111111111111',
        { takeoutQuantity: 1, checked: true, version: 1 },
      ),
    ).rejects.toMatchObject({ response: { code: 'CHECKLIST_PAST_DATE' } });
    await expect(
      service.addCategories('2000-01-01', ChecklistPeriodType.FULL_DAY, {
        categoryIds: ['11111111-1111-4111-8111-111111111111'],
      }),
    ).rejects.toMatchObject({ response: { code: 'CHECKLIST_PAST_DATE' } });
    expect(transaction).not.toHaveBeenCalled();
  });
});

function fullDayDto(): CreateDailyChecklistDto {
  return {
    scheduleMode: ScheduleMode.FULL_DAY,
    periods: [
      {
        period: ChecklistPeriodType.FULL_DAY,
        categoryIds: ['11111111-1111-4111-8111-111111111111'],
      },
    ],
  };
}

function checklistFixture(
  overrides: Partial<DailyChecklistGraph> = {},
): DailyChecklistGraph {
  return {
    id: 'checklist-1',
    workDate: '2000-01-01',
    scheduleMode: ScheduleMode.FULL_DAY,
    status: DailyChecklistStatus.ACTIVE,
    activeWorkDate: '2000-01-01',
    createdByUserId: 'user-1',
    cancelledByUserId: null,
    cancelledAt: null,
    version: 1,
    createdAt: new Date('2000-01-01T00:00:00.000Z'),
    updatedAt: new Date('2000-01-01T00:00:00.000Z'),
    createdByUser: {} as never,
    cancelledByUser: null,
    periods: [
      {
        id: 'period-1',
        checklistId: 'checklist-1',
        period: ChecklistPeriodType.FULL_DAY,
        createdAt: new Date('2000-01-01T00:00:00.000Z'),
        updatedAt: new Date('2000-01-01T00:00:00.000Z'),
        checklist: {} as never,
        categories: [
          {
            id: 'period-category-1',
            periodId: 'period-1',
            sourceCategoryId: 'category-1',
            categoryNameSnapshot: '清掃',
            displayOrderSnapshot: 10,
            createdAt: new Date('2000-01-01T00:00:00.000Z'),
            period: {} as never,
            sourceCategory: {} as never,
          },
        ],
        items: [
          {
            id: 'item-1',
            periodId: 'period-1',
            sourceToolId: 'tool-1',
            toolNameSnapshot: 'モップ',
            categoryNameSnapshot: '清掃',
            stockQuantitySnapshot: 2,
            takeoutQuantity: 0,
            checked: false,
            displayOrderSnapshot: 10,
            version: 1,
            createdAt: new Date('2000-01-01T00:00:00.000Z'),
            updatedAt: new Date('2000-01-01T00:00:00.000Z'),
            period: {} as never,
            sourceTool: {} as never,
          },
        ],
      },
    ],
    ...overrides,
  };
}
