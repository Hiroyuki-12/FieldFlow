import { randomUUID } from 'node:crypto';

import {
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import {
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
} from '../common/security/password-hashing';
import { AuditLogService } from '../common/logging/audit-log.service';
import { RecordStatus, RefreshSession, User } from '../database/entities';
import {
  ACCOUNT_LOCK_DURATION_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from './auth.constants';
import {
  AuthClientMetadata,
  AuthenticatedUser,
  LoginResponse,
  PublicUserResponse,
} from './auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { TokenService } from './token.service';

interface TokenResponseResult {
  // responseだけをJSONとして返し、生のRefresh TokenはControllerがCookieへ移す。
  response: LoginResponse;
  refreshToken: string;
}

// `status`を目印にしたUnion型。TypeScriptはstatus確認後に、その結果が持つ項目を絞り込める。
// Transaction内では例外ではなく結果を返し、失敗回数など必要なDB更新をcommitさせる。
type LoginTransactionResult =
  | { status: 'failed' }
  | { status: 'succeeded'; user: User; refreshToken: string };

type RefreshTransactionResult =
  | { status: 'invalid'; userId?: string }
  | { status: 'reused'; userId: string }
  | { status: 'succeeded'; user: User; refreshToken: string };

/**
 * 認証情報の検証とRefresh Sessionの状態遷移を担当する。
 * 複数のDB更新が必要な処理はTransactionへまとめ、中途半端な失効や発行を残さない。
 */
@Injectable()
export class AuthService {
  // DataSourceはTransactionの開始、TokenServiceはToken生成・ハッシュ化を担当する。
  constructor(
    private readonly dataSource: DataSource,
    private readonly tokenService: TokenService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * loginIdとパスワードを検証し、成功時に端末用Refresh Sessionを1件作る。
   * 戻り値はControllerで「JSONレスポンス」と「HttpOnly Cookie」へ分けて送信される。
   */
  async login(
    dto: LoginDto,
    client: AuthClientMetadata,
  ): Promise<TokenResponseResult> {
    const now = new Date();
    // transactionのcallbackが正常終了した場合だけ、内部で行ったsaveがまとめてcommitされる。
    const result = await this.dataSource.transaction(
      async (manager): Promise<LoginTransactionResult> => {
        // 同時ログインでも失敗回数とロック状態を失わないよう、対象Userを更新ロックする。
        const user = await manager
          .getRepository(User)
          .createQueryBuilder('user')
          .setLock('pessimistic_write')
          .where('user.loginId = :loginId', { loginId: dto.loginId })
          .getOne();

        // ユーザーがいなくても重いArgon2id処理を行い、応答時間による存在確認を難しくする。
        if (!user) {
          await verifyDummyPassword(dto.password);
          return { status: 'failed' };
        }

        if (user.status !== RecordStatus.ACTIVE) {
          // 利用停止とパスワード不一致の処理時間・応答を近づけ、状態を外部へ漏らさない。
          await verifyPassword(user.passwordHash, dto.password);
          return { status: 'failed' };
        }

        // lockedUntilが未来なら、正しいパスワードでもロック期限まではログインさせない。
        if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
          await verifyPassword(user.passwordHash, dto.password);
          return { status: 'failed' };
        }

        // ロック期限を過ぎた後は、新しい連続失敗の計測として0回から開始する。
        if (user.lockedUntil) {
          user.failedLoginCount = 0;
          user.lockedUntil = null;
        }

        // DBのArgon2idハッシュと入力パスワードを照合し、失敗回数を永続化する。
        if (!(await verifyPassword(user.passwordHash, dto.password))) {
          user.failedLoginCount += 1;
          if (user.failedLoginCount >= MAX_FAILED_LOGIN_ATTEMPTS) {
            user.lockedUntil = new Date(
              now.getTime() + ACCOUNT_LOCK_DURATION_MS,
            );
          }
          // 例外をTransaction内で投げると失敗回数までrollbackされるため、結果を返してcommitする。
          await manager.getRepository(User).save(user);
          return { status: 'failed' };
        }

        // 認証成功時は過去の失敗状態を消し、この端末用のRefresh Sessionを新規作成する。
        user.failedLoginCount = 0;
        user.lockedUntil = null;
        await manager.getRepository(User).save(user);

        const refreshToken = this.tokenService.createRefreshToken(now);
        // `rawToken`は保存せず、漏洩してもそのまま利用できないtokenHashだけをDBへ入れる。
        await manager.getRepository(RefreshSession).save(
          manager.getRepository(RefreshSession).create({
            id: randomUUID(),
            userId: user.id,
            tokenHash: refreshToken.tokenHash,
            expiresAt: refreshToken.expiresAt,
            revokedAt: null,
            replacedBySessionId: null,
            userAgent: client.userAgent,
            ipAddress: client.ipAddress,
          }),
        );

        return {
          status: 'succeeded',
          user,
          refreshToken: refreshToken.rawToken,
        };
      },
    );

    // 失敗理由を外へ分けて返さず、ユーザーの存在・停止・ロック状態を推測させない。
    if (result.status === 'failed') {
      // loginIdや失敗理由をログへ分けて出さず、外部からユーザー状態を推測できないようにする。
      this.auditLogService.authentication('authentication_login', 'failed', {
        ipAddress: client.ipAddress,
      });
      throw this.invalidCredentialsException();
    }
    this.auditLogService.authentication('authentication_login', 'succeeded', {
      userId: result.user.id,
      ipAddress: client.ipAddress,
    });
    return this.createTokenResponse(result.user, result.refreshToken);
  }

  /**
   * CookieのRefresh Tokenを一度だけ使用し、旧Sessionを失効して新Sessionへ置き換える。
   * 同じTokenが同時利用されても片方だけ成功するよう、DBの行ロックを使用する。
   */
  async refresh(
    rawRefreshToken: string | undefined,
    client: AuthClientMetadata,
  ): Promise<TokenResponseResult> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('認証が必要です。');
    }

    const now = new Date();
    // DBにはハッシュだけがあるため、Cookie値も同じSHA-256へ変換して検索する。
    const tokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);
    const result = await this.dataSource.transaction(
      async (manager): Promise<RefreshTransactionResult> => {
        // 同じTokenの同時Refreshを直列化し、両方が新Sessionを作る競合を防ぐ。
        const session = await manager
          .getRepository(RefreshSession)
          .createQueryBuilder('session')
          .innerJoinAndSelect('session.user', 'user')
          .setLock('pessimistic_write')
          .where('session.tokenHash = :tokenHash', { tokenHash })
          .getOne();

        if (!session) {
          return { status: 'invalid' };
        }

        // 失効済みSessionのうち、後継Sessionを持つものは「使用済みToken」と判断する。
        if (session.revokedAt) {
          if (session.replacedBySessionId) {
            // ローテーション後のToken再利用は盗難の兆候として、全端末の有効Sessionを失効する。
            await this.revokeAllActiveSessions(manager, session.userId, now);
            return { status: 'reused', userId: session.userId };
          }
          return { status: 'invalid', userId: session.userId };
        }

        // 期限切れまたは利用停止ユーザーのSessionは、その場で失効時刻も記録する。
        if (
          session.expiresAt.getTime() <= now.getTime() ||
          session.user.status !== RecordStatus.ACTIVE
        ) {
          session.revokedAt = now;
          await manager.getRepository(RefreshSession).save(session);
          return { status: 'invalid', userId: session.userId };
        }

        // 新TokenのSessionを先に作り、そのIDを旧Sessionへ記録して履歴を鎖状につなぐ。
        const nextToken = this.tokenService.createRefreshToken(now);
        const nextSession = await manager.getRepository(RefreshSession).save(
          manager.getRepository(RefreshSession).create({
            id: randomUUID(),
            userId: session.userId,
            tokenHash: nextToken.tokenHash,
            expiresAt: nextToken.expiresAt,
            revokedAt: null,
            replacedBySessionId: null,
            userAgent: client.userAgent,
            ipAddress: client.ipAddress,
          }),
        );

        // 旧Tokenはこの時点から再利用不可になる。再送された場合は上の盗難検知へ進む。
        session.revokedAt = now;
        session.replacedBySessionId = nextSession.id;
        await manager.getRepository(RefreshSession).save(session);

        return {
          status: 'succeeded',
          user: session.user,
          refreshToken: nextToken.rawToken,
        };
      },
    );

    if (result.status !== 'succeeded') {
      this.auditLogService.authentication(
        'authentication_refresh',
        result.status,
        {
          ...(result.userId ? { userId: result.userId } : {}),
          ipAddress: client.ipAddress,
        },
      );
      throw new UnauthorizedException('認証が必要です。');
    }
    this.auditLogService.authentication('authentication_refresh', 'succeeded', {
      userId: result.user.id,
      ipAddress: client.ipAddress,
    });
    return this.createTokenResponse(result.user, result.refreshToken);
  }

  /** Logoutは何度送られても204にできるよう、該当する有効Sessionだけを失効する。 */
  async logout(rawRefreshToken: string | undefined): Promise<void> {
    // Cookieがすでに消えている場合も成功扱いにし、Logoutを安全に再実行できるようにする。
    if (!rawRefreshToken) {
      this.auditLogService.authentication('authentication_logout', 'skipped');
      return;
    }

    const tokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);
    const userId = await this.dataSource.transaction(async (manager) => {
      const session = await manager
        .getRepository(RefreshSession)
        .createQueryBuilder('session')
        .setLock('pessimistic_write')
        .where('session.tokenHash = :tokenHash', { tokenHash })
        .getOne();

      // 他端末のSessionは検索・更新せず、このCookieに一致する1件だけを失効する。
      if (session && !session.revokedAt) {
        session.revokedAt = new Date();
        await manager.getRepository(RefreshSession).save(session);
      }
      return session?.userId;
    });
    this.auditLogService.authentication(
      'authentication_logout',
      userId ? 'succeeded' : 'skipped',
      userId ? { userId } : {},
    );
  }

  /** Guardが確認済みのUserから、画面へ公開してよい項目だけを返す。 */
  getCurrentUser(user: AuthenticatedUser): PublicUserResponse {
    return this.toPublicUser(user);
  }

  /**
   * 現在のパスワードを再確認して新しいハッシュへ更新する。
   * User更新・authVersion加算・全Refresh Session失効は、全部成功か全部rollbackのどちらかにする。
   */
  async changePassword(
    currentUser: AuthenticatedUser,
    dto: ChangePasswordDto,
  ): Promise<void> {
    const now = new Date();
    const outcome = await this.dataSource.transaction(async (manager) => {
      // User更新と全Session失効を同じTransactionへまとめ、片方だけ成功する状態を防ぐ。
      const user = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :id', { id: currentUser.id })
        .getOne();

      if (!user || user.status !== RecordStatus.ACTIVE) {
        // `as const`で単なるstringではなく、固定値`unauthorized`として型推論させる。
        return 'unauthorized' as const;
      }
      if (!(await verifyPassword(user.passwordHash, dto.currentPassword))) {
        return 'wrong-password' as const;
      }

      // 平文はこの処理中だけ使用し、DBへは新しいArgon2idハッシュだけを保存する。
      user.passwordHash = await hashPassword(dto.newPassword);
      user.mustChangePassword = false;
      // JWT内の古い値とDB値を不一致にして、発行済みAccess Tokenもすべて無効化する。
      user.authVersion += 1;
      user.failedLoginCount = 0;
      user.lockedUntil = null;
      await manager.getRepository(User).save(user);
      await this.revokeAllActiveSessions(manager, user.id, now);
      return 'succeeded' as const;
    });

    if (outcome === 'unauthorized') {
      this.auditLogService.authentication(
        'authentication_password_change',
        'failed',
        { userId: currentUser.id },
      );
      throw new UnauthorizedException('認証が必要です。');
    }
    if (outcome === 'wrong-password') {
      this.auditLogService.authentication(
        'authentication_password_change',
        'failed',
        { userId: currentUser.id },
      );
      throw new UnprocessableEntityException(
        '現在のパスワードが正しくありません。',
      );
    }
    this.auditLogService.authentication(
      'authentication_password_change',
      'succeeded',
      { userId: currentUser.id },
    );
  }

  private async createTokenResponse(
    user: User,
    refreshToken: string,
  ): Promise<TokenResponseResult> {
    // Access TokenはJSON用、Refresh TokenはCookie用として分けたままControllerへ返す。
    return {
      response: {
        accessToken: await this.tokenService.createAccessToken(user),
        expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
        user: this.toPublicUser(user),
      },
      refreshToken,
    };
  }

  private toPublicUser(user: User | AuthenticatedUser): PublicUserResponse {
    // Entityをそのまま返さず、passwordHashなどが将来誤ってJSON化されることを防ぐ。
    return {
      id: user.id,
      name: user.name,
      loginId: user.loginId,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }

  private async revokeAllActiveSessions(
    manager: EntityManager,
    userId: string,
    revokedAt: Date,
  ): Promise<void> {
    // `revoked_at IS NULL`だけを一括更新し、過去の失効日時は上書きしない。
    await manager
      .getRepository(RefreshSession)
      .createQueryBuilder()
      .update(RefreshSession)
      .set({ revokedAt })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();
  }

  private invalidCredentialsException(): UnauthorizedException {
    // どの条件で失敗したかを同じ文面へまとめ、アカウント列挙攻撃を防ぐ。
    return new UnauthorizedException(
      'ログインIDまたはパスワードが正しくありません。',
    );
  }
}
