import { InitialSchema1786000000000 } from './1786000000000-initial-schema.migration';

/**
 * CLI・結合テスト・将来の本番Migrationタスクで共有するMigration一覧。
 * 新しいDB変更は既存Migrationを書き換えず、新しいMigrationクラスを追加してここへ登録する。
 * 適用済み環境でも変更履歴と実行順序を同じに保つため。
 */
export const DATABASE_MIGRATIONS = [InitialSchema1786000000000];

export { InitialSchema1786000000000 };
