import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';

/**
 * NestJSアプリ全体へ共通のHTTP設定を適用する。
 * main.tsと結合テストの両方から呼び、テスト時だけ設定が抜けることを防ぐ。
 */
export function configureApp(app: INestApplication): void {
  // ConfigServiceは起動時検証済みの環境変数を型付きで取り出す窓口。
  const configService = app.get(ConfigService);

  // Controllerのパスより前へ`/api`を共通追加する。AuthControllerは結果的に`/api/v1/auth`になる。
  app.setGlobalPrefix('api');
  // Cookie Headerを解析し、request.cookiesから名前で取得できるようにする。
  app.use(cookieParser());
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
