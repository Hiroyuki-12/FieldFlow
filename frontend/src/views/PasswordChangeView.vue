<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { ApiError } from '../api/errors';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const currentPassword = ref('');
const newPassword = ref('');
const confirmation = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);
const currentPasswordVisible = ref(false);
const newPasswordVisible = ref(false);
const confirmationVisible = ref(false);
const isInitial = computed(() => route.name === 'initial-password-change');
const currentPasswordLabel = computed(() =>
  isInitial.value ? '現在の仮パスワード' : '現在のパスワード',
);
const passwordReuseWarning = computed(() =>
  isInitial.value
    ? '仮パスワードと同じパスワードは設定できません。異なるパスワードを入力してください。'
    : '現在のパスワードと同じパスワードは設定できません。異なるパスワードを入力してください。',
);

async function handleSubmit(): Promise<void> {
  if (isSubmitting.value) return;

  errorMessage.value = '';
  if (currentPassword.value.length < 12 || newPassword.value.length < 12) {
    errorMessage.value =
      '現在のパスワードと新しいパスワードは12文字以上で入力してください。';
    return;
  }
  if (currentPassword.value === newPassword.value) {
    errorMessage.value = passwordReuseWarning.value;
    return;
  }
  if (newPassword.value !== confirmation.value) {
    errorMessage.value = '新しいパスワードと確認入力が一致していません。';
    return;
  }

  isSubmitting.value = true;
  try {
    await authStore.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    });
    await router.replace({ name: 'login', query: { passwordChanged: 'true' } });
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError && error.code === 'PASSWORD_UNCHANGED'
        ? passwordReuseWarning.value
        : error instanceof ApiError && error.status === 401
          ? '現在のパスワードを確認できませんでした。'
          : error instanceof ApiError
            ? error.message
            : 'パスワードを変更できませんでした。';
  } finally {
    isSubmitting.value = false;
  }
}

async function backToLogin(): Promise<void> {
  try {
    await authStore.logout();
  } catch {
    // 画面側の認証情報はStoreで必ず破棄されるため、Login画面への退避を優先する。
  }
  await router.replace({ name: 'login' });
}
</script>

<template>
  <div
    :class="
      isInitial
        ? 'grid min-h-screen place-items-center bg-[#f5f2ea] px-5 py-10'
        : ''
    "
  >
    <section
      class="mx-auto w-full max-w-xl rounded-3xl border border-[#cfdbd5] bg-[#fffdf8] p-6 shadow-sm sm:p-9"
      :aria-labelledby="isInitial ? 'initial-password-title' : 'password-title'"
    >
      <div v-if="isInitial" class="flex items-center gap-3 font-black">
        <span
          class="grid size-9 -rotate-3 place-items-center rounded-xl rounded-br-sm bg-[#e87934] text-white"
          aria-hidden="true"
          >F</span
        >
        <span class="text-xl">FieldFlow</span>
      </div>

      <p class="mt-6 text-xs font-black tracking-[0.16em] text-[#0b6b62]">
        {{ isInitial ? 'FIRST SIGN IN' : 'ACCOUNT SECURITY' }}
      </p>
      <h1
        :id="isInitial ? 'initial-password-title' : 'password-title'"
        class="mt-2 text-3xl font-black tracking-tight"
        data-page-heading
        tabindex="-1"
      >
        {{ isInitial ? '初回パスワード変更' : 'パスワード変更' }}
      </h1>
      <p class="mt-3 leading-7 text-[#49666a]">
        {{
          isInitial
            ? '仮パスワードから、自分だけが知っているパスワードへ変更してください。'
            : '本人確認のため、現在のパスワードも入力してください。'
        }}
      </p>

      <div
        class="mt-5 rounded-xl border border-[#c5ddeb] bg-[#e0eef6] p-4 text-sm leading-6 text-[#28566f]"
      >
        変更後はすべての端末のTokenを無効化し、新しいパスワードでの再ログインが必要です。
      </div>

      <div
        id="password-reuse-warning"
        class="mt-4 rounded-xl border border-[#edc98b] bg-[#fff3d6] p-4 text-sm font-bold leading-6 text-[#79520b]"
        role="note"
      >
        {{ passwordReuseWarning }}
      </div>

      <form class="mt-7 space-y-5" novalidate @submit.prevent="handleSubmit">
        <!-- Password Managerが変更対象アカウントを特定できるよう、Session内のloginIdもFormへ関連付ける。 -->
        <div class="sr-only" aria-hidden="true">
          <label for="password-change-username">ログインID</label>
          <input
            id="password-change-username"
            :value="authStore.user?.loginId ?? ''"
            name="username"
            autocomplete="username"
            readonly
            tabindex="-1"
          />
        </div>
        <div>
          <label for="current-password" class="mb-2 block text-sm font-bold">
            {{ currentPasswordLabel }}
          </label>
          <div class="relative">
            <input
              id="current-password"
              v-model="currentPassword"
              name="current-password"
              :type="currentPasswordVisible ? 'text' : 'password'"
              autocomplete="current-password"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              class="min-h-12 w-full rounded-xl border border-[#b9cbc4] bg-white px-4 pr-20 outline-none focus:border-[#0b6b62] focus:ring-4 focus:ring-[#0b6b62]/15"
              :disabled="isSubmitting"
              :aria-invalid="Boolean(errorMessage)"
              aria-describedby="password-reuse-warning password-error"
              autofocus
            />
            <button
              type="button"
              class="absolute inset-y-1.5 right-2 min-w-14 rounded-lg px-2 text-sm font-bold text-[#0b6b62] hover:bg-[#e8eee9] focus:outline-none focus:ring-2 focus:ring-[#0b6b62]"
              :disabled="isSubmitting"
              :aria-label="`${currentPasswordLabel}を${currentPasswordVisible ? '隠す' : '表示'}`"
              :aria-pressed="currentPasswordVisible"
              @click="currentPasswordVisible = !currentPasswordVisible"
            >
              {{ currentPasswordVisible ? '隠す' : '表示' }}
            </button>
          </div>
        </div>
        <div>
          <label for="new-password" class="mb-2 block text-sm font-bold"
            >新しいパスワード</label
          >
          <div class="relative">
            <input
              id="new-password"
              v-model="newPassword"
              name="new-password"
              :type="newPasswordVisible ? 'text' : 'password'"
              autocomplete="new-password"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              class="min-h-12 w-full rounded-xl border border-[#b9cbc4] bg-white px-4 pr-20 outline-none focus:border-[#0b6b62] focus:ring-4 focus:ring-[#0b6b62]/15"
              placeholder="12文字以上"
              :disabled="isSubmitting"
              :aria-invalid="Boolean(errorMessage)"
              aria-describedby="password-reuse-warning password-error"
            />
            <button
              type="button"
              class="absolute inset-y-1.5 right-2 min-w-14 rounded-lg px-2 text-sm font-bold text-[#0b6b62] hover:bg-[#e8eee9] focus:outline-none focus:ring-2 focus:ring-[#0b6b62]"
              :disabled="isSubmitting"
              :aria-label="`新しいパスワードを${newPasswordVisible ? '隠す' : '表示'}`"
              :aria-pressed="newPasswordVisible"
              @click="newPasswordVisible = !newPasswordVisible"
            >
              {{ newPasswordVisible ? '隠す' : '表示' }}
            </button>
          </div>
        </div>
        <div>
          <label
            for="password-confirmation"
            class="mb-2 block text-sm font-bold"
            >新しいパスワード（確認）</label
          >
          <div class="relative">
            <input
              id="password-confirmation"
              v-model="confirmation"
              name="new-password-confirmation"
              :type="confirmationVisible ? 'text' : 'password'"
              autocomplete="new-password"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              class="min-h-12 w-full rounded-xl border border-[#b9cbc4] bg-white px-4 pr-20 outline-none focus:border-[#0b6b62] focus:ring-4 focus:ring-[#0b6b62]/15"
              :disabled="isSubmitting"
              :aria-invalid="Boolean(errorMessage)"
              aria-describedby="password-reuse-warning password-error"
            />
            <button
              type="button"
              class="absolute inset-y-1.5 right-2 min-w-14 rounded-lg px-2 text-sm font-bold text-[#0b6b62] hover:bg-[#e8eee9] focus:outline-none focus:ring-2 focus:ring-[#0b6b62]"
              :disabled="isSubmitting"
              :aria-label="`新しいパスワード（確認）を${confirmationVisible ? '隠す' : '表示'}`"
              :aria-pressed="confirmationVisible"
              @click="confirmationVisible = !confirmationVisible"
            >
              {{ confirmationVisible ? '隠す' : '表示' }}
            </button>
          </div>
        </div>

        <p
          id="password-error"
          class="min-h-6 text-sm font-bold text-[#b33b35]"
          :role="errorMessage ? 'alert' : undefined"
          aria-live="assertive"
        >
          {{ errorMessage }}
        </p>

        <button
          type="submit"
          class="min-h-12 w-full rounded-xl bg-[#0b6b62] px-5 font-black text-white hover:bg-[#074d47] disabled:opacity-60"
          :disabled="isSubmitting"
        >
          {{ isSubmitting ? '変更中…' : '変更して再ログイン' }}
        </button>
        <button
          v-if="isInitial"
          type="button"
          class="min-h-12 w-full rounded-xl border border-[#b9cbc4] bg-white px-5 font-bold hover:bg-[#e8eee9]"
          :disabled="isSubmitting"
          @click="backToLogin"
        >
          ログインへ戻る
        </button>
      </form>
    </section>
  </div>
</template>
