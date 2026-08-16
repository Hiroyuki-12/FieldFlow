import { RecordStatus } from '../database/entities';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

describe('CategoriesController', () => {
  const categoriesService = {
    findAll: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
  };
  const controller = new CategoriesController(
    categoriesService as unknown as CategoriesService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('一覧の検索条件をServiceへそのまま渡す', async () => {
    const query = { search: '清掃', status: RecordStatus.ACTIVE };
    categoriesService.findAll.mockResolvedValue({ items: [] });

    await controller.findAll(query);

    expect(categoriesService.findAll).toHaveBeenCalledWith(query);
  });

  it('状態変更で対象IDとversionをServiceへ渡す', async () => {
    const dto = { status: RecordStatus.INACTIVE, version: 3 };
    categoriesService.updateStatus.mockResolvedValue({ id: 'category-id' });

    await controller.updateStatus('category-id', dto);

    expect(categoriesService.updateStatus).toHaveBeenCalledWith(
      'category-id',
      dto,
    );
  });
});
