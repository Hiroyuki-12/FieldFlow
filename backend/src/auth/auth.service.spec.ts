import { DataSource } from 'typeorm';

import { UserRole } from '../database/entities';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

describe('AuthService', () => {
  const transaction = jest.fn();
  const service = new AuthService(
    { transaction } as unknown as DataSource,
    {} as TokenService,
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
});
