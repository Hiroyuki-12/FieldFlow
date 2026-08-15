import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { configureApp } from './configure-app';

/** FieldFlow APIを共通設定付きで起動する。 */
async function bootstrap(): Promise<void> {
  // AppModuleを入口にNestJSアプリを生成し、constructor DIなどを利用可能にする。
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const nodeEnv = configService.getOrThrow<string>('NODE_ENV');

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
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  // すべてのネットワークinterfaceで8080を待ち受け、Docker／ECSから到達可能にする。
  await app.listen(configService.getOrThrow<number>('PORT'), '0.0.0.0');
}

// bootstrapを呼び出し、戻り値のPromiseをここでは利用しないことをvoidで明示する。
void bootstrap();
