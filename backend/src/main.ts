import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { ApplicationLogger } from './common/logging/application-logger';
import { configureApp } from './configure-app';

// DI初期化前の設定エラーも機械的に収集できるよう、起動直後からNest標準のJSON形式を使う。
const bootstrapLogger = new ConsoleLogger({ json: true });

/** FieldFlow APIを共通設定付きで起動する。 */
async function bootstrap(): Promise<void> {
  // AppModuleを入口にNestJSアプリを生成し、constructor DIなどを利用可能にする。
  const app = await NestFactory.create(AppModule, {
    // DIで生成したJSON loggerへ切り替えるまで、Nestの起動ログを欠落させず保持する。
    bufferLogs: true,
    logger: bootstrapLogger,
    // requestId MiddlewareをJSON parserより先に置き、413やJSON構文エラーも追跡可能にする。
    bodyParser: false,
  });
  const configService = app.get(ConfigService);
  const nodeEnv = configService.getOrThrow<string>('NODE_ENV');
  const logger = app.get(ApplicationLogger);

  // Nest内部ログもHTTP・認証イベントと同じ1行JSON形式へ統一する。
  app.useLogger(logger);

  // Prefix、Cookie解析、CORS、DTO検証をHTTP受付開始前に設定する。
  configureApp(app);

  if (nodeEnv !== 'production') {
    // 開発・テスト環境だけSwagger UIを公開し、本番のAPI情報露出を避ける。
    const swaggerConfig = new DocumentBuilder()
      .setTitle('FieldFlow API')
      .setDescription('FieldFlowの開発・動作確認用API仕様')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  // すべてのネットワークinterfaceで8080を待ち受け、Docker／ECSから到達可能にする。
  await app.listen(configService.getOrThrow<number>('PORT'), '0.0.0.0');
  logger.event('info', 'application_started', {
    port: configService.getOrThrow<number>('PORT'),
  });
}

// 起動失敗時は秘密を含み得るmessageやstackを避け、例外種別だけをJSONで記録する。
void bootstrap().catch((error: unknown) => {
  bootstrapLogger.error({
    event: 'application_start_failed',
    errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
  });
});
