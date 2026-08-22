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
const isInitial = computed(() => route.name === 'initial-password-change');

async function handleSubmit(): Promise<void> {
  if (isSubmitting.value) return;

  errorMessage.value = '';
  if (currentPassword.value.length < 12 || newPassword.value.length < 12) {
    errorMessage.value = '現在のパスワードと新しいパスワードは12文字以上で入力してください。';
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
      error instanceof ApiError && error.status === 401
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
  <div :class="isInitial ? 'grid min-h-screen place-items-center bg-[#f5f2ea] px-5 py-10' : ''">
    <section
      class="mx-auto w-full max-w-xl rounded-3xl border border-[#cfdbd5] bg-[#fffdf8] p-6 shadow-sm sm:p-9"
      :aria-labelledby="isInitial ? 'initial-password-title' : 'password-title'"
    >
      <div v-if="isInitial" class="flex items-center gap-3 font-black">
        <span class="grid size-9 -rotate-3 place-items-center rounded-xl rounded-br-sm bg-[#e87934] text-white" aria-hidden="true">F</span>
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
        {{ isInitial ? '仮パスワードから、自分だけが知っているパスワードへ変更してください。' : '本人確認のため、現在のパスワードも入力してください。' }}
      </p>

      <div class="mt-5 rounded-xl border border-[#c5ddeb] bg-[#e0eef6] p-4 text-sm leading-6 text-[#28566f]">
        変更後はすべての端末のTokenを無効化し、新しいパスワードでの再ログインが必要です。
      </div>

      <form class="mt-7 space-y-5" novalidate @submit.prevent="handleSubmit">
        <div>
          <label for="current-password" class="mb-2 block text-sm font-bold">
            {{ isInitial ? '現在の仮パスワード' : '現在のパスワード' }}
          </label>
          <input
            id="current-password"
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            class="min-h-12 w-full rounded-xl border border-[#b9cbc4] bg-white px-4 outline-none focus:border-[#0b6b62] focus:ring-4 focus:ring-[#0b6b62]/15"
            :disabled="isSubmitting"
            :aria-invalid="Boolean(errorMessage)"
            aria-describedby="password-error"
            autofocus
          />
        </div>
        <div>
          <label for="new-password" class="mb-2 block text-sm font-bold">新しいパスワード</label>
          <input
            id="new-password"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            class="min-h-12 w-full rounded-xl border border-[#b9cbc4] bg-white px-4 outline-none focus:border-[#0b6b62] focus:ring-4 focus:ring-[#0b6b62]/15"
            placeholder="12文字以上"
            :disabled="isSubmitting"
            :aria-invalid="Boolean(errorMessage)"
            aria-describedby="password-error"
          />
        </div>
        <div>
          <label for="password-confirmation" class="mb-2 block text-sm font-bold">新しいパスワード（確認）</label>
          <input
            id="password-confirmation"
            v-model="confirmation"
            type="password"
            autocomplete="new-password"
            class="min-h-12 w-full rounded-xl border border-[#b9cbc4] bg-white px-4 outline-none focus:border-[#0b6b62] focus:ring-4 focus:ring-[#0b6b62]/15"
            :disabled="isSubmitting"
            :aria-invalid="Boolean(errorMessage)"
            aria-describedby="password-error"
          />
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
