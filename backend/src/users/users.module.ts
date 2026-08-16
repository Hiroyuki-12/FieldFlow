import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../database/entities';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/** ユーザー管理のController、Service、Repositoryをまとめる機能Module。 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
