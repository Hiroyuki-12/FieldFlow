import { Injectable } from '@nestjs/common';

import { ApplicationLogger, LogFields } from './application-logger';

/**
 * セキュリティ調査に必要な認証・管理操作だけを、固定した項目で記録する。
 * DTOをそのまま渡せないAPIにすることで、パスワードや変更本文の誤出力を防ぐ。
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly logger: ApplicationLogger) {}

  authentication(
    event: string,
    result: 'succeeded' | 'failed' | 'invalid' | 'reused' | 'skipped',
    fields: LogFields = {},
  ): void {
    this.logger.event(
      result === 'failed' || result === 'invalid' || result === 'reused'
        ? 'warn'
        : 'info',
      event,
      {
        result,
        ...fields,
      },
    );
  }

  management(
    actorUserId: string,
    action: string,
    targetType: 'user' | 'category' | 'tool',
    targetId: string,
  ): void {
    this.logger.event('info', 'management_operation', {
      actorUserId,
      action,
      targetType,
      targetId,
      result: 'succeeded',
    });
  }
}
