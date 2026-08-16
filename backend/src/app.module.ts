import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { environmentValidationSchema } from './config/environment.schema';
import { createTypeOrmOptions } from './database/typeorm.config';
import { HealthModule } from './health/health.module';
import { ToolsModule } from './tools/tools.module';
import { UsersModule } from './users/users.module';

/**
 * FieldFlow Backend全体のルートModule。
 * NestJSはここから辿って設定、DB、認証、healthなどの各機能を起動する。
 */
@Module({
  imports: [
    // `.env`とprocess.envを読み、environmentValidationSchemaで起動前に検証する。
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: environmentValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    // ConfigServiceのDB値を使い、EntityのRepositoryを全機能から利用可能にする。
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createTypeOrmOptions,
    }),
    // 機能ごとに閉じたModuleを読み込み、ルートModuleから利用できるようにする。
    AuthModule,
    CategoriesModule,
    HealthModule,
    ToolsModule,
    UsersModule,
  ],
})
export class AppModule {}
