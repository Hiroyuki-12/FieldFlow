import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';

import type { AuthenticatedUser } from '../auth/auth.types';
import { hashPassword } from '../common/security/password-hashing';
import {
  RecordStatus,
  RefreshSession,
  User,
  UserRole,
} from '../database/entities';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { createTemporaryPassword } from './temporary-password';
import {
  toUserResponse,
  UserListResponse,
  UserResponse,
  UserWithTemporaryPasswordResponse,
} from './user.types';

/** ユーザー管理の検索、整合性保護、認証失効を担当する業務Service。 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: ListUsersQueryDto): Promise<UserListResponse> {
    const builder = this.userRepository.createQueryBuilder('user');
    if (query.search) {
      builder.andWhere(
        '(user.name LIKE :search OR user.loginId LIKE :search)',
        {
          search: `%${query.search}%`,
        },
      );
    }
    if (query.role) builder.andWhere('user.role = :role', { role: query.role });
    if (query.status) {
      builder.andWhere('user.status = :status', { status: query.status });
    }

    const [users, total] = await builder
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();

    return {
      items: users.map(toUserResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async create(dto: CreateUserDto): Promise<UserWithTemporaryPasswordResponse> {
    const temporaryPassword = createTemporaryPassword();
    const user = this.userRepository.create({
      id: randomUUID(),
      name: dto.name,
      loginId: dto.loginId,
      passwordHash: await hashPassword(temporaryPassword),
      role: dto.role,
      status: RecordStatus.ACTIVE,
      mustChangePassword: true,
      authVersion: 1,
      failedLoginCount: 0,
      lockedUntil: null,
    });

    try {
      const saved = await this.userRepository.save(user);
      return { ...toUserResponse(saved), temporaryPassword };
    } catch (error) {
      this.rethrowDuplicateLoginId(error);
    }
  }

  async findOne(id: string): Promise<UserResponse> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('ユーザーが見つかりません。');
    return toUserResponse(user);
  }

  async update(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserResponse> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const { target, activeAdmins } = await this.lockTargetAndAdmins(
          manager,
          id,
        );
        this.assertVersion(target, dto.version);
        if (currentUser.id === id && dto.role !== UserRole.ADMIN) {
          this.throwConflict(
            'USER_SELF_DEMOTION_FORBIDDEN',
            '自分自身を作業者へ変更できません。',
          );
        }
        if (
          target.role === UserRole.ADMIN &&
          target.status === RecordStatus.ACTIVE &&
          dto.role !== UserRole.ADMIN &&
          activeAdmins.length === 1
        ) {
          this.throwConflict(
            'LAST_ACTIVE_ADMIN_REQUIRED',
            '最後の有効な管理者は作業者へ変更できません。',
          );
        }

        target.name = dto.name;
        target.loginId = dto.loginId;
        target.role = dto.role;
        // 通常Columnへ明示加算し、認証内部の保存と管理画面の競合世代を分離する。
        target.version += 1;
        return toUserResponse(await manager.getRepository(User).save(target));
      });
    } catch (error) {
      this.rethrowDuplicateLoginId(error);
    }
  }

  async updateStatus(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdateUserStatusDto,
  ): Promise<UserResponse> {
    return this.dataSource.transaction(async (manager) => {
      const { target, activeAdmins } = await this.lockTargetAndAdmins(
        manager,
        id,
      );
      this.assertVersion(target, dto.version);
      if (currentUser.id === id && dto.status === RecordStatus.INACTIVE) {
        this.throwConflict(
          'USER_SELF_DEACTIVATION_FORBIDDEN',
          '自分自身を利用停止にできません。',
        );
      }
      if (
        target.role === UserRole.ADMIN &&
        target.status === RecordStatus.ACTIVE &&
        dto.status === RecordStatus.INACTIVE &&
        activeAdmins.length === 1
      ) {
        this.throwConflict(
          'LAST_ACTIVE_ADMIN_REQUIRED',
          '最後の有効な管理者は利用停止にできません。',
        );
      }

      // 同じ状態への再送は更新日時・versionを不要に進めず、現在値をそのまま返す。
      if (target.status === dto.status) return toUserResponse(target);

      target.status = dto.status;
      if (dto.status === RecordStatus.INACTIVE) {
        // JWT内のauthVersionを古くし、Refreshも同時に失効して全端末を停止する。
        target.authVersion += 1;
        await this.revokeAllSessions(manager, target.id);
      }
      target.version += 1;
      return toUserResponse(await manager.getRepository(User).save(target));
    });
  }

  async reissueTemporaryPassword(
    id: string,
  ): Promise<UserWithTemporaryPasswordResponse> {
    const temporaryPassword = createTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    return this.dataSource.transaction(async (manager) => {
      const target = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :id', { id })
        .getOne();
      if (!target) throw new NotFoundException('ユーザーが見つかりません。');

      target.passwordHash = passwordHash;
      target.mustChangePassword = true;
      target.authVersion += 1;
      // 再発行は管理画面にもmustChangePasswordの変化を返すため、管理用versionを進める。
      target.version += 1;
      target.failedLoginCount = 0;
      target.lockedUntil = null;
      await this.revokeAllSessions(manager, target.id);
      const saved = await manager.getRepository(User).save(target);
      return { ...toUserResponse(saved), temporaryPassword };
    });
  }

  private async lockTargetAndAdmins(
    manager: EntityManager,
    id: string,
  ): Promise<{ target: User; activeAdmins: User[] }> {
    // 全有効管理者を同じ順序でロックし、相互降格の競合でも0人になることを防ぐ。
    const activeAdmins = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .setLock('pessimistic_write')
      .where('user.role = :role AND user.status = :status', {
        role: UserRole.ADMIN,
        status: RecordStatus.ACTIVE,
      })
      .orderBy('user.id', 'ASC')
      .getMany();
    const lockedAdmin = activeAdmins.find((user) => user.id === id);
    if (lockedAdmin) return { target: lockedAdmin, activeAdmins };

    const target = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .setLock('pessimistic_write')
      .where('user.id = :id', { id })
      .getOne();
    if (!target) throw new NotFoundException('ユーザーが見つかりません。');
    return { target, activeAdmins };
  }

  private assertVersion(user: User, version: number): void {
    if (user.version !== version) {
      this.throwConflict(
        'USER_UPDATE_CONFLICT',
        '他の管理者が先に更新しました。最新の状態を確認してください。',
      );
    }
  }

  private async revokeAllSessions(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    await manager
      .getRepository(RefreshSession)
      .createQueryBuilder()
      .update(RefreshSession)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();
  }

  private rethrowDuplicateLoginId(error: unknown): never {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === 'ER_DUP_ENTRY'
    ) {
      this.throwConflict(
        'USER_LOGIN_ID_DUPLICATED',
        '同じログインIDのユーザーが既に存在します。',
      );
    }
    throw error;
  }

  private throwConflict(code: string, message: string): never {
    throw new ConflictException({ statusCode: 409, code, message });
  }
}
