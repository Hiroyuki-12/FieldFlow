import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, catchError, finalize, throwError } from 'rxjs';

import type { AuthenticatedRequest } from '../../auth/auth.types';
import { ApplicationLogger, ApplicationLogLevel } from './application-logger';
import { getTemplatedPath } from './path-template';

/** Controller処理の成否にかかわらず、本文を含まないHTTP完了イベントを1件記録する。 */
@Injectable()
export class HttpAccessLogInterceptor implements NestInterceptor {
  constructor(private readonly logger: ApplicationLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const startedAt = performance.now();
    let exceptionStatus: number | undefined;

    return next.handle().pipe(
      catchError((error: unknown) => {
        exceptionStatus =
          error instanceof HttpException ? error.getStatus() : 500;
        return throwError(() => error);
      }),
      finalize(() => {
        const statusCode = exceptionStatus ?? response.statusCode;
        this.logger.event(
          this.levelForStatus(statusCode),
          'http_request_completed',
          {
            method: request.method,
            path: getTemplatedPath(request as Request),
            statusCode,
            durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
            ...(request.user?.id ? { userId: request.user.id } : {}),
          },
        );
      }),
    );
  }

  private levelForStatus(statusCode: number): ApplicationLogLevel {
    if (statusCode >= 500) return 'error';
    if (statusCode === 409 || statusCode === 429) return 'warn';
    return 'info';
  }
}
