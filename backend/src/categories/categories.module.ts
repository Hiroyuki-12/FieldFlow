import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Category, Tool } from '../database/entities';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

/** 作業カテゴリ管理のController、Service、Repositoryをまとめる機能Module。 */
@Module({
  imports: [TypeOrmModule.forFeature([Category, Tool])],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
