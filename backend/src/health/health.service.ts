import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** DBへ軽量なクエリを送り、APIだけが起動した不完全な状態を正常と判定しない。 */
@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async checkDatabase(): Promise<void> {
    await this.dataSource.query('SELECT 1');
  }
}
