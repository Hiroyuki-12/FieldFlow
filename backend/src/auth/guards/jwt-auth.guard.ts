import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RecordStatus, User } from '../../database/entities';
import { AuthenticatedRequest } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenService } from '../token.service';

/**
 * JWTだけを信用せずUserの現在状態もDBで確認する認証Guard。
 * 利用停止やパスワード変更を、15分のJWT期限を待たず既存Tokenへ反映する。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  // Reflectorはデコレータの設定読取、Repositoryは現在のUser状態確認に使う。
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /** trueなら次のGuard／Controllerへ進み、例外を投げるとその場で401を返す。 */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // `@Public()`がメソッドまたはControllerへ付いているAPIはJWT確認を省略する。
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    // ExecutionContextから、現在処理しているExpressのHTTP Requestを取り出す。
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    const payload = await this.tokenService.verifyAccessToken(token);
    // JWTが正しくても、利用停止やパスワード変更が後から起きていないかDBで再確認する。
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    // JWT発行時の状態とDBの現在値が1つでも違えば、そのJWTは古いものとして拒否する。
    if (
      !user ||
      user.status !== RecordStatus.ACTIVE ||
      user.authVersion !== payload.authVersion ||
      user.role !== payload.role ||
      user.mustChangePassword !== payload.mustChangePassword
    ) {
      throw new UnauthorizedException('認証が必要です。');
    }

    // 後続GuardとControllerが再検索せず使えるよう、DB確認済み情報をRequestへ載せる。
    request.user = {
      id: user.id,
      name: user.name,
      loginId: user.loginId,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      authVersion: user.authVersion,
    };
    return true;
  }

  private extractBearerToken(request: AuthenticatedRequest): string {
    // 期待する形式は `Authorization: Bearer <JWT>` の3要素だけ。
    const authorization = request.get('authorization');
    const [scheme, token, extra] = authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token || extra) {
      throw new UnauthorizedException('認証が必要です。');
    }
    return token;
  }
}
