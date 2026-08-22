import { createPinia } from 'pinia';
import { fireEvent, render, screen } from '@testing-library/vue';
import { createMemoryHistory } from 'vue-router';
import { describe, expect, it } from 'vitest';

import { createAppRouter } from '../router';
import { useAuthStore } from '../stores/auth';
import PasswordChangeView from './PasswordChangeView.vue';

describe('PasswordChangeView', () => {
  it('新しいパスワードの確認不一致をAPI送信前に表示する', async () => {
    const pinia = createPinia();
    const authStore = useAuthStore(pinia);
    authStore.applySession({
      accessToken: 'access-token',
      expiresIn: 900,
      user: {
        id: 'user-1',
        name: '利用 太郎',
        loginId: 'user.one',
        role: 'WORKER',
        mustChangePassword: false,
      },
    });
    const router = createAppRouter(pinia, createMemoryHistory());
    await router.push('/password');

    render(PasswordChangeView, { global: { plugins: [pinia, router] } });
    await fireEvent.update(screen.getByLabelText('現在のパスワード'), 'current-password');
    await fireEvent.update(screen.getByLabelText('新しいパスワード'), 'new-password-123');
    await fireEvent.update(screen.getByLabelText('新しいパスワード（確認）'), 'different-pass');
    await fireEvent.click(screen.getByRole('button', { name: '変更して再ログイン' }));

    expect(screen.getByText('新しいパスワードと確認入力が一致していません。')).toBeInTheDocument();
    expect(screen.getByLabelText('新しいパスワード')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'password-error');
  });
});
