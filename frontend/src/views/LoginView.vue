<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { ApiError } from '../api/errors';
import { sanitizeInternalRedirect } from '../router';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const loginId = ref('');
const password = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);

const noticeMessage = computed(() => {
  if (route.query.passwordChanged === 'true') {
    return 'パスワードを変更しました。新しいパスワードでログインしてください。';
  }
  if (route.query.loggedOut === 'true') {
    return 'ログアウトしました。';
  }
  if (route.query.logoutIncomplete === 'true') {
    return '通信エラーによりサーバー側のログアウトを確認できませんでした。';
  }
  return '';
});

async function handleSubmit(): Promise<void> {
  if (isSubmitting.value) return;

  errorMessage.value = '';
  const normalizedLoginId = loginId.value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{4,50}$/.test(normalizedLoginId) || password.value.length < 12) {
    errorMessage.value = 'ログインIDと12文字以上のパスワードを入力してください。';
    return;
  }

  isSubmitting.value = true;
  try {
    const user = await authStore.login({ loginId: normalizedLoginId, password: password.value });
    if (user.mustChangePassword) {
      await router.replace({ name: 'initial-password-change' });
      return;
    }

    const redirect = sanitizeInternalRedirect(route.query.redirect);
    await router.replace(redirect ?? { name: 'home' });
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError && error.status === 429
        ? error.message
        : 'ログインIDまたはパスワードが正しくありません。';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <main id="main-content" class="grid min-h-screen bg-[#f5f2ea] lg:grid-cols-[1.15fr_0.85fr]">
    <section
      class="relative hidden overflow-hidden bg-[linear-gradient(135deg,rgba(4,48,44,.9),rgba(6,85,78,.97))] px-[clamp(3rem,7vw,7rem)] py-16 text-[#f8f5ee] lg:flex"
      aria-label="FieldFlowの紹介"
    >
      <div class="my-auto max-w-2xl">
        <p class="text-xs font-black tracking-[0.18em] text-[#f2a66f]">READY BEFORE THE FIELD</p>
        <h1 class="mt-5 max-w-[10em] text-6xl font-black leading-[1.08] tracking-[-0.05em] xl:text-7xl">
          忘れ物のない朝を、チームでつくる。
        </h1>
        <p class="mt-7 max-w-xl text-lg leading-8 text-white/75">
          現場へ出る前の道具と数量を、ひとつのチェック表で共有。FieldFlowは準備の抜け漏れを減らします。
        </p>
      </div>
      <div class="absolute -bottom-32 -right-24 size-96 rounded-full border-[72px] border-white/5" aria-hidden="true"></div>
    </section>

    <section class="grid min-h-screen place-items-center px-5 py-10 sm:px-8">
      <div class="w-full max-w-md rounded-3xl border border-[#cfdbd5] bg-[#fffdf8]/95 p-6 shadow-[0_18px_50px_rgb(16_42_46_/_16%)] sm:p-9">
        <div class="flex items-center gap-3 font-black tracking-tight">
          <span class="grid size-9 -rotate-3 place-items-center rounded-xl rounded-br-sm bg-[#e87934] text-white" aria-hidden="true">F</span>
          <span class="text-xl">FieldFlow</span>
        </div>

        <h1 class="mt-8 text-3xl font-black tracking-tight">ログイン</h1>
        <p class="mt-2 text-[#49666a]">今日の準備を始めましょう。</p>

        <p
          v-if="noticeMessage"
          class="mt-6 rounded-xl border border-[#b9ddce] bg-[#dff3e7] p-4 text-sm font-medium text-[#1d6240]"
          role="status"
        >
          {{ noticeMessage }}
        </p>

        <form class="mt-7 space-y-5" novalidate @submit.prevent="handleSubmit">
          <div>
            <label for="login-id" class="mb-2 block text-sm font-bold">ログインID</label>
            <input
              id="login-id"
              v-model="loginId"
              name="loginId"
              autocomplete="username"
              class="min-h-12 w-full rounded-xl border border-[#b9cbc4] bg-white px-4 outline-none transition focus:border-[#0b6b62] focus:ring-4 focus:ring-[#0b6b62]/15"
              placeholder="例: admin"
              :disabled="isSubmitting"
              aria-describedby="login-error"
            />
          </div>

          <div>
            <label for="password" class="mb-2 block text-sm font-bold">パスワード</label>
            <input
              id="password"
              v-model="password"
              name="password"
              type="password"
              autocomplete="current-password"
              class="min-h-12 w-full rounded-xl border border-[#b9cbc4] bg-white px-4 outline-none transition focus:border-[#0b6b62] focus:ring-4 focus:ring-[#0b6b62]/15"
              placeholder="12文字以上"
              :disabled="isSubmitting"
              aria-describedby="login-error"
            />
          </div>

          <p id="login-error" class="min-h-6 text-sm font-bold text-[#b33b35]" aria-live="polite">
            {{ errorMessage }}
          </p>

          <button
            type="submit"
            class="min-h-12 w-full rounded-xl bg-[#0b6b62] px-5 font-black text-white shadow-sm transition hover:bg-[#074d47] disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="isSubmitting"
          >
            {{ isSubmitting ? '確認中…' : 'ログイン' }}
          </button>
        </form>

        <p class="mt-6 text-center text-xs leading-5 text-[#6b8285]">
          パスワードやTokenは、この画面やブラウザの保存領域へ記録しません。
        </p>
      </div>
    </section>
  </main>
</template>
