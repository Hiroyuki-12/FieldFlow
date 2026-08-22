import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { ApplicationLogger } from './application-logger';
import { AuditLogService } from './audit-log.service';
import { GlobalExceptionFilter } from './global-exception.filter';
import { HttpAccessLogInterceptor } from './http-access-log.interceptor';

/** requestId、JSONログ、例外処理、監査イベントを全機能へ提供する横断Module。 */
@Global()
@Module({
  providers: [
    ApplicationLogger,
    AuditLogService,
    { provide: APP_INTERCEPTOR, useClass: HttpAccessLogInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
  exports: [ApplicationLogger, AuditLogService],
})
export class LoggingModule {}
