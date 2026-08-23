<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { ApiError } from '../api/errors';
import { sanitizeInternalRedirect } from '../router';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const loginId = ref('');
const password = ref('');
const loginIdError = ref('');
const passwordError = ref('');
const authenticationError = ref('');
const isSubmitting = ref(false);
const loginIdInput = ref<HTMLInputElement | null>(null);
const passwordInput = ref<HTMLInputElement | null>(null);

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

/** 入力内容を直し始めたら、その項目と認証結果の古い案内を消して再送信に備える。 */
function clearLoginIdFeedback(): void {
  loginIdError.value = '';
  authenticationError.value = '';
}

function clearPasswordFeedback(): void {
  passwordError.value = '';
  authenticationError.value = '';
}

/** エラーをDOMへ反映してから移動し、キーボード利用者がTabで戻る手間をなくす。 */
async function focusInput(input: HTMLInputElement | null): Promise<void> {
  await nextTick();
  input?.focus({ preventScroll: true });
}

async function handleSubmit(): Promise<void> {
  if (isSubmitting.value) return;

  loginIdError.value = '';
  passwordError.value = '';
  authenticationError.value = '';
  const normalizedLoginId = loginId.value.trim().toLowerCase();

  // Browser標準文言では制約を項目別に説明できないため、novalidateと同じ規則で検証する。
  if (!/^[a-z0-9._-]{4,50}$/.test(normalizedLoginId)) {
    loginIdError.value =
      'ログインIDは4〜50文字の半角英数字と . _ - で入力してください。';
  }
  if (password.value.length < 12) {
    passwordError.value = 'パスワードは12文字以上で入力してください。';
  }

  if (loginIdError.value || passwordError.value) {
    await focusInput(
      loginIdError.value ? loginIdInput.value : passwordInput.value,
    );
    return;
  }

  isSubmitting.value = true;
  try {
    const user = await authStore.login({
      loginId: normalizedLoginId,
      password: password.value,
    });
    if (user.mustChangePassword) {
      await router.replace({ name: 'initial-password-change' });
      return;
    }

    const redirect = sanitizeInternalRedirect(route.query.redirect);
    await router.replace(redirect ?? { name: 'home' });
  } catch (error) {
    // 401の詳細を分けると登録済みIDを推測できるため、認証失敗は共通文言にする。
    authenticationError.value =
      error instanceof ApiError && error.status === 429
        ? error.message
        : 'ログインIDまたはパスワードが正しくありません。';
  } finally {
    isSubmitting.value = false;
    // API待機中のdisabledを解除してからでないと、Browserはinputへフォーカスできない。
    if (authenticationError.value) {
      await focusInput(passwordInput.value);
    }
  }
}
</script>

<template>
  <main
    id="main-content"
    class="grid min-h-screen bg-[#f5f2ea] lg:grid-cols-[1.15fr_0.85fr]"
  >
    <section
      class="relative hidden overflow-hidden bg-[linear-gradient(135deg,rgba(4,48,44,.9),rgba(6,85,78,.97))] px-[clamp(3rem,7vw,7rem)] py-16 text-[#f8f5ee] lg:flex"
      aria-label="FieldFlowの紹介"
    >
      <div class="my-auto min-w-0 max-w-2xl">
        <p class="text-xs font-black tracking-[0.18em] text-[#f2a66f]">
          READY BEFORE THE FIELD
        </p>
        <h2
          class="login-hero-heading mt-5 font-black leading-[1.08] tracking-[-0.05em]"
        >
          <span class="login-hero-heading-line">忘れ物のない朝を、</span>
          <span class="login-hero-heading-line">チームでつくる。</span>
        </h2>
        <p class="mt-7 max-w-xl text-lg leading-8 text-white/75">
          現場へ出る前の道具と数量を、ひとつのチェック表で共有。FieldFlowは準備の抜け漏れを減らします。
        </p>
      </div>
      <div
        class="absolute -bottom-32 -right-24 size-96 rounded-full border-[72px] border-white/5"
        aria-hidden="true"
      ></div>
    </section>

    <section
      class="grid min-h-screen min-w-0 place-items-center px-5 py-10 sm:px-8"
    >
      <div
        class="w-full max-w-md rounded-3xl border border-[#cfdbd5] bg-[#fffdf8]/95 p-6 shadow-[0_18px_50px_rgb(16_42_46_/_16%)] sm:p-9"
      >
        <div class="flex items-center gap-3 font-black tracking-tight">
          <span
            class="grid size-9 -rotate-3 place-items-center rounded-xl rounded-br-sm bg-[#e87934] text-white"
            aria-hidden="true"
            >F</span
          >
          <span class="text-xl">FieldFlow</span>
        </div>

        <h1
          class="mt-8 text-3xl font-black tracking-tight"
          data-page-heading
          tabindex="-1"
        >
          ログイン
        </h1>
        <p class="mt-2 text-[#49666a]">今日の準備を始めましょう。</p>

        <p
          v-if="noticeMessage"
          class="mt-6 rounded-xl border border-[#b9ddce] bg-[#dff3e7] p-4 text-sm font-medium text-[#1d6240]"
          role="status"
        >
          {{ noticeMessage }}
        </p>

        <form class="mt-7 space-y-3" novalidate @submit.prevent="handleSubmit">
          <div>
            <label for="login-id" class="mb-2 block text-sm font-bold"
              >ログインID</label
            >
            <input
              id="login-id"
              ref="loginIdInput"
              v-model="loginId"
              name="loginId"
              autocomplete="username"
              class="min-h-12 w-full rounded-xl border border-[#b9cbc4] bg-white px-4 outline-none transition focus:border-[#0b6b62] focus:ring-4 focus:ring-[#0b6b62]/15"
              placeholder="例: admin"
              :disabled="isSubmitting"
              :aria-invalid="loginIdError ? 'true' : undefined"
              :aria-describedby="
                authenticationError
                  ? 'login-id-error login-error'
                  : 'login-id-error'
              "
              autofocus
              @input="clearLoginIdFeedback"
            />
            <p
              id="login-id-error"
              class="mt-1 min-h-5 text-sm font-bold leading-5 text-[#b33b35]"
              :role="loginIdError ? 'alert' : undefined"
            >
              {{ loginIdError }}
            </p>
          </div>

          <div>
            <label for="password" class="mb-2 block text-sm font-bold"
              >パスワード</label
            >
            <input
              id="password"
              ref="passwordInput"
              v-model="password"
              name="password"
              type="password"
              autocomplete="current-password"
              class="min-h-12 w-full rounded-xl border border-[#b9cbc4] bg-white px-4 outline-none transition focus:border-[#0b6b62] focus:ring-4 focus:ring-[#0b6b62]/15"
              placeholder="12文字以上"
              :disabled="isSubmitting"
              :aria-invalid="passwordError ? 'true' : undefined"
              :aria-describedby="
                authenticationError
                  ? 'password-error login-error'
                  : 'password-error'
              "
              @input="clearPasswordFeedback"
            />
            <p
              id="password-error"
              class="mt-1 min-h-5 text-sm font-bold leading-5 text-[#b33b35]"
              :role="passwordError ? 'alert' : undefined"
            >
              {{ passwordError }}
            </p>
          </div>

          <p
            v-if="authenticationError"
            id="login-error"
            class="text-sm font-bold leading-5 text-[#b33b35]"
            role="alert"
          >
            {{ authenticationError }}
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
          共用端末では、利用後に必ずログアウトしてください。
        </p>
      </div>
    </section>
  </main>
</template>
