import type { Request } from 'express';

import { UserRole } from '../database/entities';

/**
 * JWTへ含める最小限の認証情報。
 * `interface`はTypeScriptの型定義で、実行時のデータやDB列を新しく作るものではない。
 */
export interface AccessTokenPayload {
  // subはJWT標準の「このTokenの利用者」を示す項目。FieldFlowではUser IDを入れる。
  sub: string;
  role: UserRole;
  mustChangePassword: boolean;
  authVersion: number;
  jti: string;
  // iat（発行時刻）とexp（期限）はJwtServiceが署名時に自動追加する。
  iat?: number;
  exp?: number;
}

/** GuardがDB確認後にRequestへ設定する、信頼済みの現在ユーザー情報。 */
export interface AuthenticatedUser {
  id: string;
  name: string;
  loginId: string;
  role: UserRole;
  mustChangePassword: boolean;
  authVersion: number;
}

export interface AuthenticatedRequest extends Request {
  // JwtAuthGuardの検証成功後にだけuserが入るため、検証前はundefinedになり得る。
  user?: AuthenticatedUser;
  // cookie-parserがHTTPのCookie Headerを解析して設定する。
  cookies: Record<string, string | undefined>;
}

/** Session調査に必要な情報だけを保存し、リクエスト本文やTokenは渡さない。 */
export interface AuthClientMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface PublicUserResponse {
  // passwordHashやauthVersionなど、画面表示に不要な内部情報は含めない。
  id: string;
  name: string;
  loginId: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface LoginResponse {
  // Access TokenはFrontendがメモリだけに保持し、Authorization Headerへ付ける。
  accessToken: string;
  expiresIn: number;
  user: PublicUserResponse;
}
