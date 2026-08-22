import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getRequestId } from './request-context';

export type ApplicationLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogFields = Record<string, unknown>;

const REDACTED_VALUE = '[REDACTED]';
const TRUNCATED_VALUE = '[TRUNCATED]';
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|credential|password|secret|token|api[-_]?key/i;
const MAX_SANITIZE_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;

const LEVEL_PRIORITY: Record<ApplicationLogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

interface StructuredLogEntry extends LogFields {
  timestamp: string;
  level: ApplicationLogLevel;
  service: string;
  environment: string;
  event: string;
  requestId?: string;
}

/**
 * CloudWatchで項目検索できるよう、Nestのシステムログと業務イベントを1行JSONへ統一する。
 * 任意Objectを受けても秘密キーを再帰的にマスキングし、Error本文やstackは直接出力しない。
 */
@Injectable()
export class ApplicationLogger implements LoggerService {
  private enabledLevel: ApplicationLogLevel;
  private readonly environment: string;
  private readonly knownSecretValues: string[];

  constructor(configService: ConfigService) {
    this.environment = configService.get<string>('NODE_ENV', 'unknown');
    this.enabledLevel = configService.get<ApplicationLogLevel>(
      'LOG_LEVEL',
      'info',
    );
    // 設定値が例外の自由文へ混入しても伏せられるよう、既知の秘密値だけを保持する。
    this.knownSecretValues = [
      configService.get<string>('DB_PASSWORD'),
      configService.get<string>('JWT_ACCESS_SECRET'),
      configService.get<string>('INITIAL_ADMIN_PASSWORD'),
    ].filter((value): value is string => Boolean(value && value.length >= 4));
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.writeSystemLog('info', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.writeSystemLog('fatal', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.writeSystemLog('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.writeSystemLog('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.writeSystemLog('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.writeSystemLog('debug', message, optionalParams);
  }

  /** Nestが実行時にログレベルを変更する場合も、構造化ログ側の閾値へ反映する。 */
  setLogLevels(
    levels: Array<keyof typeof LEVEL_PRIORITY | 'log' | 'verbose'>,
  ): void {
    const priorities = levels.map((level) => {
      if (level === 'log') return LEVEL_PRIORITY.info;
      if (level === 'verbose') return LEVEL_PRIORITY.debug;
      return LEVEL_PRIORITY[level];
    });
    this.enabledLevel = this.levelFromPriority(
      priorities.length > 0 ? Math.max(...priorities) : LEVEL_PRIORITY.info,
    );
  }

  /** 認証・管理操作・HTTPなど、名前と項目が確定したアプリケーションイベントを記録する。 */
  event(
    level: ApplicationLogLevel,
    event: string,
    fields: LogFields = {},
  ): void {
    if (!this.isEnabled(level)) return;

    const requestId = getRequestId();
    const sanitizedFields = sanitizeLogValue(fields);
    const entry: StructuredLogEntry = {
      ...(isRecord(sanitizedFields) ? sanitizedFields : {}),
      timestamp: new Date().toISOString(),
      level,
      service: 'fieldflow-backend',
      environment: this.environment,
      event,
      ...(requestId ? { requestId } : {}),
    };
    this.writeEntry(level, entry);
  }

  private writeSystemLog(
    level: ApplicationLogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const messageRecord = isRecord(message) ? message : null;
    const event =
      messageRecord && typeof messageRecord.event === 'string'
        ? messageRecord.event
        : 'application_log';
    const context = this.findContext(optionalParams);
    const fields: LogFields = {
      ...(messageRecord
        ? Object.fromEntries(
            Object.entries(messageRecord).filter(([key]) => key !== 'event'),
          )
        : { message }),
      ...(context ? { context } : {}),
    };

    // error()の第2引数にはstackが渡り得る。SQLや秘密値の混入を避けるため任意stackは出力しない。
    this.event(level, event, fields);
  }

  private findContext(optionalParams: unknown[]): string | undefined {
    const last = optionalParams.at(-1);
    return typeof last === 'string' ? last : undefined;
  }

  private isEnabled(level: ApplicationLogLevel): boolean {
    return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[this.enabledLevel];
  }

  private levelFromPriority(priority: number): ApplicationLogLevel {
    if (priority <= LEVEL_PRIORITY.fatal) return 'fatal';
    if (priority === LEVEL_PRIORITY.error) return 'error';
    if (priority === LEVEL_PRIORITY.warn) return 'warn';
    if (priority === LEVEL_PRIORITY.info) return 'info';
    return 'debug';
  }

  private writeEntry(
    level: ApplicationLogLevel,
    entry: StructuredLogEntry,
  ): void {
    let line = JSON.stringify(entry);
    for (const secret of this.knownSecretValues) {
      // JSON内では引用符等がescapeされるため、同じJSON表現の中身を置換する。
      const encodedSecret = JSON.stringify(secret).slice(1, -1);
      line = line.split(encodedSecret).join(REDACTED_VALUE);
    }
    line += '\n';
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(line);
      return;
    }
    process.stdout.write(line);
  }
}

/** ログ用Objectを再帰的に安全化する。レスポンス本文の変換には使用しない。 */
export function sanitizeLogValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (depth > MAX_SANITIZE_DEPTH) return TRUNCATED_VALUE;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name };
  if (typeof value !== 'object') return `[${typeof value}]`;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeLogValue(item, depth + 1, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED_VALUE
        : sanitizeLogValue(item, depth + 1, seen),
    ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
