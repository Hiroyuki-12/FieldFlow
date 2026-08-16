import { createPinia, setActivePinia } from 'pinia';
import { render, screen } from '@testing-library/vue';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '../stores/auth';
import HomeView from './HomeView.vue';

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('ログイン中ユーザーと権限を表示する', () => {
    const authStore = useAuthStore();
    authStore.applySession({
      accessToken: 'access-token',
      expiresIn: 900,
      user: {
        id: 'user-1',
        name: '山田 太郎',
        loginId: 'worker.one',
        role: 'WORKER',
        mustChangePassword: false,
      },
    });

    render(HomeView);

    expect(screen.getByRole('heading', { name: 'おはようございます、山田 太郎さん' })).toBeInTheDocument();
    expect(screen.getByText('作業者としてログインしています。')).toBeInTheDocument();
    expect(screen.getByText('認証済み')).toBeInTheDocument();
  });
});
