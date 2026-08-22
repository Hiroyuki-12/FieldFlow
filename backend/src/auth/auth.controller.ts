import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import {
  LOGIN_IP_RATE_LIMIT,
  LOGIN_IP_RATE_TTL_MS,
  REFRESH_TOKEN_COOKIE_NAME,
} from './auth.constants';
import { AuthCookieService } from './auth-cookie.service';
import { AuthService } from './auth.service';
import type {
  AuthClientMetadata,
  AuthenticatedRequest,
  AuthenticatedUser,
  LoginResponse,
  PublicUserResponse,
} from './auth.types';
import { AllowBeforePasswordChange } from './decorators/allow-password-change.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { OriginGuard } from './guards/origin.guard';

/**
 * `/api/v1/auth`以下のHTTPリクエストを受け取る入口。
 * Controllerはリクエスト・レスポンス・Cookieの受け渡しだけを担当し、
 * パスワード照合やDB更新などの業務処理はAuthServiceへ任せる。
 *
 * `@Controller`など`@`から始まる記述はNestJSのデコレータで、
 * クラスやメソッドをURL・HTTP Methodへ結び付ける設定として働く。
 */
@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  // NestJSのDIにより、Moduleへ登録したServiceがconstructorへ自動的に渡される。
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
  ) {}

  /**
   * POST /api/v1/auth/login
   * `@Public`でJWT認証を不要にし、IP単位の試行回数制限だけを先に適用する。
   */
  @Public()
  @Throttle({
    default: {
      limit: LOGIN_IP_RATE_LIMIT,
      ttl: LOGIN_IP_RATE_TTL_MS,
    },
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ログインしてTokenを発行する' })
  @ApiOkResponse({ description: 'Access Tokenと現在ユーザーを返す' })
  async login(
    // `@Body`はJSON本文をLoginDtoへ変換し、class-validatorの入力検証を実行する。
    @Body() dto: LoginDto,
    @Req() request: AuthenticatedRequest,
    // passthroughによりCookieを操作しつつ、JSON本文の返却はNestJSへ任せられる。
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.login(
      dto,
      this.getClientMetadata(request),
    );
    // 生のRefresh TokenはJSONへ混ぜず、JavaScriptから読めないCookieだけへ設定する。
    this.authCookieService.setRefreshToken(response, result.refreshToken);
    return result.response;
  }

  /**
   * POST /api/v1/auth/refresh
   * Cookie内の旧Tokenを検証・失効し、新しいToken一式へ交換する。
   */
  @Public()
  @UseGuards(OriginGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh Tokenをローテーションする' })
  @ApiOkResponse({ description: '新しいAccess TokenとRefresh Cookieを返す' })
  async refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    // cookie-parserが解析したCookieから、FieldFlow専用のRefresh Tokenだけを取り出す。
    const result = await this.authService.refresh(
      request.cookies[REFRESH_TOKEN_COOKIE_NAME],
      this.getClientMetadata(request),
    );
    this.authCookieService.setRefreshToken(response, result.refreshToken);
    return result.response;
  }

  /** POST /api/v1/auth/logout: 現在のブラウザに対応するSessionだけを失効する。 */
  @Public()
  @UseGuards(OriginGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '現在端末からログアウトする' })
  @ApiNoContentResponse()
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(request.cookies[REFRESH_TOKEN_COOKIE_NAME]);
    this.authCookieService.clearRefreshToken(response);
  }

  /** GET /api/v1/auth/me: JWT Guardが確認済みの現在ユーザーを返す。 */
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ログイン中のユーザー情報を取得する' })
  @ApiOkResponse()
  getMe(@CurrentUser() user: AuthenticatedUser): PublicUserResponse {
    return this.authService.getCurrentUser(user);
  }

  /**
   * PATCH /api/v1/auth/password
   * 初回パスワード変更前でもこのAPIだけは必要なので、専用デコレータで許可する。
   */
  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowBeforePasswordChange()
  @ApiBearerAuth()
  @ApiOperation({ summary: '自分のパスワードを変更する' })
  @ApiNoContentResponse()
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.changePassword(user, dto);
    // DB上の全Sessionを失効した後、現在ブラウザに残るCookieも削除する。
    this.authCookieService.clearRefreshToken(response);
  }

  private getClientMetadata(request: AuthenticatedRequest): AuthClientMetadata {
    // DB列の最大長で切り、巨大なHeaderで保存処理を失敗させられないようにする。
    return {
      ipAddress: request.ip?.slice(0, 45) ?? null,
      userAgent: request.get('user-agent')?.slice(0, 512) ?? null,
    };
  }
}
