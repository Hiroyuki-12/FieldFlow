import { AuditLogService } from '../common/logging/audit-log.service';
import { RecordStatus, UserRole } from '../database/entities';
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
  const auditLogService = { management: jest.fn() };
  const controller = new CategoriesController(
    categoriesService as unknown as CategoriesService,
    auditLogService as unknown as AuditLogService,
  );
  const currentUser = {
    id: '11111111-1111-4111-8111-111111111111',
    name: '管理者',
    loginId: 'admin',
    role: UserRole.ADMIN,
    mustChangePassword: false,
    authVersion: 1,
  };

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

    await controller.updateStatus(currentUser, 'category-id', dto);

    expect(categoriesService.updateStatus).toHaveBeenCalledWith(
      'category-id',
      dto,
    );
    expect(auditLogService.management).toHaveBeenCalledWith(
      currentUser.id,
      'category_status_updated',
      'category',
      'category-id',
    );
  });
});
