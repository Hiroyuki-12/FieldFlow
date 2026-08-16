import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Category, Tool } from '../database/entities';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

/** 道具管理のController、Service、Repositoryをまとめる機能Module。 */
@Module({
  imports: [TypeOrmModule.forFeature([Tool, Category])],
  controllers: [ToolsController],
  providers: [ToolsService],
})
export class ToolsModule {}
