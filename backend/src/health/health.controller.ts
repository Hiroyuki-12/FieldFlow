import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

export interface HealthResponse {
  status: 'ok';
}

/** APIとDBの最小限の生存確認を公開する。 */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'APIとDBの疎通確認' })
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  async getHealth(): Promise<HealthResponse> {
    await this.healthService.checkDatabase();
    return { status: 'ok' };
  }
}
