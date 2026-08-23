import { createPinia } from 'pinia';
import { fireEvent, render, screen } from '@testing-library/vue';
import { http, HttpResponse } from 'msw';
import { createMemoryHistory } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from '../router';
import { server } from '../test/server';
import LoginView from './LoginView.vue';

const validPassword = 'valid-password';

function loginResponse(mustChangePassword = false) {
  return {
    accessToken: 'access-token',
    expiresIn: 900,
    user: {
      id: 'user-1',
      name: '利用 太郎',
      loginId: 'valid.user',
      role: 'WORKER' as const,
      mustChangePassword,
    },
  };
}

async function renderLogin(path = '/login') {
  const pinia = createPinia();
  const router = createAppRouter(pinia, createMemoryHistory());
  await router.push(path);
  render(LoginView, { global: { plugins: [pinia, router] } });
  return { router };
}

async function submitCredentials(loginId: string, password: string) {
  await fireEvent.update(screen.getByLabelText('ログインID'), loginId);
  await fireEvent.update(screen.getByLabelText('パスワード'), password);
  await fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LoginView', () => {
  it('空欄送信では両項目を関連付けて案内し、最初のログインIDへフォーカスする', async () => {
    await renderLogin();

    // 項目別案内により、色を見分けられない利用者にも修正場所を伝える。
    await fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));

    const loginId = screen.getByLabelText('ログインID');
    const password = screen.getByLabelText('パスワード');
    expect(screen.getByText(/ログインIDは4〜50文字/)).toHaveAttribute(
      'id',
      'login-id-error',
    );
    expect(
      screen.getByText('パスワードは12文字以上で入力してください。'),
    ).toHaveAttribute('id', 'password-error');
    expect(loginId).toHaveAttribute('aria-describedby', 'login-id-error');
    expect(password).toHaveAttribute('aria-describedby', 'password-error');
    expect(loginId).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(loginId).toHaveFocus();
  });

  it('ログインIDだけが不正なら、その項目だけを無効としてフォーカスする', async () => {
    await renderLogin();
    await submitCredentials('abc', validPassword);

    const loginId = screen.getByLabelText('ログインID');
    const password = screen.getByLabelText('パスワード');
    expect(loginId).toHaveAttribute('aria-invalid', 'true');
    expect(password).not.toHaveAttribute('aria-invalid');
    expect(
      screen.queryByText('パスワードは12文字以上で入力してください。'),
    ).not.toBeInTheDocument();
    expect(loginId).toHaveFocus();
  });

  it('パスワードだけが不正なら、その項目だけを無効としてフォーカスする', async () => {
    await renderLogin();
    await submitCredentials('valid.user', 'short');

    const loginId = screen.getByLabelText('ログインID');
    const password = screen.getByLabelText('パスワード');
    expect(loginId).not.toHaveAttribute('aria-invalid');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveFocus();
  });

  it('入力を直し始めると、該当項目の古いエラーを同じ規則で解除する', async () => {
    await renderLogin();
    await fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));

    const loginId = screen.getByLabelText('ログインID');
    const password = screen.getByLabelText('パスワード');
    await fireEvent.update(loginId, 'v');
    expect(loginId).not.toHaveAttribute('aria-invalid');
    expect(password).toHaveAttribute('aria-invalid', 'true');

    await fireEvent.update(password, 'v');
    expect(password).not.toHaveAttribute('aria-invalid');
  });

  it('正しい入力は正規化したログインIDでAPIを呼び出す', async () => {
    let requestBody: unknown;
    server.use(
      http.post('*/api/v1/auth/login', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json(loginResponse());
      }),
    );
    const { router } = await renderLogin();

    await submitCredentials('  VALID.User  ', validPassword);

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('home'));
    expect(requestBody).toEqual({
      loginId: 'valid.user',
      password: validPassword,
    });
  });

  it('401はユーザーの存在を漏らさない共通案内にし、パスワードへフォーカスする', async () => {
    server.use(
      http.post(
        '*/api/v1/auth/login',
        () => new HttpResponse(null, { status: 401 }),
      ),
    );
    const consoleLog = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    await renderLogin();

    // 認証失敗の内訳を分けず、アカウント探索とパスワード漏洩の回帰を防ぐ。
    await submitCredentials('valid.user', 'wrong-password');

    expect(
      await screen.findByText('ログインIDまたはパスワードが正しくありません。'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/存在しません|パスワードだけ/),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('パスワード')).toHaveFocus();
    expect(screen.getByLabelText('パスワード')).toHaveAttribute(
      'aria-describedby',
      'password-error login-error',
    );
    expect(screen.getByLabelText('パスワード')).toHaveAttribute(
      'type',
      'password',
    );
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('429は既存のレート制限案内を維持する', async () => {
    server.use(
      http.post(
        '*/api/v1/auth/login',
        () => new HttpResponse(null, { status: 429 }),
      ),
    );
    await renderLogin();
    await submitCredentials('valid.user', validPassword);

    expect(
      await screen.findByText(
        '操作が続いたため一時的に制限されています。しばらく待ってからお試しください。',
      ),
    ).toBeInTheDocument();
  });

  it('利用者向け画面では技術用語を使わず、共用端末での行動を案内する', async () => {
    await renderLogin();

    expect(
      screen.queryByText(/Token|Access Token|Refresh Token/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('共用端末では、利用後に必ずログアウトしてください。'),
    ).toBeInTheDocument();
  });

  it('初回ユーザーはLogin成功後に初回パスワード変更へ進む', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json(loginResponse(true)),
      ),
    );
    const { router } = await renderLogin();

    await submitCredentials('valid.user', validPassword);

    await vi.waitFor(() =>
      expect(router.currentRoute.value.name).toBe('initial-password-change'),
    );
  });

  it('安全なredirectはログイン後の戻り先として維持する', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json(loginResponse()),
      ),
    );
    const { router } = await renderLogin('/login?redirect=/tools');

    await submitCredentials('valid.user', validPassword);

    await vi.waitFor(() =>
      expect(router.currentRoute.value.name).toBe('tools'),
    );
  });
});
