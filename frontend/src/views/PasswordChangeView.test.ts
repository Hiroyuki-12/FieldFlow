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
    await fireEvent.update(
      screen.getByLabelText('現在のパスワード'),
      'current-password',
    );
    await fireEvent.update(
      screen.getByLabelText('新しいパスワード'),
      'new-password-123',
    );
    await fireEvent.update(
      screen.getByLabelText('新しいパスワード（確認）'),
      'different-pass',
    );
    await fireEvent.click(
      screen.getByRole('button', { name: '変更して再ログイン' }),
    );

    expect(
      screen.getByText('新しいパスワードと確認入力が一致していません。'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('新しいパスワード')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'password-error');
  });

  it('現在と同じパスワードを警告してAPI送信前に拒否する', async () => {
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
        mustChangePassword: true,
      },
    });
    const router = createAppRouter(pinia, createMemoryHistory());
    await router.push('/change-password/initial');

    render(PasswordChangeView, { global: { plugins: [pinia, router] } });
    expect(screen.getByRole('note')).toHaveTextContent(
      '仮パスワードと同じパスワードは設定できません。',
    );

    const password = 'temporary-password';
    await fireEvent.update(
      screen.getByLabelText('現在の仮パスワード'),
      password,
    );
    await fireEvent.update(screen.getByLabelText('新しいパスワード'), password);
    await fireEvent.update(
      screen.getByLabelText('新しいパスワード（確認）'),
      password,
    );
    await fireEvent.click(
      screen.getByRole('button', { name: '変更して再ログイン' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      '仮パスワードと同じパスワードは設定できません。',
    );
    expect(authStore.isAuthenticated).toBe(true);
  });

  it('Password Manager向け属性を設定し、3項目を個別に表示・非表示にできる', async () => {
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

    const { container } = render(PasswordChangeView, {
      global: { plugins: [pinia, router] },
    });
    const username = container.querySelector<HTMLInputElement>(
      'input[name="username"]',
    );
    const current = screen.getByLabelText('現在のパスワード');
    const next = screen.getByLabelText('新しいパスワード');
    const confirmation = screen.getByLabelText('新しいパスワード（確認）');

    expect(username).toHaveValue('user.one');
    expect(username).toHaveAttribute('autocomplete', 'username');
    expect(current).toHaveAttribute('name', 'current-password');
    expect(current).toHaveAttribute('autocomplete', 'current-password');
    expect(next).toHaveAttribute('name', 'new-password');
    expect(next).toHaveAttribute('autocomplete', 'new-password');
    expect(confirmation).toHaveAttribute('name', 'new-password-confirmation');
    expect(confirmation).toHaveAttribute('autocomplete', 'new-password');

    await fireEvent.click(
      screen.getByRole('button', { name: '現在のパスワードを表示' }),
    );
    await fireEvent.click(
      screen.getByRole('button', { name: '新しいパスワードを表示' }),
    );
    await fireEvent.click(
      screen.getByRole('button', { name: '新しいパスワード（確認）を表示' }),
    );
    expect(current).toHaveAttribute('type', 'text');
    expect(next).toHaveAttribute('type', 'text');
    expect(confirmation).toHaveAttribute('type', 'text');

    await fireEvent.click(
      screen.getByRole('button', { name: '現在のパスワードを隠す' }),
    );
    expect(current).toHaveAttribute('type', 'password');
  });
});
