import { createTemporaryPassword } from './temporary-password';

describe('createTemporaryPassword', () => {
  it('推測困難な16文字を生成し、呼び出しごとに同じ値を使い回さない', () => {
    const passwords = new Set(
      Array.from({ length: 20 }, () => createTemporaryPassword()),
    );

    expect(passwords.size).toBe(20);
    for (const password of passwords) {
      expect(password).toHaveLength(16);
      expect(password).toMatch(/^[A-Za-z2-9._~-]+$/);
    }
  });
});
