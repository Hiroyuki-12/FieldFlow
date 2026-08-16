import { createPinia } from 'pinia';
import { fireEvent, render, screen } from '@testing-library/vue';
import { http, HttpResponse } from 'msw';
import { createMemoryHistory } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';

import { createAppRouter } from '../router';
import { server } from '../test/server';
import LoginView from './LoginView.vue';

describe('LoginView', () => {
  it('短い入力はAPIへ送らず入力案内を表示する', async () => {
    const pinia = createPinia();
    const router = createAppRouter(pinia, createMemoryHistory());
    await router.push('/login');

    render(LoginView, { global: { plugins: [pinia, router] } });
    await fireEvent.update(screen.getByLabelText('ログインID'), 'abc');
    await fireEvent.update(screen.getByLabelText('パスワード'), 'short');
    await fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(
      screen.getByText('ログインIDと12文字以上のパスワードを入力してください。'),
    ).toBeInTheDocument();
  });

  it('初回ユーザーはLogin成功後に初回パスワード変更へ進む', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({
          accessToken: 'access-token',
          expiresIn: 900,
          user: {
            id: 'first-1',
            name: '初回 利用者',
            loginId: 'first.user',
            role: 'WORKER',
            mustChangePassword: true,
          },
        }),
      ),
    );
    const pinia = createPinia();
    const router = createAppRouter(pinia, createMemoryHistory());
    await router.push('/login');

    render(LoginView, { global: { plugins: [pinia, router] } });
    await fireEvent.update(screen.getByLabelText('ログインID'), 'first.user');
    await fireEvent.update(screen.getByLabelText('パスワード'), 'temporary-pass');
    await fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('initial-password-change'));
  });

  it('認証失敗の理由を項目別に漏らさず共通エラーを表示する', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () => new HttpResponse(null, { status: 401 })),
    );
    const pinia = createPinia();
    const router = createAppRouter(pinia, createMemoryHistory());
    await router.push('/login');

    render(LoginView, { global: { plugins: [pinia, router] } });
    await fireEvent.update(screen.getByLabelText('ログインID'), 'valid.user');
    await fireEvent.update(screen.getByLabelText('パスワード'), 'wrong-password');
    await fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(
      await screen.findByText('ログインIDまたはパスワードが正しくありません。'),
    ).toBeInTheDocument();
  });
});
