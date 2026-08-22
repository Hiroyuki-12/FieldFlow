<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { ApiError } from '../api/errors';
import type { UserRole } from '../api/auth';
import {
  createUser,
  listUsers,
  type ManagedUser,
  reissueTemporaryPassword,
  updateUser,
  updateUserStatus,
  type UserStatus,
} from '../api/users';
import { useAuthStore } from '../stores/auth';
import { useModalDialog } from '../composables/useModalDialog';
import AppNotice from '../components/AppNotice.vue';

type DialogMode = 'create' | 'edit' | 'status' | 'reissue' | 'password' | null;

const authStore = useAuthStore();
const users = ref<ManagedUser[]>([]);
const search = ref('');
const role = ref<UserRole | ''>('');
const status = ref<UserStatus | ''>('');
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const isLoading = ref(false);
const isSaving = ref(false);
const notice = ref('');
const errorMessage = ref('');
const dialogMode = ref<DialogMode>(null);
const { dialog, openModal, closeModal, trapFocus } = useModalDialog();
const selectedUser = ref<ManagedUser | null>(null);
const form = ref({ name: '', loginId: '', role: 'WORKER' as UserRole });
const temporaryPassword = ref('');
const passwordCopied = ref(false);

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / pageSize)),
);
const dialogTitle = computed(() => {
  if (dialogMode.value === 'create') return 'ユーザーを作成';
  if (dialogMode.value === 'edit') return 'ユーザーを編集';
  if (dialogMode.value === 'status') {
    return selectedUser.value?.status === 'ACTIVE'
      ? '利用停止の確認'
      : '再有効化の確認';
  }
  if (dialogMode.value === 'reissue') return '仮パスワード再発行の確認';
  return '仮パスワードを発行しました';
});

watch(dialogMode, async (mode) => {
  if (mode) {
    await openModal('input, button, select');
  } else closeModal();
});

onMounted(loadUsers);

async function loadUsers(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await listUsers({
      search: search.value,
      role: role.value,
      status: status.value,
      page: page.value,
      pageSize,
    });
    users.value = response.items;
    total.value = response.total;
  } catch (error) {
    errorMessage.value = messageFor(error);
  } finally {
    isLoading.value = false;
  }
}

async function applyFilters(): Promise<void> {
  page.value = 1;
  await loadUsers();
}

async function movePage(nextPage: number): Promise<void> {
  page.value = nextPage;
  await loadUsers();
}

function openCreate(): void {
  errorMessage.value = '';
  selectedUser.value = null;
  form.value = { name: '', loginId: '', role: 'WORKER' };
  dialogMode.value = 'create';
}

function openEdit(user: ManagedUser): void {
  errorMessage.value = '';
  selectedUser.value = user;
  form.value = { name: user.name, loginId: user.loginId, role: user.role };
  dialogMode.value = 'edit';
}

function openAction(
  user: ManagedUser,
  mode: 'status' | 'reissue',
): void {
  errorMessage.value = '';
  selectedUser.value = user;
  dialogMode.value = mode;
}

function closeDialog(): void {
  if (isSaving.value) return;
  dialogMode.value = null;
  selectedUser.value = null;
  temporaryPassword.value = '';
  passwordCopied.value = false;
  errorMessage.value = '';
}

async function saveUser(): Promise<void> {
  const name = form.value.name.trim();
  const loginId = form.value.loginId.trim().toLowerCase();
  if (!name || !/^[a-z0-9._-]{4,50}$/.test(loginId)) {
    errorMessage.value =
      '名前と、4〜50文字の半角英数字・._-でログインIDを入力してください。';
    return;
  }

  isSaving.value = true;
  errorMessage.value = '';
  try {
    if (dialogMode.value === 'create') {
      const created = await createUser({
        name,
        loginId,
        role: form.value.role,
      });
      temporaryPassword.value = created.temporaryPassword;
      selectedUser.value = created;
      dialogMode.value = 'password';
      notice.value = `${created.name}さんを作成しました。`;
      await loadUsers();
    } else if (selectedUser.value) {
      const updated = await updateUser(selectedUser.value.id, {
        name,
        loginId,
        role: form.value.role,
        version: selectedUser.value.version,
      });
      notice.value = `${updated.name}さんを更新しました。`;
      dialogMode.value = null;
      await loadUsers();
    }
  } catch (error) {
    errorMessage.value = messageFor(error);
  } finally {
    isSaving.value = false;
  }
}

async function changeStatus(): Promise<void> {
  if (!selectedUser.value) return;
  isSaving.value = true;
  errorMessage.value = '';
  const nextStatus: UserStatus =
    selectedUser.value.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  try {
    const updated = await updateUserStatus(selectedUser.value, nextStatus);
    notice.value = `${updated.name}さんを${nextStatus === 'ACTIVE' ? '再有効化' : '利用停止'}しました。`;
    dialogMode.value = null;
    await loadUsers();
  } catch (error) {
    errorMessage.value = messageFor(error);
  } finally {
    isSaving.value = false;
  }
}

async function reissuePassword(): Promise<void> {
  if (!selectedUser.value) return;
  isSaving.value = true;
  errorMessage.value = '';
  try {
    const updated = await reissueTemporaryPassword(selectedUser.value.id);
    temporaryPassword.value = updated.temporaryPassword;
    selectedUser.value = updated;
    dialogMode.value = 'password';
    notice.value = `${updated.name}さんの仮パスワードを再発行しました。`;
    await loadUsers();
  } catch (error) {
    errorMessage.value = messageFor(error);
  } finally {
    isSaving.value = false;
  }
}

async function copyPassword(): Promise<void> {
  try {
    await navigator.clipboard.writeText(temporaryPassword.value);
    passwordCopied.value = true;
  } catch {
    errorMessage.value =
      'コピーできませんでした。仮パスワードを選択してコピーしてください。';
  }
}

function roleLabel(value: UserRole): string {
  return value === 'ADMIN' ? '管理者' : '作業者';
}

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError))
    return '処理を完了できませんでした。もう一度お試しください。';
  const messages: Record<string, string> = {
    USER_LOGIN_ID_DUPLICATED: '同じログインIDのユーザーが既に存在します。',
    USER_UPDATE_CONFLICT:
      '他の管理者が先に更新しました。一覧を再読み込みしてください。',
    USER_SELF_DEMOTION_FORBIDDEN: '自分自身を作業者へ変更できません。',
    USER_SELF_DEACTIVATION_FORBIDDEN: '自分自身を利用停止にできません。',
    LAST_ACTIVE_ADMIN_REQUIRED: '最後の有効な管理者は停止・降格できません。',
  };
  return (error.code && messages[error.code]) || error.message;
}
</script>

<template>
  <section>
    <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="mb-1 text-sm font-bold text-[#0b6b62]">管理機能</p>
        <h1 class="text-3xl font-black tracking-tight" data-page-heading tabindex="-1">
          ユーザー管理
        </h1>
        <p class="mt-2 text-sm text-[#49666a]">
          利用者の権限と利用状態を管理します。
        </p>
      </div>
      <button
        class="min-h-11 rounded-xl bg-[#e87934] px-5 py-3 font-bold text-white"
        type="button"
        @click="openCreate"
      >
        ユーザーを作成
      </button>
    </div>

    <AppNotice v-if="notice" class="mb-5" tone="success">
      {{ notice }}
    </AppNotice>
    <AppNotice v-if="errorMessage && !dialogMode" class="mb-5" tone="error">
      {{ errorMessage }}
    </AppNotice>

    <form
      class="mb-6 grid gap-3 rounded-2xl border border-[#cfdbd5] bg-white p-4 sm:grid-cols-4"
      @submit.prevent="applyFilters"
    >
      <label class="sm:col-span-2">
        <span class="mb-1 block text-sm font-bold">名前・ログインID</span>
        <input
          v-model="search"
          class="min-h-11 w-full rounded-xl border border-[#aebfba] px-3"
          type="search"
        />
      </label>
      <label>
        <span class="mb-1 block text-sm font-bold">権限</span>
        <select
          v-model="role"
          class="min-h-11 w-full rounded-xl border border-[#aebfba] px-3"
        >
          <option value="">すべて</option>
          <option value="ADMIN">管理者</option>
          <option value="WORKER">作業者</option>
        </select>
      </label>
      <label>
        <span class="mb-1 block text-sm font-bold">状態</span>
        <select
          v-model="status"
          class="min-h-11 w-full rounded-xl border border-[#aebfba] px-3"
        >
          <option value="">すべて</option>
          <option value="ACTIVE">利用中</option>
          <option value="INACTIVE">利用停止</option>
        </select>
      </label>
      <button
        class="min-h-11 rounded-xl bg-[#102a2e] px-4 font-bold text-white sm:col-start-4"
        type="submit"
        :disabled="isLoading"
      >
        検索
      </button>
    </form>

    <p v-if="isLoading" role="status">読み込み中…</p>
    <p
      v-else-if="users.length === 0"
      class="rounded-2xl bg-white p-8 text-center text-[#49666a]"
    >
      条件に一致するユーザーはいません。
    </p>

    <div v-else class="space-y-3 lg:hidden">
      <article
        v-for="user in users"
        :key="user.id"
        class="rounded-2xl border border-[#cfdbd5] bg-white p-4"
      >
        <div class="flex justify-between gap-3">
          <div>
            <h2 class="font-black">{{ user.name }}</h2>
            <p class="text-sm text-[#49666a]">{{ user.loginId }}</p>
          </div>
          <span class="text-sm font-bold">{{
            user.status === 'ACTIVE' ? '利用中' : '利用停止'
          }}</span>
        </div>
        <p class="mt-2 text-sm">
          {{ roleLabel(user.role)
          }}<span v-if="user.mustChangePassword">・初回変更待ち</span>
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            class="min-h-11 rounded-xl border px-3 font-bold"
            type="button"
            @click="openEdit(user)"
          >
            編集
          </button>
          <button
            v-if="user.id !== authStore.user?.id"
            class="min-h-11 rounded-xl border px-3 font-bold"
            type="button"
            @click="openAction(user, 'status')"
          >
            {{ user.status === 'ACTIVE' ? '利用停止' : '再有効化' }}
          </button>
          <button
            class="min-h-11 rounded-xl border px-3 font-bold"
            type="button"
            @click="openAction(user, 'reissue')"
          >
            仮パスワード再発行
          </button>
        </div>
      </article>
    </div>

    <div
      v-if="!isLoading && users.length"
      class="hidden overflow-x-auto rounded-2xl border border-[#cfdbd5] bg-white lg:block"
    >
      <table class="w-full text-left">
        <thead class="bg-[#e8eee9] text-sm">
          <tr>
            <th class="p-4">名前</th>
            <th class="p-4">ログインID</th>
            <th class="p-4">権限</th>
            <th class="p-4">状態</th>
            <th class="p-4">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in users"
            :key="user.id"
            class="border-t border-[#e1e8e4]"
          >
            <td class="p-4 font-bold">{{ user.name }}</td>
            <td class="p-4">{{ user.loginId }}</td>
            <td class="p-4">{{ roleLabel(user.role) }}</td>
            <td class="p-4">
              {{ user.status === 'ACTIVE' ? '利用中' : '利用停止'
              }}<small v-if="user.mustChangePassword" class="block"
                >初回変更待ち</small
              >
            </td>
            <td class="p-4">
              <div class="flex flex-wrap gap-2">
                <button
                  class="min-h-11 rounded-xl border px-3 font-bold"
                  type="button"
                  @click="openEdit(user)"
                >
                  編集</button
                ><button
                  v-if="user.id !== authStore.user?.id"
                  class="min-h-11 rounded-xl border px-3 font-bold"
                  type="button"
                  @click="openAction(user, 'status')"
                >
                  {{
                    user.status === 'ACTIVE' ? '利用停止' : '再有効化'
                  }}</button
                ><button
                  class="min-h-11 rounded-xl border px-3 font-bold"
                  type="button"
                  @click="openAction(user, 'reissue')"
                >
                  仮パスワード再発行
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav
      v-if="totalPages > 1"
      class="mt-6 flex items-center justify-center gap-4"
      aria-label="ページ移動"
    >
      <button
        class="min-h-11 rounded-xl border bg-white px-4"
        type="button"
        :disabled="page === 1"
        @click="movePage(page - 1)"
      >
        前へ</button
      ><span>{{ page }} / {{ totalPages }}</span
      ><button
        class="min-h-11 rounded-xl border bg-white px-4"
        type="button"
        :disabled="page === totalPages"
        @click="movePage(page + 1)"
      >
        次へ
      </button>
    </nav>

    <dialog
      ref="dialog"
      class="app-dialog w-[min(92vw,32rem)] rounded-2xl border-0 bg-white p-0 shadow-2xl"
      aria-labelledby="user-dialog-title"
      @cancel.prevent="closeDialog"
      @keydown="trapFocus"
    >
      <div class="max-h-[90dvh] overflow-y-auto p-6" @keydown.esc="closeDialog">
        <h2
          id="user-dialog-title"
          class="sticky top-0 z-10 -mx-6 -mt-6 border-b border-[#cfdbd5] bg-white px-6 py-5 text-xl font-black"
        >
          {{ dialogTitle }}
        </h2>
        <p
          v-if="errorMessage"
          id="user-dialog-error"
          class="mt-4 rounded-xl bg-[#fbe4e1] p-3 text-sm text-[#8d2f2b]"
          role="alert"
        >
          {{ errorMessage }}
        </p>
        <form
          v-if="dialogMode === 'create' || dialogMode === 'edit'"
          class="mt-5 space-y-4"
          @submit.prevent="saveUser"
        >
          <label class="block"
            ><span class="mb-1 block font-bold">名前</span
            ><input
              v-model="form.name"
              class="min-h-11 w-full rounded-xl border px-3"
              maxlength="100"
              required
              :aria-invalid="Boolean(errorMessage)"
              aria-describedby="user-dialog-error"
          /></label>
          <label class="block"
            ><span class="mb-1 block font-bold">ログインID</span
            ><input
              v-model="form.loginId"
              class="min-h-11 w-full rounded-xl border px-3"
              minlength="4"
              maxlength="50"
              pattern="[A-Za-z0-9._-]+"
              required
              :aria-invalid="Boolean(errorMessage)"
              aria-describedby="user-dialog-error"
          /></label>
          <label class="block"
            ><span class="mb-1 block font-bold">権限</span
            ><select
              v-model="form.role"
              class="min-h-11 w-full rounded-xl border px-3"
              :disabled="selectedUser?.id === authStore.user?.id"
              :aria-invalid="Boolean(errorMessage)"
              aria-describedby="user-dialog-error"
            >
              <option value="ADMIN">管理者</option>
              <option value="WORKER">作業者</option>
            </select></label
          >
          <div class="app-dialog-actions sticky bottom-0 -mx-6 -mb-6 border-t border-[#cfdbd5] bg-white px-6 py-4">
            <button
              class="min-h-11 rounded-xl border px-4"
              type="button"
              :disabled="isSaving"
              @click="closeDialog"
            >
              キャンセル</button
            ><button
              class="min-h-11 rounded-xl bg-[#e87934] px-5 font-bold text-white"
              type="submit"
              :disabled="isSaving"
            >
              {{ isSaving ? '保存中…' : '保存' }}
            </button>
          </div>
        </form>
        <div v-else-if="dialogMode === 'status'" class="mt-5">
          <p>
            {{ selectedUser?.name }}さんを{{
              selectedUser?.status === 'ACTIVE' ? '利用停止' : '再有効化'
            }}しますか？
          </p>
          <p
            v-if="selectedUser?.status === 'ACTIVE'"
            class="mt-2 text-sm text-[#8d2f2b]"
          >
            利用停止すると、すべての端末で操作できなくなり、再有効化するまでログインできません。過去の記録は削除されません。
          </p>
          <div class="app-dialog-actions sticky bottom-0 -mx-6 -mb-6 mt-6 border-t border-[#cfdbd5] bg-white px-6 py-4">
            <button
              class="min-h-11 rounded-xl border px-4"
              type="button"
              @click="closeDialog"
            >
              キャンセル</button
            ><button
              class="min-h-11 rounded-xl bg-[#b33b35] px-5 font-bold text-white"
              type="button"
              :disabled="isSaving"
              @click="changeStatus"
            >
              {{
                selectedUser?.status === 'ACTIVE'
                  ? '利用停止する'
                  : '再有効化する'
              }}
            </button>
          </div>
        </div>
        <div v-else-if="dialogMode === 'reissue'" class="mt-5">
          <p>{{ selectedUser?.name }}さんの仮パスワードを再発行しますか？</p>
          <p class="mt-2 text-sm text-[#8d2f2b]">
            現在のパスワードではログインできなくなり、すべての端末からログアウトされます。
          </p>
          <div class="app-dialog-actions sticky bottom-0 -mx-6 -mb-6 mt-6 border-t border-[#cfdbd5] bg-white px-6 py-4">
            <button
              class="min-h-11 rounded-xl border px-4"
              type="button"
              @click="closeDialog"
            >
              キャンセル</button
            ><button
              class="min-h-11 rounded-xl bg-[#b33b35] px-5 font-bold text-white"
              type="button"
              :disabled="isSaving"
              @click="reissuePassword"
            >
              再発行する
            </button>
          </div>
        </div>
        <div v-else-if="dialogMode === 'password'" class="mt-5">
          <p class="text-sm">仮パスワード</p>
          <div class="mt-2 flex gap-2">
            <code
              class="min-w-0 flex-1 select-all overflow-x-auto rounded-xl bg-[#e8eee9] p-3 text-base font-bold"
              >{{ temporaryPassword }}</code
            ><button
              class="min-h-11 rounded-xl border px-4 font-bold"
              type="button"
              @click="copyPassword"
            >
              コピー
            </button>
          </div>
          <p
            v-if="passwordCopied"
            class="mt-2 text-sm text-[#074d47]"
            role="status"
          >
            コピーしました。
          </p>
          <p class="mt-4 text-sm font-bold text-[#8d2f2b]">
            この画面を閉じると再表示できません。安全な方法で本人へ伝えてください。
          </p>
          <div class="app-dialog-actions sticky bottom-0 -mx-6 -mb-6 mt-6 border-t border-[#cfdbd5] bg-white px-6 py-4">
            <button
              class="min-h-11 rounded-xl bg-[#102a2e] px-5 font-bold text-white"
              type="button"
              @click="closeDialog"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </dialog>
  </section>
</template>
