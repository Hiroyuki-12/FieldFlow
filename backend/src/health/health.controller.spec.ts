import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  it('DB疎通後に公開可能な最小情報だけを返す', async () => {
    const checkDatabase = jest.fn().mockResolvedValue(undefined);
    const healthService = {
      checkDatabase,
    } as unknown as HealthService;
    const controller = new HealthController(healthService);

    await expect(controller.getHealth()).resolves.toEqual({ status: 'ok' });
    expect(checkDatabase).toHaveBeenCalledTimes(1);
  });
});
