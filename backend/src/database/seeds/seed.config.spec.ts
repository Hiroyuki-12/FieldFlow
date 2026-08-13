import { readInitialAdminSeedConfig } from './seed.config';

describe('readInitialAdminSeedConfig', () => {
  it('名前をtrimし、ログインIDを小文字へ正規化する', () => {
    // 表記揺れをSeed入口で統一し、DBの一意制約とログイン時の照合条件を一致させる。
    const config = readInitialAdminSeedConfig({
      INITIAL_ADMIN_NAME: '  FieldFlow管理者  ',
      INITIAL_ADMIN_LOGIN_ID: 'Admin.User',
      INITIAL_ADMIN_PASSWORD: '安全な初期パスワード 123',
    });

    expect(config).toEqual({
      name: 'FieldFlow管理者',
      loginId: 'admin.user',
      password: '安全な初期パスワード 123',
    });
  });

  it('短すぎる初期パスワードを拒否する', () => {
    // 弱い初期認証情報がDBへ作成される前に、環境変数の検証段階で停止させる。
    expect(() =>
      readInitialAdminSeedConfig({
        INITIAL_ADMIN_NAME: '管理者',
        INITIAL_ADMIN_LOGIN_ID: 'admin',
        INITIAL_ADMIN_PASSWORD: 'short',
      }),
    ).toThrow('INITIAL_ADMIN_PASSWORD');
  });
});
