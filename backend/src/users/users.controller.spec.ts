import { RecordStatus, UserRole } from '../database/entities';
import { AuditLogService } from '../common/logging/audit-log.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  const usersService = {
    findAll: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    reissueTemporaryPassword: jest.fn(),
  };
  const auditLogService = { management: jest.fn() };
  const controller = new UsersController(
    usersService as unknown as UsersService,
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

  it('状態変更で認証済み管理者とversionをServiceへ渡す', async () => {
    const dto = { status: RecordStatus.INACTIVE, version: 3 };
    usersService.updateStatus.mockResolvedValue({ id: 'target-id' });

    await controller.updateStatus(currentUser, 'target-id', dto);

    expect(usersService.updateStatus).toHaveBeenCalledWith(
      currentUser,
      'target-id',
      dto,
    );
    expect(auditLogService.management).toHaveBeenCalledWith(
      currentUser.id,
      'user_status_updated',
      'user',
      'target-id',
    );
  });

  it('仮パスワード再発行結果を加工せず一度だけ返す', async () => {
    const response = { id: 'target-id', temporaryPassword: 'temporary-pass' };
    usersService.reissueTemporaryPassword.mockResolvedValue(response);

    await expect(
      controller.reissueTemporaryPassword(currentUser, 'target-id'),
    ).resolves.toBe(response);
    expect(auditLogService.management).toHaveBeenCalledWith(
      currentUser.id,
      'user_temporary_password_reissued',
      'user',
      'target-id',
    );
    expect(JSON.stringify(auditLogService.management.mock.calls)).not.toContain(
      'temporary-pass',
    );
  });
});
