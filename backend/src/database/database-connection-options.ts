import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';

/**
 * NestJS通常起動とMigration／Seed CLIで共有する、MySQL接続の運用設定。
 * 接続先やパスワードとは分離し、TLS検証と接続数制限をどの入口でも同じにする。
 */
export interface DatabaseConnectionOptions {
  poolSize: number;
  connectTimeout: number;
  ssl?: {
    ca: string;
    rejectUnauthorized: true;
    minVersion: 'TLSv1.2';
  };
  extra: {
    waitForConnections: true;
    queueLimit: number;
    maxIdle: number;
    idleTimeout: number;
  };
}

export interface DatabaseConnectionOptionValues {
  poolLimit: number;
  connectTimeoutMs: number;
  tlsEnabled: boolean;
  tlsCaBase64?: string;
  tlsCaFile?: string;
}

const DATABASE_QUEUE_LIMIT = 20;
const DATABASE_IDLE_TIMEOUT_MS = 60_000;

/**
 * Secretへ1行で登録したBase64形式のCAをPEMへ戻す。
 * 設定エラーには秘密値を含めず、CA不足や壊れた値をDB接続前に検出する。
 */
export function decodeDatabaseTlsCa(tlsCaBase64: string): string {
  const normalizedValue = tlsCaBase64.trim();
  const isCanonicalBase64 =
    normalizedValue.length > 0 &&
    normalizedValue.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(normalizedValue) &&
    Buffer.from(normalizedValue, 'base64').toString('base64') ===
      normalizedValue;

  if (!isCanonicalBase64) {
    throw new Error('DB_TLS_CA_BASE64 must be valid base64');
  }

  const certificate = Buffer.from(normalizedValue, 'base64').toString('utf8');
  if (
    !certificate.includes('-----BEGIN CERTIFICATE-----') ||
    !certificate.includes('-----END CERTIFICATE-----')
  ) {
    throw new Error('DB_TLS_CA_BASE64 must contain a PEM certificate');
  }

  return certificate;
}

/**
 * ECSではAWS公開のRDS CA bundleをimageへ同梱し、そのfileを読む。
 * CA本文をTask DefinitionやSSMへ複製せず、CA更新をimageのレビュー対象にできる。
 */
export function readDatabaseTlsCaFile(tlsCaFile: string): string {
  try {
    const certificate = readFileSync(tlsCaFile, 'utf8');
    if (
      !certificate.includes('-----BEGIN CERTIFICATE-----') ||
      !certificate.includes('-----END CERTIFICATE-----')
    ) {
      throw new Error('invalid certificate');
    }
    return certificate;
  } catch {
    // pathやOS由来の詳細を本番レスポンスへ漏らさず、設定名だけで原因を示す。
    throw new Error('DB_TLS_CA_FILE must point to a readable PEM certificate');
  }
}

/**
 * MySQL driverへ渡すTLS・pool・timeout設定を一か所で作る。
 * Aiven無料枠の接続上限を使い切らないよう、アプリ側のpool上限を明示する。
 */
export function createDatabaseConnectionOptions(
  values: DatabaseConnectionOptionValues,
): DatabaseConnectionOptions {
  const options: DatabaseConnectionOptions = {
    poolSize: values.poolLimit,
    connectTimeout: values.connectTimeoutMs,
    extra: {
      waitForConnections: true,
      // 無制限queueによるメモリ増加を避け、過負荷時は呼び出し側へ失敗を返す。
      queueLimit: DATABASE_QUEUE_LIMIT,
      maxIdle: values.poolLimit,
      idleTimeout: DATABASE_IDLE_TIMEOUT_MS,
    },
  };

  if (!values.tlsEnabled) {
    return options;
  }

  if (!values.tlsCaBase64 && !values.tlsCaFile) {
    throw new Error(
      'DB_TLS_CA_BASE64 or DB_TLS_CA_FILE is required when DB_TLS_ENABLED=true',
    );
  }

  const certificate = values.tlsCaBase64
    ? decodeDatabaseTlsCa(values.tlsCaBase64)
    : readDatabaseTlsCaFile(values.tlsCaFile!);

  return {
    ...options,
    ssl: {
      ca: certificate,
      // 暗号化だけでなく接続先証明書を検証し、中間者攻撃や偽DBへの接続を防ぐ。
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
  };
}
