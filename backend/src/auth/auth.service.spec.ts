import { DataSource, EntityManager } from 'typeorm';

import { AuditLogService } from '../common/logging/audit-log.service';
import { hashPassword } from '../common/security/password-hashing';
import { RecordStatus, User, UserRole } from '../database/entities';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

describe('AuthService', () => {
  const transaction = jest.fn();
  const service = new AuthService(
    { transaction } as unknown as DataSource,
    {} as TokenService,
    { authentication: jest.fn() } as unknown as AuditLogService,
  );

  beforeEach(() => {
    transaction.mockReset();
  });

  it('現在ユーザーから秘密情報を除いた公開項目だけを返す', () => {
    const response = service.getCurrentUser({
      id: 'user-id',
      name: '作業者',
      loginId: 'worker01',
      role: UserRole.WORKER,
      mustChangePassword: false,
      authVersion: 2,
    });

    expect(response).toEqual({
      id: 'user-id',
      name: '作業者',
      loginId: 'worker01',
      role: UserRole.WORKER,
      mustChangePassword: false,
    });
    expect(response).not.toHaveProperty('authVersion');
    expect(response).not.toHaveProperty('passwordHash');
  });

  it('CookieがないLogoutを冪等に成功させDBを更新しない', async () => {
    await expect(service.logout(undefined)).resolves.toBeUndefined();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('現在と同じパスワードを拒否し、初回変更状態や認証世代を更新しない', async () => {
    const password = 'temporary password 123';
    const user = {
      id: 'user-id',
      passwordHash: await hashPassword(password),
      status: RecordStatus.ACTIVE,
      mustChangePassword: true,
      authVersion: 1,
      failedLoginCount: 0,
      lockedUntil: null,
    } as User;
    const save = jest.fn();
    const queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user),
    };
    transaction.mockImplementation(
      (work: (manager: EntityManager) => Promise<unknown>) =>
        work({
          getRepository: jest.fn(() => ({
            createQueryBuilder: jest.fn(() => queryBuilder),
            save,
          })),
        } as unknown as EntityManager),
    );

    await expect(
      service.changePassword(
        {
          id: user.id,
          name: '作業者',
          loginId: 'worker01',
          role: UserRole.WORKER,
          mustChangePassword: true,
          authVersion: 1,
        },
        { currentPassword: password, newPassword: password },
      ),
    ).rejects.toMatchObject({
      response: { code: 'PASSWORD_UNCHANGED' },
    });
    expect(save).not.toHaveBeenCalled();
    expect(user.mustChangePassword).toBe(true);
    expect(user.authVersion).toBe(1);
  });
});
