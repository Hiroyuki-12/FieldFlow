import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import helmet from 'helmet';

import { requestIdMiddleware } from './common/logging/request-id.middleware';

const REQUEST_BODY_SIZE_LIMIT = '100kb';

/**
 * NestJSアプリ全体へ共通のHTTP設定を適用する。
 * main.tsと結合テストの両方から呼び、テスト時だけ設定が抜けることを防ぐ。
 */
export function configureApp(app: INestApplication): void {
  // ConfigServiceは起動時検証済みの環境変数を型付きで取り出す窓口。
  const configService = app.get(ConfigService);
  const nodeEnv = configService.getOrThrow<string>('NODE_ENV');

  // ECSではCloudFrontとALBを経由する。環境ごとの実際のProxy段数だけを信頼し、偽装Headerを防ぐ。
  const trustProxyHops = configService.getOrThrow<number>('TRUST_PROXY_HOPS');
  if (trustProxyHops > 0) {
    const expressApplication = app.getHttpAdapter().getInstance() as {
      set(name: string, value: number): void;
    };
    expressApplication.set('trust proxy', trustProxyHops);
  }

  // Controllerのパスより前へ`/api`を共通追加する。AuthControllerは結果的に`/api/v1/auth`になる。
  app.setGlobalPrefix('api');
  // Parserより先にrequestIdを確定し、大きすぎるBodyや壊れたJSONのエラーも追跡できるようにする。
  app.use(requestIdMiddleware);
  // 開発用Swaggerのinline scriptを妨げるCSPとHTTP環境に不要なHSTSだけ非本番で外す。
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production' ? undefined : false,
      strictTransportSecurity: nodeEnv === 'production' ? undefined : false,
    }),
  );
  // Cookie Headerを解析し、request.cookiesから名前で取得できるようにする。
  app.use(cookieParser());
  // 予期しない巨大BodyによるMemory消費を防ぐ。通常のFieldFlow DTOには十分な100KBへ固定する。
  app.use(json({ limit: REQUEST_BODY_SIZE_LIMIT }));
  app.use(urlencoded({ extended: false, limit: REQUEST_BODY_SIZE_LIMIT }));
  // Refresh Cookieをやり取りするためcredentialsを許可し、接続元は指定Originだけに限定する。
  app.enableCors({
    origin: configService.getOrThrow<string>('CORS_ORIGIN'),
    credentials: true,
  });
  // 全ControllerのDTOへ同じ入力検証ルールを適用する。
  app.useGlobalPipes(
    new ValidationPipe({
      // DTOで宣言していない値を拒否し、意図しないプロパティが業務処理へ入ることを防ぐ。
      whitelist: true,
      forbidNonWhitelisted: true,
      // JSONの通常オブジェクトをLoginDtoなどのclassインスタンスへ変換する。
      transform: true,
    }),
  );
}
