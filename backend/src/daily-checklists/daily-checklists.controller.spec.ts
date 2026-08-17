import {
  ChecklistPeriodType,
  ScheduleMode,
  UserRole,
} from '../database/entities';
import { DailyChecklistsController } from './daily-checklists.controller';
import { DailyChecklistsService } from './daily-checklists.service';

describe('DailyChecklistsController', () => {
  const dailyChecklistsService = {
    findByDate: jest.fn(),
    createOrGet: jest.fn(),
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
});
