import { randomUUID } from 'node:crypto';

import { argon2id, hash } from 'argon2';
import { DataSource } from 'typeorm';

import {
  Category,
  CategoryType,
  RecordStatus,
  User,
  UserRole,
} from '../entities';
import { InitialAdminSeedConfig } from './seed.config';

const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
} as const;

export interface InitialSeedResult {
  commonCategoryCreated: boolean;
  initialAdminCreated: boolean;
}

/**
 * COMMONカテゴリと初期管理者を1トランザクションで投入する。
 * 既存データを更新しないため、再実行しても利用中の管理者パスワードを巻き戻さない。
 */
export async function runInitialSeed(
  dataSource: DataSource,
  config: InitialAdminSeedConfig,
): Promise<InitialSeedResult> {
  return dataSource.transaction(async (manager) => {
    const categoryRepository = manager.getRepository(Category);
    const userRepository = manager.getRepository(User);

    const existingCommonCategory = await categoryRepository.findOne({
      where: { categoryType: CategoryType.COMMON },
    });

    let commonCategoryCreated = false;
    if (!existingCommonCategory) {
      await categoryRepository.save(
        categoryRepository.create({
          id: randomUUID(),
          name: '共通',
          displayOrder: 0,
          categoryType: CategoryType.COMMON,
          status: RecordStatus.ACTIVE,
        }),
      );
      commonCategoryCreated = true;
    }

    const normalizedLoginId = config.loginId.trim().toLowerCase();
    const existingAdmin = await userRepository.findOne({
      where: { loginId: normalizedLoginId },
    });

    if (existingAdmin && existingAdmin.role !== UserRole.ADMIN) {
      throw new Error(
        'The initial admin login ID is already used by a non-admin user',
      );
    }

    let initialAdminCreated = false;
    if (!existingAdmin) {
      // 平文はこの処理中だけ使用し、DBにはArgon2idハッシュだけを保存する。
      const passwordHash = await hash(config.password, ARGON2_OPTIONS);
      await userRepository.save(
        userRepository.create({
          id: randomUUID(),
          name: config.name.trim(),
          loginId: normalizedLoginId,
          passwordHash,
          role: UserRole.ADMIN,
          status: RecordStatus.ACTIVE,
          mustChangePassword: true,
          authVersion: 1,
          failedLoginCount: 0,
          lockedUntil: null,
        }),
      );
      initialAdminCreated = true;
    }

    return { commonCategoryCreated, initialAdminCreated };
  });
}
