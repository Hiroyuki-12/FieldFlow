import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { User } from '../database/entities';
import { AccessTokenPayload } from './auth.types';

export interface RefreshTokenPair {
  // rawTokenはブラウザへ一度だけ返し、永続化しない。
  rawToken: string;
  // tokenHashはDB検索・照合用。元のTokenへ戻せないSHA-256の16進文字列。
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Access TokenとRefresh Tokenの生成・検証規則を一元管理する。
 * `@Injectable`によりNestJSのDI対象となり、AuthServiceやGuardから共有できる。
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /** JWTへ秘密情報を入れず、認可と即時失効に必要なクレームだけを署名する。 */
  async createAccessToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      authVersion: user.authVersion,
      jti: randomUUID(),
    };

    // JwtModuleに設定した秘密鍵と有効期間で署名し、改ざんを検出できる文字列へ変換する。
    return this.jwtService.signAsync(payload);
  }

  /** 改ざんと期限を検証し、不正なTokenの詳細は呼び出し元へ漏らさない。 */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      // verifyAsyncは署名だけでなく、JwtServiceが付与したexp（有効期限）も確認する。
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
      );
      // 署名が正しくても必要な項目が欠けたTokenは、認証情報として使用しない。
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.role !== 'string' ||
        typeof payload.mustChangePassword !== 'boolean' ||
        !Number.isInteger(payload.authVersion) ||
        typeof payload.jti !== 'string'
      ) {
        throw new UnauthorizedException();
      }
      return payload;
    } catch {
      throw new UnauthorizedException('認証が必要です。');
    }
  }

  /** 32byteの乱数本体はCookieへ、SHA-256ハッシュだけをDBへ保存する。 */
  createRefreshToken(now = new Date()): RefreshTokenPair {
    // randomBytes(32)は256bitの暗号学的乱数。base64urlならCookieで扱いやすい文字列になる。
    const rawToken = randomBytes(32).toString('base64url');
    const ttlSeconds = this.getRefreshTokenTtlSeconds();

    return {
      rawToken,
      tokenHash: this.hashRefreshToken(rawToken),
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
    };
  }

  hashRefreshToken(rawToken: string): string {
    // SHA-256は一方向変換なので、DBの値だけから生Tokenを復元できない。
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /** 環境変数で検証済みのAccess Token有効秒数を返す。 */
  getAccessTokenTtlSeconds(): number {
    return this.configService.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
  }

  /** 環境変数で検証済みのRefresh Token有効秒数を返す。 */
  getRefreshTokenTtlSeconds(): number {
    return this.configService.getOrThrow<number>('REFRESH_TOKEN_TTL_SECONDS');
  }
}
