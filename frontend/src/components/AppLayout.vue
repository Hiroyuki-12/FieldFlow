<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, RouterView, useRouter } from 'vue-router';

import { ApiError } from '../api/errors';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();
const mobileMenuOpen = ref(false);
const logoutError = ref('');
const isLoggingOut = ref(false);

const roleLabel = computed(() =>
  authStore.user?.role === 'ADMIN' ? '管理者' : '作業者',
);
const initials = computed(() => authStore.user?.name.slice(0, 2) ?? 'FF');

async function handleLogout(): Promise<void> {
  if (isLoggingOut.value) return;

  isLoggingOut.value = true;
  logoutError.value = '';
  try {
    await authStore.logout();
    await router.replace({ name: 'login', query: { loggedOut: 'true' } });
  } catch (error) {
    // FrontendのTokenは既に破棄済みだが、通信失敗時はBackend Sessionが残る可能性を明示する。
    logoutError.value =
      error instanceof ApiError
        ? '通信できなかったため、サーバー側のログアウトを確認できませんでした。再度ログイン後、ログアウトをお試しください。'
        : 'ログアウトを確認できませんでした。';
    await router.replace({
      name: 'login',
      query: { logoutIncomplete: 'true' },
    });
  } finally {
    isLoggingOut.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#f5f2ea] text-[#102a2e]">
    <a
      href="#main-content"
      class="fixed left-3 top-3 z-50 -translate-y-24 rounded-lg bg-[#102a2e] px-4 py-2 text-sm font-bold text-white transition focus:translate-y-0"
    >
      本文へ移動
    </a>

    <header
      class="border-b border-[#cfdbd5] bg-[#fffdf8]/95 shadow-sm backdrop-blur"
    >
      <div
        class="mx-auto flex min-h-18 max-w-7xl items-center gap-4 px-4 sm:px-6"
      >
        <RouterLink
          class="flex items-center gap-3 font-black tracking-tight"
          :to="{ name: 'home' }"
        >
          <span
            class="grid size-9 -rotate-3 place-items-center rounded-xl rounded-br-sm bg-[#e87934] text-white"
            aria-hidden="true"
            >F</span
          >
          <span class="text-xl">FieldFlow</span>
        </RouterLink>

        <nav
          class="ml-6 hidden items-center gap-1 md:flex"
          aria-label="メインナビゲーション"
        >
          <RouterLink
            :to="{ name: 'home' }"
            class="rounded-xl px-4 py-3 text-sm font-bold text-[#49666a] transition hover:bg-[#d8eee8] hover:text-[#074d47]"
          >
            ホーム
          </RouterLink>
          <RouterLink
            :to="{ name: 'tools' }"
            class="rounded-xl px-4 py-3 text-sm font-bold text-[#49666a] transition hover:bg-[#d8eee8] hover:text-[#074d47]"
          >
            道具管理
          </RouterLink>
          <RouterLink
            v-if="authStore.user?.role === 'ADMIN'"
            :to="{ name: 'categories' }"
            class="rounded-xl px-4 py-3 text-sm font-bold text-[#49666a] transition hover:bg-[#d8eee8] hover:text-[#074d47]"
          >
            作業カテゴリ管理
          </RouterLink>
          <RouterLink
            v-if="authStore.user?.role === 'ADMIN'"
            :to="{ name: 'users' }"
            class="rounded-xl px-4 py-3 text-sm font-bold text-[#49666a] transition hover:bg-[#d8eee8] hover:text-[#074d47]"
          >
            ユーザー管理
          </RouterLink>
        </nav>

        <div
          class="ml-auto hidden items-center gap-3 sm:flex"
          aria-label="ログイン中のユーザー"
        >
          <span
            class="grid size-10 place-items-center rounded-full bg-[#d8eee8] font-black text-[#0b6b62]"
          >
            {{ initials }}
          </span>
          <span class="leading-tight">
            <strong class="block text-sm">{{ authStore.user?.name }}</strong>
            <small class="text-[#6b8285]">{{ roleLabel }}</small>
          </span>
        </div>

        <button
          type="button"
          class="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#cfdbd5] bg-white text-xl md:hidden"
          :aria-expanded="mobileMenuOpen"
          aria-controls="mobile-navigation"
          :aria-label="mobileMenuOpen ? 'メニューを閉じる' : 'メニューを開く'"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <span aria-hidden="true">{{ mobileMenuOpen ? '×' : '☰' }}</span>
        </button>
      </div>

      <nav
        v-if="mobileMenuOpen"
        id="mobile-navigation"
        class="border-t border-[#cfdbd5] px-4 py-4 md:hidden"
        aria-label="モバイルナビゲーション"
      >
        <div class="mb-3 flex items-center gap-3 rounded-xl bg-[#e8eee9] p-3">
          <span
            class="grid size-10 place-items-center rounded-full bg-white font-black text-[#0b6b62]"
          >
            {{ initials }}
          </span>
          <span>
            <strong class="block text-sm">{{ authStore.user?.name }}</strong>
            <small class="text-[#6b8285]">{{ roleLabel }}</small>
          </span>
        </div>
        <RouterLink
          :to="{ name: 'home' }"
          class="block min-h-11 rounded-xl px-3 py-2.5 font-bold"
          @click="mobileMenuOpen = false"
          >ホーム</RouterLink
        >
        <RouterLink
          :to="{ name: 'tools' }"
          class="block min-h-11 rounded-xl px-3 py-2.5 font-bold"
          @click="mobileMenuOpen = false"
          >道具管理</RouterLink
        >
        <RouterLink
          v-if="authStore.user?.role === 'ADMIN'"
          :to="{ name: 'categories' }"
          class="block min-h-11 rounded-xl px-3 py-2.5 font-bold"
          @click="mobileMenuOpen = false"
          >作業カテゴリ管理</RouterLink
        >
        <RouterLink
          v-if="authStore.user?.role === 'ADMIN'"
          :to="{ name: 'users' }"
          class="block min-h-11 rounded-xl px-3 py-2.5 font-bold"
          @click="mobileMenuOpen = false"
          >ユーザー管理</RouterLink
        >
        <RouterLink
          :to="{ name: 'password-change' }"
          class="block min-h-11 rounded-xl px-3 py-2.5 font-bold"
          @click="mobileMenuOpen = false"
          >パスワード変更</RouterLink
        >
        <button
          type="button"
          class="min-h-11 w-full rounded-xl px-3 py-2.5 text-left font-bold text-[#b33b35]"
          :disabled="isLoggingOut"
          @click="handleLogout"
        >
          {{ isLoggingOut ? 'ログアウト中…' : 'ログアウト' }}
        </button>
      </nav>
    </header>

    <div class="mx-auto flex max-w-7xl">
      <aside class="hidden w-64 shrink-0 px-6 py-8 md:block">
        <nav class="space-y-2" aria-label="アカウントメニュー">
          <RouterLink
            :to="{ name: 'tools' }"
            class="block rounded-xl px-4 py-3 text-sm font-bold text-[#49666a] hover:bg-[#e8eee9]"
          >
            道具管理
          </RouterLink>
          <RouterLink
            v-if="authStore.user?.role === 'ADMIN'"
            :to="{ name: 'categories' }"
            class="block rounded-xl px-4 py-3 text-sm font-bold text-[#49666a] hover:bg-[#e8eee9]"
          >
            作業カテゴリ管理
          </RouterLink>
          <RouterLink
            v-if="authStore.user?.role === 'ADMIN'"
            :to="{ name: 'users' }"
            class="block rounded-xl px-4 py-3 text-sm font-bold text-[#49666a] hover:bg-[#e8eee9]"
          >
            ユーザー管理
          </RouterLink>
          <RouterLink
            :to="{ name: 'password-change' }"
            class="block rounded-xl px-4 py-3 text-sm font-bold text-[#49666a] hover:bg-[#e8eee9]"
          >
            パスワード変更
          </RouterLink>
          <button
            type="button"
            class="min-h-11 w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-[#b33b35] hover:bg-[#fbe4e1] disabled:opacity-60"
            :disabled="isLoggingOut"
            @click="handleLogout"
          >
            {{ isLoggingOut ? 'ログアウト中…' : 'ログアウト' }}
          </button>
        </nav>
      </aside>

      <main id="main-content" class="min-w-0 flex-1 px-4 py-8 sm:px-6 md:py-10">
        <p
          v-if="logoutError"
          class="mb-5 rounded-xl bg-[#fbe4e1] p-4 text-sm text-[#8d2f2b]"
          role="alert"
        >
          {{ logoutError }}
        </p>
        <RouterView />
      </main>
    </div>
  </div>
</template>
