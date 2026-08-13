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
  // パスワード保存用途に適したArgon2idを明示し、ライブラリの既定値変更へ依存しない。
  type: argon2id,
  // OWASP推奨構成を基準に、メモリ・反復回数・並列数を固定して環境差を防ぐ。
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
 *
 * Migrationは「構造」、Seedは「アプリ開始に最低限必要なデータ」を担当する。
 * 途中で失敗した場合はカテゴリと管理者をまとめてrollbackし、片方だけ作られた状態を残さない。
 */
export async function runInitialSeed(
  dataSource: DataSource,
  config: InitialAdminSeedConfig,
): Promise<InitialSeedResult> {
  return dataSource.transaction(async (manager) => {
    // TransactionのmanagerからRepositoryを取得し、以下の全操作を同じTransactionへ参加させる。
    const categoryRepository = manager.getRepository(Category);
    const userRepository = manager.getRepository(User);

    // Seedを何度実行してもCOMMONカテゴリが増えないよう、作成前に種別で確認する。
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

    // ログイン時と同じ正規化をSeedでも行い、大文字小文字違いの重複を作らない。
    const normalizedLoginId = config.loginId.trim().toLowerCase();
    const existingAdmin = await userRepository.findOne({
      where: { loginId: normalizedLoginId },
    });

    if (existingAdmin && existingAdmin.role !== UserRole.ADMIN) {
      // 同じIDの一般ユーザーを管理者へ自動昇格させると権限事故になるため、安全側で停止する。
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

    // CLIと結合テストが、今回新規作成したか再実行だったかを秘密値なしで確認できる。
    return { commonCategoryCreated, initialAdminCreated };
  });
}
