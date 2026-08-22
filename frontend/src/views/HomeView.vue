<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { type DailyChecklist, getDailyChecklist } from '../api/daily-checklists';
import { ApiError } from '../api/errors';
import ChecklistCreationDialog from '../components/ChecklistCreationDialog.vue';
import AppNotice from '../components/AppNotice.vue';
import { useAuthStore } from '../stores/auth';
import { formatJapaneseDate, todayInTokyo } from '../utils/date';

const authStore = useAuthStore();
const router = useRouter();
const today = todayInTokyo();
const otherDate = ref(today);
const checklist = ref<DailyChecklist | null>(null);
const isLoading = ref(false);
const creationDialogOpen = ref(false);
const errorMessage = ref('');

const roleLabel = computed(() =>
  authStore.user?.role === 'ADMIN' ? '管理者' : '作業者',
);
const selectedItems = computed(
  () =>
    checklist.value?.periods
      .flatMap((period) => period.items)
      .filter((item) => item.takeoutQuantity > 0) ?? [],
);
const preparedCount = computed(
  () => selectedItems.value.filter((item) => item.checked).length,
);
const progressLabel = computed(() => {
  if (selectedItems.value.length === 0) return '持ち出し未設定';
  if (preparedCount.value === selectedItems.value.length) return '準備完了';
  return '準備中';
});

onMounted(loadTodayChecklist);

async function loadTodayChecklist(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    checklist.value = await getDailyChecklist(today);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'CHECKLIST_NOT_FOUND') {
      checklist.value = null;
    } else {
      errorMessage.value = messageFor(error);
    }
  } finally {
    isLoading.value = false;
  }
}

async function openTodayChecklist(): Promise<void> {
  if (checklist.value) {
    await router.push({ name: 'daily-checklist', params: { date: today } });
  } else {
    creationDialogOpen.value = true;
  }
}

async function openOtherDate(): Promise<void> {
  await router.push({
    name: 'daily-checklist',
    params: { date: otherDate.value },
  });
}

async function handleSaved(saved: DailyChecklist): Promise<void> {
  checklist.value = saved;
  creationDialogOpen.value = false;
  await router.push({
    name: 'daily-checklist',
    params: { date: saved.workDate },
  });
}

function periodLabel(period: string): string {
  if (period === 'MORNING') return '午前';
  if (period === 'AFTERNOON') return '午後';
  return '1日通し';
}

function messageFor(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : '今日の日別チェックを読み込めませんでした。もう一度お試しください。';
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-black tracking-[0.16em] text-[#0b6b62]">HOME</p>
        <h1
          class="mt-2 text-3xl font-black tracking-tight sm:text-4xl"
          data-page-heading
          tabindex="-1"
        >
          おはようございます、{{ authStore.user?.name }}さん
        </h1>
        <p class="mt-3 text-[#49666a]">
          {{ formatJapaneseDate(today) }}。{{ roleLabel }}として安全に準備を始めましょう。
        </p>
      </div>
    </div>

    <AppNotice v-if="errorMessage" class="mt-6" tone="error" title="今日のチェック表を読み込めませんでした">
      {{ errorMessage }}
      <button class="ml-2 min-h-11 font-bold underline" type="button" @click="loadTodayChecklist">
        再読み込み
      </button>
    </AppNotice>

    <section
      class="mt-8 rounded-3xl border border-[#cfdbd5] bg-[#fffdf8] p-6 shadow-sm sm:p-8"
      aria-labelledby="today-check-title"
    >
      <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-black tracking-[0.16em] text-[#0b6b62]">
            TODAY'S PREPARATION
          </p>
          <h2 id="today-check-title" class="mt-2 text-2xl font-black">
            今日の道具チェック
          </h2>
          <p v-if="isLoading" class="mt-3 text-[#49666a]" role="status">
            今日のチェック表を確認中…
          </p>
          <template v-else-if="checklist">
            <div class="mt-4 flex flex-wrap gap-2" aria-label="作成済みの時間帯">
              <span
                v-for="period in checklist.periods"
                :key="period.id"
                class="rounded-full bg-[#e7f4ef] px-3 py-1 text-sm font-bold text-[#0b6b62]"
              >
                {{ periodLabel(period.period) }}・チェック表あり
              </span>
            </div>
            <div class="mt-4 flex flex-wrap items-center gap-3">
              <span
                class="rounded-full px-3 py-1 text-sm font-black"
                :class="
                  progressLabel === '準備完了'
                    ? 'bg-[#d8eee8] text-[#24764d]'
                    : 'bg-[#fff0df] text-[#8a4a1f]'
                "
              >
                {{ progressLabel }}
              </span>
              <span class="text-sm text-[#49666a]">
                {{
                  selectedItems.length > 0
                    ? `準備 ${preparedCount} / ${selectedItems.length}`
                    : '数量を入力すると進捗を表示します'
                }}
              </span>
            </div>
          </template>
          <p v-else class="mt-3 max-w-2xl leading-7 text-[#49666a]">
            時間帯と作業カテゴリを一度に選んで、必要な道具のチェック表を作成します。
          </p>
        </div>
        <button
          class="min-h-12 shrink-0 rounded-xl bg-[#e87934] px-5 py-3 font-black text-white disabled:opacity-60"
          type="button"
          :disabled="isLoading || Boolean(errorMessage)"
          @click="openTodayChecklist"
        >
          {{ checklist ? '今日のチェックを開く' : '今日のチェックを作成' }}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>

    <div class="mt-6 grid gap-5 lg:grid-cols-2">
      <section class="rounded-2xl border border-[#cfdbd5] bg-white p-6">
        <p class="text-xs font-black tracking-wider text-[#6b8285]">OTHER DATE</p>
        <h2 class="mt-2 text-xl font-black">別の日を確認</h2>
        <p class="mt-2 leading-7 text-[#49666a]">
          過去の記録や未来日の準備を確認できます。
        </p>
        <form class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="openOtherDate">
          <label class="min-w-0 flex-1">
            <span class="mb-1 block text-sm font-bold">作業日</span>
            <input
              v-model="otherDate"
              class="min-h-11 w-full rounded-xl border border-[#aebfba] px-3"
              type="date"
              required
            />
          </label>
          <button
            class="min-h-11 rounded-xl border border-[#aebfba] px-5 font-bold"
            type="submit"
          >
            この日を開く
          </button>
        </form>
      </section>

      <section
        v-if="authStore.user?.role === 'ADMIN'"
        class="rounded-2xl border border-[#cfdbd5] bg-white p-6"
        aria-labelledby="admin-menu-title"
      >
        <p class="text-xs font-black tracking-wider text-[#6b8285]">ADMIN MENU</p>
        <h2 id="admin-menu-title" class="mt-2 text-xl font-black">管理メニュー</h2>
        <p class="mt-2 leading-7 text-[#49666a]">マスター情報と利用者を管理します。</p>
        <div class="mt-5 flex flex-wrap gap-2">
          <RouterLink class="min-h-11 rounded-xl border px-4 py-2.5 font-bold" :to="{ name: 'tools' }">道具</RouterLink>
          <RouterLink class="min-h-11 rounded-xl border px-4 py-2.5 font-bold" :to="{ name: 'categories' }">作業カテゴリ</RouterLink>
          <RouterLink class="min-h-11 rounded-xl border px-4 py-2.5 font-bold" :to="{ name: 'users' }">ユーザー</RouterLink>
        </div>
      </section>
      <section v-else class="rounded-2xl border border-[#cfdbd5] bg-white p-6">
        <p class="text-xs font-black tracking-wider text-[#6b8285]">HOW TO USE</p>
        <h2 class="mt-2 text-xl font-black">準備の流れ</h2>
        <p class="mt-2 leading-7 text-[#49666a]">
          作業を選ぶ → 数量を入力 → 準備済みにする、の3ステップです。
        </p>
      </section>
    </div>

    <ChecklistCreationDialog
      :open="creationDialogOpen"
      :date="today"
      @close="creationDialogOpen = false"
      @saved="handleSaved"
    />
  </div>
</template>
