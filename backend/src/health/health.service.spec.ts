import { DataSource } from 'typeorm';

import { HealthService } from './health.service';

describe('HealthService', () => {
  it('DBへ副作用のない疎通確認クエリを送る', async () => {
    const query = jest.fn().mockResolvedValue([{ 1: 1 }]);
    const dataSource = {
      query,
    } as unknown as DataSource;
    const service = new HealthService(dataSource);

    await expect(service.checkDatabase()).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });
});
