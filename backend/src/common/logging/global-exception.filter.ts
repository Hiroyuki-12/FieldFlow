import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

import type { AuthenticatedRequest } from '../../auth/auth.types';
import {
  ApplicationLogger,
  ApplicationLogLevel,
  sanitizeLogValue,
} from './application-logger';
import { getTemplatedPath } from './path-template';
import { getRequestId } from './request-context';
import { REQUEST_ID_HEADER } from './request-id.middleware';

interface ErrorPayload {
  statusCode: number;
  message: string | string[];
  requestId: string;
  timestamp: string;
  code?: string;
  details?: unknown;
}

/** 全例外を安全なHTTP形式へ変換し、内部情報ではなくrequestIdを利用者へ返す。 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: ApplicationLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const statusCode = this.getStatusCode(exception);
    const requestId =
      getRequestId() ??
      String(response.getHeader(REQUEST_ID_HEADER) ?? 'unavailable');
    const payload = this.createPayload(exception, statusCode, requestId);

    this.logger.event(this.levelForStatus(statusCode), 'http_exception', {
      method: request.method,
      path: getTemplatedPath(request),
      statusCode,
      ...(payload.code ? { code: payload.code } : {}),
      ...(request.user?.id ? { userId: request.user.id } : {}),
      errorType:
        exception instanceof Error
          ? exception.constructor.name
          : 'UnknownError',
    });
    response.status(statusCode).json(payload);
  }

  private createPayload(
    exception: unknown,
    statusCode: number,
    requestId: string,
  ): ErrorPayload {
    if (!(exception instanceof HttpException)) {
      return {
        statusCode,
        message:
          statusCode === Number(HttpStatus.PAYLOAD_TOO_LARGE)
            ? 'リクエストのサイズが上限を超えています。'
            : statusCode === Number(HttpStatus.BAD_REQUEST)
              ? 'リクエストの形式が正しくありません。'
              : 'サーバーで予期しないエラーが発生しました。',
        requestId,
        timestamp: new Date().toISOString(),
      };
    }

    const response = exception.getResponse();
    const responseRecord = this.isRecord(response) ? response : null;
    const rawMessage = responseRecord?.message;
    const message =
      statusCode === Number(HttpStatus.TOO_MANY_REQUESTS)
        ? '操作が続いたため一時的に制限されています。しばらく待ってからお試しください。'
        : this.isMessage(rawMessage)
          ? rawMessage
          : typeof response === 'string'
            ? response
            : exception.message;
    const code =
      typeof responseRecord?.code === 'string'
        ? responseRecord.code
        : undefined;
    const details =
      responseRecord && 'details' in responseRecord
        ? sanitizeLogValue(responseRecord.details)
        : undefined;

    return {
      statusCode,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      ...(code ? { code } : {}),
      ...(details !== undefined ? { details } : {}),
    };
  }

  private levelForStatus(statusCode: number): ApplicationLogLevel {
    if (statusCode >= 500) return 'error';
    if (statusCode === 409 || statusCode === 429) return 'warn';
    return 'info';
  }

  private getStatusCode(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    if (this.isRecord(exception)) {
      // ExpressのJSON parserはNestのHttpExceptionではないため、既知のparser種別だけを安全に変換する。
      if (exception.type === 'entity.too.large') {
        return Number(HttpStatus.PAYLOAD_TOO_LARGE);
      }
      if (exception.type === 'entity.parse.failed') {
        return Number(HttpStatus.BAD_REQUEST);
      }
    }
    return Number(HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private isMessage(value: unknown): value is string | string[] {
    return (
      typeof value === 'string' ||
      (Array.isArray(value) && value.every((item) => typeof item === 'string'))
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
