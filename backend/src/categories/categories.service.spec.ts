import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';

import {
  Category,
  CategoryType,
  RecordStatus,
  Tool,
} from '../database/entities';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  const findOne = jest.fn();
  const repository = { findOne } as unknown as Repository<Category>;

  beforeEach(() => jest.clearAllMocks());

  it('詳細取得でRelationをレスポンスへ混ぜない', async () => {
    findOne.mockResolvedValue(categoryFixture());
    const service = new CategoriesService(repository, {} as DataSource);

    const response = await service.findOne('category-1');

    expect(response).toMatchObject({ name: '清掃', categoryType: 'WORK' });
    expect(response).not.toHaveProperty('tools');
    expect(response).not.toHaveProperty('periodCategories');
  });

  it('存在しないカテゴリを404相当で拒否する', async () => {
    findOne.mockResolvedValue(null);
    const service = new CategoriesService(repository, {} as DataSource);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('利用中の道具があるカテゴリの停止を拒否して保存しない', async () => {
    const category = categoryFixture();
    const save = jest.fn();
    const count = jest.fn().mockResolvedValue(1);
    const manager = createManager(category, save, count);
    const dataSource = transactionDataSource(manager);
    const service = new CategoriesService(repository, dataSource);

    await expect(
      service.updateStatus('category-1', {
        status: RecordStatus.INACTIVE,
        version: 1,
      }),
    ).rejects.toMatchObject({
      response: { code: 'CATEGORY_IN_USE' },
    });
    expect(count).toHaveBeenCalledWith({
      where: { categoryId: 'category-1', status: RecordStatus.ACTIVE },
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('COMMONカテゴリの利用停止を道具検索前に拒否する', async () => {
    const category = categoryFixture({ categoryType: CategoryType.COMMON });
    const save = jest.fn();
    const count = jest.fn();
    const manager = createManager(category, save, count);
    const dataSource = transactionDataSource(manager);
    const service = new CategoriesService(repository, dataSource);

    await expect(
      service.updateStatus('category-1', {
        status: RecordStatus.INACTIVE,
        version: 1,
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMON_CATEGORY_PROTECTED' },
    });
    expect(count).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});

function categoryFixture(overrides: Partial<Category> = {}): Category {
  return {
    id: 'category-1',
    name: '清掃',
    displayOrder: 10,
    categoryType: CategoryType.WORK,
    status: RecordStatus.ACTIVE,
    version: 1,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    tools: [],
    periodCategories: [],
    ...overrides,
  };
}

function createManager(
  category: Category,
  save: jest.Mock,
  count: jest.Mock,
): EntityManager {
  const queryBuilder = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(category),
  };
  return {
    getRepository: jest.fn((entity: typeof Category | typeof Tool) =>
      entity === Category
        ? { createQueryBuilder: jest.fn(() => queryBuilder), save }
        : { count },
    ),
  } as unknown as EntityManager;
}

function transactionDataSource(manager: EntityManager): DataSource {
  return {
    transaction: async <T>(
      callback: (transactionManager: EntityManager) => Promise<T>,
    ): Promise<T> => callback(manager),
  } as unknown as DataSource;
}
