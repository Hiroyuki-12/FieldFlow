import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/entities';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  UserListResponse,
  UserResponse,
  UserWithTemporaryPasswordResponse,
} from './user.types';
import { UsersService } from './users.service';

/** `/api/v1/users`のHTTP入口。全操作をADMINだけへ公開する。 */
@ApiTags('users')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'ユーザーを検索・一覧取得する' })
  findAll(@Query() query: ListUsersQueryDto): Promise<UserListResponse> {
    return this.usersService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'ユーザーを作成して仮パスワードを発行する' })
  create(
    @Body() dto: CreateUserDto,
  ): Promise<UserWithTemporaryPasswordResponse> {
    return this.usersService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ユーザー詳細を取得する' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<UserResponse> {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ユーザーの名前・ログインID・Roleを更新する' })
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponse> {
    return this.usersService.update(currentUser, id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'ユーザーを利用停止または再有効化する' })
  updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserResponse> {
    return this.usersService.updateStatus(currentUser, id, dto);
  }

  @Post(':id/temporary-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '仮パスワードを再発行する' })
  reissueTemporaryPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<UserWithTemporaryPasswordResponse> {
    return this.usersService.reissueTemporaryPassword(id);
  }
}
