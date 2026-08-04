import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/** 環境変数からTypeORMの接続設定を作る。 */
export function createTypeOrmOptions(configService: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'mysql',
    host: configService.getOrThrow<string>('DB_HOST'),
    port: configService.getOrThrow<number>('DB_PORT'),
    username: configService.getOrThrow<string>('DB_USER'),
    password: configService.getOrThrow<string>('DB_PASSWORD'),
    database: configService.getOrThrow<string>('DB_NAME'),
    charset: 'utf8mb4',
    timezone: 'Z',
    autoLoadEntities: true,
    // DB差分を自動反映すると意図しない列削除が起こり得るため、全環境でMigrationだけを使う。
    synchronize: false,
    migrationsRun: false,
  };
}
