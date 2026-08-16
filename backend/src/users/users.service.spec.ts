import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { RecordStatus, User, UserRole } from '../database/entities';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const findOne = jest.fn();
  const service = new UsersService(
    { findOne } as unknown as Repository<User>,
    {} as DataSource,
  );

  beforeEach(() => findOne.mockReset());

  it('詳細取得で認証用の内部情報をレスポンスへ混ぜない', async () => {
    findOne.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      name: '作業者',
      loginId: 'worker01',
      passwordHash: 'never-return-this-hash',
      role: UserRole.WORKER,
      status: RecordStatus.ACTIVE,
      mustChangePassword: false,
      authVersion: 4,
      failedLoginCount: 0,
      lockedUntil: null,
      version: 2,
      createdAt: new Date('2026-08-16T00:00:00.000Z'),
      updatedAt: new Date('2026-08-16T01:00:00.000Z'),
    });

    const response = await service.findOne(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(response).toMatchObject({ loginId: 'worker01', version: 2 });
    expect(response).not.toHaveProperty('passwordHash');
    expect(response).not.toHaveProperty('authVersion');
    expect(response).not.toHaveProperty('failedLoginCount');
  });

  it('存在しないユーザーを404相当で拒否し、空の値を画面へ返さない', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      service.findOne('99999999-9999-4999-8999-999999999999'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
