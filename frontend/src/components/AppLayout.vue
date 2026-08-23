<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';

import { ApiError } from '../api/errors';
import { useAuthStore } from '../stores/auth';
import { todayInTokyo } from '../utils/date';
import AppNotice from './AppNotice.vue';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const today = todayInTokyo();
const mobileMenuOpen = ref(false);
const accountMenuOpen = ref(false);
const logoutError = ref('');
const isLoggingOut = ref(false);
const mobileMenuButton = ref<HTMLButtonElement | null>(null);
const mobileNavigation = ref<HTMLElement | null>(null);
const accountMenuButton = ref<HTMLButtonElement | null>(null);
const accountMenuContainer = ref<HTMLElement | null>(null);
const accountNavigation = ref<HTMLElement | null>(null);

const roleLabel = computed(() =>
  authStore.user?.role === 'ADMIN' ? '管理者' : '作業者',
);
const initials = computed(() => authStore.user?.name.slice(0, 2) ?? 'FF');

watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false;
    accountMenuOpen.value = false;
  },
);

onMounted(() =>
  document.addEventListener('pointerdown', handleOutsidePointerDown),
);
onBeforeUnmount(() =>
  document.removeEventListener('pointerdown', handleOutsidePointerDown),
);

async function toggleMobileMenu(): Promise<void> {
  accountMenuOpen.value = false;
  mobileMenuOpen.value = !mobileMenuOpen.value;
  if (mobileMenuOpen.value) {
    await nextTick();
    mobileNavigation.value?.querySelector<HTMLElement>('a, button')?.focus();
  }
}

function closeMobileMenu(): void {
  if (!mobileMenuOpen.value) return;
  mobileMenuOpen.value = false;
  void nextTick(() => mobileMenuButton.value?.focus());
}

/**
 * デスクトップでは主要画面へのリンクと個人操作を分ける。
 * 開いた直後に先頭項目へ移動し、キーボード利用者が次の操作を探さずに済むようにする。
 */
async function toggleAccountMenu(): Promise<void> {
  mobileMenuOpen.value = false;
  accountMenuOpen.value = !accountMenuOpen.value;
  if (accountMenuOpen.value) {
    await nextTick();
    accountNavigation.value?.querySelector<HTMLElement>('a, button')?.focus();
  }
}

function closeAccountMenu(returnFocus = false): void {
  if (!accountMenuOpen.value) return;
  accountMenuOpen.value = false;
  if (returnFocus) {
    void nextTick(() => accountMenuButton.value?.focus());
  }
}

function handleOutsidePointerDown(event: PointerEvent): void {
  if (
    accountMenuOpen.value &&
    event.target instanceof Node &&
    !accountMenuContainer.value?.contains(event.target)
  ) {
    closeAccountMenu();
  }
}

async function handleLogout(): Promise<void> {
  if (isLoggingOut.value) return;

  mobileMenuOpen.value = false;
  accountMenuOpen.value = false;
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

        <button
          ref="mobileMenuButton"
          type="button"
          class="ml-auto grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#cfdbd5] bg-white text-xl xl:hidden"
          :aria-expanded="mobileMenuOpen"
          aria-controls="mobile-navigation"
          :aria-label="mobileMenuOpen ? 'メニューを閉じる' : 'メニューを開く'"
          @click="toggleMobileMenu"
        >
          <span aria-hidden="true">{{ mobileMenuOpen ? '×' : '☰' }}</span>
        </button>

        <!-- 管理者用の項目数でも折り返さない幅を確保し、xl未満は一つのメニューへ集約する。 -->
        <nav
          class="ml-6 hidden flex-nowrap items-center gap-1 whitespace-nowrap xl:flex"
          aria-label="メインナビゲーション"
        >
          <RouterLink
            :to="{ name: 'home' }"
            class="rounded-xl px-4 py-3 text-sm font-bold text-[#49666a] transition hover:bg-[#d8eee8] hover:text-[#074d47]"
          >
            ホーム
          </RouterLink>
          <RouterLink
            :to="{ name: 'daily-checklist', params: { date: today } }"
            class="rounded-xl px-4 py-3 text-sm font-bold text-[#49666a] transition hover:bg-[#d8eee8] hover:text-[#074d47]"
          >
            日別チェック
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
          ref="accountMenuContainer"
          class="relative ml-auto hidden xl:block"
        >
          <button
            ref="accountMenuButton"
            type="button"
            class="flex min-h-11 max-w-64 items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-[#e8eee9]"
            :aria-expanded="accountMenuOpen"
            aria-controls="desktop-account-navigation"
            :aria-label="`アカウントメニューを${accountMenuOpen ? '閉じる' : '開く'}（${authStore.user?.name ?? 'ユーザー'}・${roleLabel}）`"
            @click="toggleAccountMenu"
          >
            <span
              class="grid size-10 shrink-0 place-items-center rounded-full bg-[#d8eee8] font-black text-[#0b6b62]"
              aria-hidden="true"
            >
              {{ initials }}
            </span>
            <span class="min-w-0 flex-1 leading-tight">
              <strong class="block truncate text-sm">{{
                authStore.user?.name
              }}</strong>
              <small class="text-[#6b8285]">{{ roleLabel }}</small>
            </span>
            <span class="shrink-0 text-[#49666a]" aria-hidden="true">
              {{ accountMenuOpen ? '▲' : '▼' }}
            </span>
          </button>

          <nav
            v-if="accountMenuOpen"
            id="desktop-account-navigation"
            ref="accountNavigation"
            class="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-[#cfdbd5] bg-white p-2 shadow-xl"
            aria-label="アカウント操作"
            @keydown.esc.prevent="closeAccountMenu(true)"
          >
            <RouterLink
              :to="{ name: 'password-change' }"
              class="block min-h-11 rounded-xl px-3 py-2.5 font-bold hover:bg-[#e8eee9]"
              @click="closeAccountMenu()"
            >
              パスワード変更
            </RouterLink>
            <button
              type="button"
              class="min-h-11 w-full rounded-xl px-3 py-2.5 text-left font-bold text-[#b33b35] hover:bg-[#fbe4e1] disabled:opacity-60"
              :disabled="isLoggingOut"
              @click="handleLogout"
            >
              {{ isLoggingOut ? 'ログアウト中…' : 'ログアウト' }}
            </button>
          </nav>
        </div>
      </div>

      <nav
        v-if="mobileMenuOpen"
        id="mobile-navigation"
        ref="mobileNavigation"
        class="border-t border-[#cfdbd5] px-4 py-4 xl:hidden"
        aria-label="モバイルナビゲーション"
        @keydown.esc.prevent="closeMobileMenu"
      >
        <div
          class="mb-3 flex min-w-0 items-center gap-3 rounded-xl bg-[#e8eee9] p-3"
          aria-label="メニュー内のユーザー情報"
        >
          <span
            class="grid size-10 place-items-center rounded-full bg-white font-black text-[#0b6b62]"
          >
            {{ initials }}
          </span>
          <span class="min-w-0">
            <strong class="block break-words text-sm">{{
              authStore.user?.name
            }}</strong>
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
          :to="{ name: 'daily-checklist', params: { date: today } }"
          class="block min-h-11 rounded-xl px-3 py-2.5 font-bold"
          @click="mobileMenuOpen = false"
          >日別チェック</RouterLink
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

    <!-- サイドバーをなくし、一覧画面で横幅を活かしながら本文自体はmax-width内へ保つ。 -->
    <main
      id="main-content"
      class="mx-auto w-full min-w-0 max-w-7xl px-4 py-8 sm:px-6 md:py-10"
    >
      <AppNotice
        v-if="logoutError"
        class="mb-5"
        tone="error"
        title="ログアウトを確認できませんでした"
      >
        {{ logoutError }}
      </AppNotice>
      <RouterView />
    </main>
  </div>
</template>
