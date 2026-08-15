import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RefreshSession, User } from '../database/entities';
import { AuthCookieService } from './auth-cookie.service';
import { AuthController } from './auth.controller';
import {
  LOGIN_IP_RATE_LIMIT,
  LOGIN_IP_RATE_TTL_MS,
} from './auth.constants';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MustChangePasswordGuard } from './guards/must-change-password.guard';
import { OriginGuard } from './guards/origin.guard';
import { RolesGuard } from './guards/roles.guard';
import { TokenService } from './token.service';

/**
 * 認証機能に必要な部品をNestJSへ登録する組み立て役。
 * `imports`は外部Module、`controllers`はHTTP入口、`providers`はDI対象の処理を表す。
 */
@Module({
  imports: [
    // AuthServiceからUser／RefreshSessionのRepositoryをDIできるようにする。
    TypeOrmModule.forFeature([User, RefreshSession]),
    // 環境変数の秘密鍵と有効期間を使ってJwtServiceを生成する。鍵はコードへ直書きしない。
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn:
            configService.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS'),
        },
      }),
    }),
    // Login APIで使うIP単位の試行回数を、プロセス内メモリで数える。
    ThrottlerModule.forRoot([
      {
        ttl: LOGIN_IP_RATE_TTL_MS,
        limit: LOGIN_IP_RATE_LIMIT,
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    // providersへ登録すると、`private readonly xxx: XxxService`の形でDIできる。
    AuthService,
    AuthCookieService,
    TokenService,
    OriginGuard,
    ThrottlerGuard,
    // APP_GUARDは全Controllerへ自動適用される。登録順が判定順なので順序を維持する。
    // 1. 本人確認 → 2. 初回パスワード変更確認 → 3. Role確認、の順に判定する。
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: MustChangePasswordGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokenService],
})
export class AuthModule {}
