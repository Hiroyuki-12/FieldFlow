import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';

import {
  Category,
  CategoryType,
  RecordStatus,
  Tool,
} from '../database/entities';
import { ToolsService } from './tools.service';

describe('ToolsService', () => {
  const findOne = jest.fn();
  const repository = { findOne } as unknown as Repository<Tool>;
  const categoryRepository = {} as Repository<Category>;

  beforeEach(() => jest.clearAllMocks());

  it('詳細取得でカテゴリ表示情報を返し、Relationの内部構造は公開しない', async () => {
    findOne.mockResolvedValue(toolFixture());
    const service = new ToolsService(
      repository,
      categoryRepository,
      {} as DataSource,
    );

    const response = await service.findOne('tool-1');

    expect(response).toMatchObject({
      name: 'モップ',
      categoryName: '清掃',
      categoryType: 'WORK',
    });
    expect(response).not.toHaveProperty('category');
    expect(response).not.toHaveProperty('checklistItems');
  });

  it('存在しない道具を404相当で拒否する', async () => {
    findOne.mockResolvedValue(null);
    const service = new ToolsService(
      repository,
      categoryRepository,
      {} as DataSource,
    );

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('無効なカテゴリへの作成を422で拒否して道具を保存しない', async () => {
    const save = jest.fn();
    const manager = createManager({
      category: categoryFixture({ status: RecordStatus.INACTIVE }),
      tool: null,
      save,
    });
    const service = new ToolsService(
      repository,
      categoryRepository,
      transactionDataSource(manager),
    );

    await expect(
      service.create({
        name: '脚立',
        categoryId: 'category-1',
        stockQuantity: 2,
        displayOrder: 10,
      }),
    ).rejects.toMatchObject({ response: { code: 'CATEGORY_INACTIVE' } });
    expect(save).not.toHaveBeenCalled();
  });

  it('古いversionの編集をカテゴリ確認前に拒否する', async () => {
    const save = jest.fn();
    const manager = createManager({ tool: toolFixture(), save });
    const service = new ToolsService(
      repository,
      categoryRepository,
      transactionDataSource(manager),
    );

    await expect(
      service.update('tool-1', {
        name: '業務用モップ',
        categoryId: 'category-1',
        stockQuantity: 3,
        displayOrder: 20,
        version: 99,
      }),
    ).rejects.toMatchObject({ response: { code: 'TOOL_UPDATE_CONFLICT' } });
    expect(save).not.toHaveBeenCalled();
  });

  it('同じ状態への再送ではversionを進めず保存しない', async () => {
    const save = jest.fn();
    const manager = createManager({ tool: toolFixture(), save });
    const service = new ToolsService(
      repository,
      categoryRepository,
      transactionDataSource(manager),
    );

    const response = await service.updateStatus('tool-1', {
      status: RecordStatus.ACTIVE,
      version: 1,
    });

    expect(response).toMatchObject({ status: RecordStatus.ACTIVE, version: 1 });
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

function toolFixture(overrides: Partial<Tool> = {}): Tool {
  return {
    id: 'tool-1',
    categoryId: 'category-1',
    name: 'モップ',
    stockQuantity: 2,
    displayOrder: 10,
    status: RecordStatus.ACTIVE,
    version: 1,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    category: categoryFixture(),
    checklistItems: [],
    ...overrides,
  };
}

function createManager(options: {
  category?: Category;
  tool?: Tool | null;
  save: jest.Mock;
}): EntityManager {
  const category = options.category ?? categoryFixture();
  const categoryBuilder = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(category),
  };
  const toolBuilder = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(options.tool ?? null),
  };
  return {
    getRepository: jest.fn((entity: typeof Category | typeof Tool) =>
      entity === Category
        ? {
            createQueryBuilder: jest.fn(() => categoryBuilder),
            findOne: jest.fn().mockResolvedValue(category),
          }
        : {
            createQueryBuilder: jest.fn(() => toolBuilder),
            create: jest.fn((value: Tool) => value),
            save: options.save,
          },
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
