import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { environmentValidationSchema } from './config/environment.schema';
import { createTypeOrmOptions } from './database/typeorm.config';
import { HealthModule } from './health/health.module';

/** アプリ全体で共有する設定、DB接続、機能Moduleを組み立てる。 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: environmentValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createTypeOrmOptions,
    }),
    HealthModule,
  ],
})
export class AppModule {}
