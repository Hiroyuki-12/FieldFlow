import {
  ChecklistPeriodType,
  ScheduleMode,
  UserRole,
} from '../database/entities';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DailyChecklistsController } from './daily-checklists.controller';
import { DailyChecklistsService } from './daily-checklists.service';
import type { CreateDailyChecklistDto } from './dto/create-daily-checklist.dto';

describe('DailyChecklistsController', () => {
  const dailyChecklistsService = {
    findByDate: jest.fn(),
    createOrGet: jest.fn(),
    updateConfiguration: jest.fn(),
    cancel: jest.fn(),
  };
  const controller = new DailyChecklistsController(
    dailyChecklistsService as unknown as DailyChecklistsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('URLの日付を取得Serviceへ渡す', async () => {
    dailyChecklistsService.findByDate.mockResolvedValue({ id: 'checklist-1' });

    await controller.findByDate({ date: '2026-08-17' });

    expect(dailyChecklistsService.findByDate).toHaveBeenCalledWith(
      '2026-08-17',
    );
  });

  it('作成時に日付・DTO・認証済みユーザーIDをServiceへ渡す', async () => {
    const dto = {
      scheduleMode: ScheduleMode.FULL_DAY,
      periods: [
        {
          period: ChecklistPeriodType.FULL_DAY,
          categoryIds: ['11111111-1111-4111-8111-111111111111'],
        },
      ],
    };
    dailyChecklistsService.createOrGet.mockResolvedValue({ id: 'checklist-1' });

    await controller.createOrGet({ date: '2026-08-17' }, dto, {
      id: 'user-1',
      name: '作業者',
      loginId: 'worker01',
      role: UserRole.WORKER,
      mustChangePassword: false,
      authVersion: 1,
    });

    expect(dailyChecklistsService.createOrGet).toHaveBeenCalledWith(
      '2026-08-17',
      dto,
      'user-1',
    );
  });

  it('設定変更時に現行版と認証済みユーザーIDをServiceへ渡す', async () => {
    const dto = {
      ...fullDayInput(),
      checklistId: '11111111-1111-4111-8111-111111111111',
      version: 2,
      confirmDataLoss: false,
    };
    dailyChecklistsService.updateConfiguration.mockResolvedValue({
      id: 'new-checklist',
    });

    await controller.updateConfiguration(
      { date: '2026-08-19' },
      dto,
      authenticatedUser(),
    );

    expect(
      dailyChecklistsService.updateConfiguration,
    ).toHaveBeenCalledWith('2026-08-19', dto, 'user-1');
  });

  it('削除時に現行版と明示確認をServiceへ渡す', async () => {
    const dto = {
      checklistId: '11111111-1111-4111-8111-111111111111',
      version: 2,
      confirmDataLoss: true,
    };

    await controller.cancel(
      { date: '2026-08-19' },
      dto,
      authenticatedUser(),
    );

    expect(dailyChecklistsService.cancel).toHaveBeenCalledWith(
      '2026-08-19',
      dto,
      'user-1',
    );
  });
});

function fullDayInput(): CreateDailyChecklistDto {
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

function authenticatedUser(): AuthenticatedUser {
  return {
    id: 'user-1',
    name: '作業者',
    loginId: 'worker01',
    role: UserRole.WORKER,
    mustChangePassword: false,
    authVersion: 1,
  };
}
