import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/** ALBと開発者がAPI・DBの疎通を確認するための機能を提供する。 */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
