import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../test/server';
import {
  createUser,
  listUsers,
  reissueTemporaryPassword,
  updateUser,
  updateUserStatus,
} from './users';

describe('ユーザーAPI', () => {
  it('空の絞り込みを除外し、ページ条件だけをQueryへ送る', async () => {
    server.use(
      http.get('*/api/v1/users', ({ request }) => {
        const url = new URL(request.url);
        expect(Object.fromEntries(url.searchParams)).toEqual({
          page: '2',
          pageSize: '20',
        });
        return HttpResponse.json({
          items: [],
          page: 2,
          pageSize: 20,
          total: 0,
        });
      }),
    );

    await expect(
      listUsers({ search: '', role: '', status: '', page: 2, pageSize: 20 }),
    ).resolves.toMatchObject({ page: 2, total: 0 });
  });

  it('作成入力だけをPOSTし、仮パスワード付き結果を受け取る', async () => {
    server.use(
      http.post('*/api/v1/users', async ({ request }) => {
        expect(await request.json()).toEqual({
          name: '新しい利用者',
          loginId: 'new.user',
          role: 'WORKER',
        });
        return HttpResponse.json(
          { id: 'user-2', temporaryPassword: 'TempPass23456789' },
          { status: 201 },
        );
      }),
    );

    await expect(
      createUser({ name: '新しい利用者', loginId: 'new.user', role: 'WORKER' }),
    ).resolves.toMatchObject({ temporaryPassword: 'TempPass23456789' });
  });

  it('状態変更で対象versionを送る', async () => {
    server.use(
      http.patch('*/api/v1/users/user-2/status', async ({ request }) => {
        expect(await request.json()).toEqual({
          status: 'INACTIVE',
          version: 4,
        });
        return HttpResponse.json({
          id: 'user-2',
          status: 'INACTIVE',
          version: 5,
        });
      }),
    );

    await expect(
      updateUserStatus({ id: 'user-2', version: 4 }, 'INACTIVE'),
    ).resolves.toMatchObject({ status: 'INACTIVE', version: 5 });
  });

  it('編集内容とversionをPATCHへ送り、更新後の世代を受け取る', async () => {
    server.use(
      http.patch('*/api/v1/users/user-2', async ({ request }) => {
        expect(await request.json()).toEqual({
          name: '更新後',
          loginId: 'updated.user',
          role: 'ADMIN',
          version: 2,
        });
        return HttpResponse.json({ id: 'user-2', name: '更新後', version: 3 });
      }),
    );

    await expect(
      updateUser('user-2', {
        name: '更新後',
        loginId: 'updated.user',
        role: 'ADMIN',
        version: 2,
      }),
    ).resolves.toMatchObject({ name: '更新後', version: 3 });
  });

  it('仮パスワード再発行を専用URLへPOSTする', async () => {
    server.use(
      http.post('*/api/v1/users/user-2/temporary-password', () =>
        HttpResponse.json({
          id: 'user-2',
          version: 3,
          temporaryPassword: 'NextPass2345678',
        }),
      ),
    );

    await expect(reissueTemporaryPassword('user-2')).resolves.toMatchObject({
      version: 3,
      temporaryPassword: 'NextPass2345678',
    });
  });
});
