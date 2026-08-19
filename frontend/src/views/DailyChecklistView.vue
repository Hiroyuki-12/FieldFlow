<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  type ChecklistPeriod,
  cancelDailyChecklist,
  type DailyChecklist,
  type DailyChecklistItem,
  getDailyChecklist,
} from '../api/daily-checklists';
import { ApiError } from '../api/errors';
import ChecklistCreationDialog from '../components/ChecklistCreationDialog.vue';
import { formatJapaneseDate, todayInTokyo } from '../utils/date';

const route = useRoute();
const router = useRouter();
const today = todayInTokyo();
const selectedDate = ref('');
const checklist = ref<DailyChecklist | null>(null);
const selectedPeriod = ref<ChecklistPeriod>('FULL_DAY');
const isLoading = ref(false);
const isMissing = ref(false);
const creationDialogOpen = ref(false);
const deleteDialogOpen = ref(false);
const deleteDialog = ref<HTMLDialogElement | null>(null);
const isDeleting = ref(false);
const deleteErrorMessage = ref('');
const errorMessage = ref('');
const noticeMessage = ref('');

const workDate = computed(() => String(route.params.date ?? today));
const isPastDate = computed(() => workDate.value < today);
const currentPeriod = computed(
  () =>
    checklist.value?.periods.find(
      (period) => period.period === selectedPeriod.value,
    ) ?? null,
);
const groupedItems = computed(() => {
  const groups = new Map<string, DailyChecklistItem[]>();
  for (const item of currentPeriod.value?.items ?? []) {
    const items = groups.get(item.categoryName) ?? [];
    items.push(item);
    groups.set(item.categoryName, items);
  }
  return [...groups.entries()].map(([categoryName, items]) => ({
    categoryName,
    items,
  }));
});
const selectedItems = computed(
  () =>
    currentPeriod.value?.items.filter((item) => item.takeoutQuantity > 0) ?? [],
);
const preparedCount = computed(
  () => selectedItems.value.filter((item) => item.checked).length,
);
const progressPercent = computed(() =>
  selectedItems.value.length === 0
    ? 0
    : Math.round((preparedCount.value / selectedItems.value.length) * 100),
);

watch(
  workDate,
  async (date) => {
    selectedDate.value = date;
    await loadChecklist();
    if (import.meta.env.MODE !== 'test') window.scrollTo({ top: 0 });
  },
  { immediate: true },
);

watch(deleteDialogOpen, async (open) => {
  await nextTick();
  if (open) {
    if (!deleteDialog.value?.open) {
      if (typeof deleteDialog.value?.showModal === 'function')
        deleteDialog.value.showModal();
      else deleteDialog.value?.setAttribute('open', '');
    }
    deleteDialog.value
      ?.querySelector<HTMLElement>('button')
      ?.focus();
  } else if (deleteDialog.value?.open) {
    if (typeof deleteDialog.value.close === 'function') deleteDialog.value.close();
    else deleteDialog.value.removeAttribute('open');
  }
});

async function loadChecklist(): Promise<void> {
  isLoading.value = true;
  isMissing.value = false;
  errorMessage.value = '';
  noticeMessage.value = '';
  checklist.value = null;
  try {
    const loaded = await getDailyChecklist(workDate.value);
    checklist.value = loaded;
    selectedPeriod.value = loaded.periods[0]?.period ?? 'FULL_DAY';
  } catch (error) {
    if (error instanceof ApiError && error.code === 'CHECKLIST_NOT_FOUND') {
      isMissing.value = true;
    } else {
      errorMessage.value = messageFor(error);
    }
  } finally {
    isLoading.value = false;
  }
}

async function moveToSelectedDate(): Promise<void> {
  if (!selectedDate.value || selectedDate.value === workDate.value) {
    await loadChecklist();
    return;
  }
  await router.push({
    name: 'daily-checklist',
    params: { date: selectedDate.value },
  });
}

async function moveToToday(): Promise<void> {
  if (workDate.value === today) {
    await loadChecklist();
    return;
  }
  await router.push({ name: 'daily-checklist', params: { date: today } });
}

function handleSaved(saved: DailyChecklist): void {
  const wasEditing = Boolean(checklist.value);
  checklist.value = saved;
  isMissing.value = false;
  creationDialogOpen.value = false;
  selectedPeriod.value = saved.periods[0]?.period ?? 'FULL_DAY';
  noticeMessage.value = wasEditing
    ? '時間帯・作業内容を変更しました。'
    : 'この日のチェック表を作成しました。';
}

function openDeleteDialog(): void {
  deleteErrorMessage.value = '';
  deleteDialogOpen.value = true;
}

function closeDeleteDialog(): void {
  if (!isDeleting.value) deleteDialogOpen.value = false;
}

async function deleteChecklist(): Promise<void> {
  if (!checklist.value) return;
  isDeleting.value = true;
  deleteErrorMessage.value = '';
  try {
    await cancelDailyChecklist(workDate.value, {
      checklistId: checklist.value.id,
      version: checklist.value.version,
      // この確認画面自体が、入力済み内容を含む取消への明示確認になる。
      confirmDataLoss: true,
    });
    checklist.value = null;
    isMissing.value = true;
    deleteDialogOpen.value = false;
    noticeMessage.value = 'この日のチェック表を削除しました。新しく作成できます。';
  } catch (error) {
    deleteErrorMessage.value = deleteMessageFor(error);
  } finally {
    isDeleting.value = false;
  }
}

function periodLabel(period: ChecklistPeriod): string {
  if (period === 'MORNING') return '午前';
  if (period === 'AFTERNOON') return '午後';
  return '1日通し';
}

function messageFor(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : '日別チェックを読み込めませんでした。もう一度お試しください。';
}

function deleteMessageFor(error: unknown): string {
  if (!(error instanceof ApiError))
    return 'チェック表を削除できませんでした。もう一度お試しください。';
  const messages: Record<string, string> = {
    CHECKLIST_UPDATE_CONFLICT:
      '別の利用者が先に変更しました。画面を再読み込みして確認してください。',
    CHECKLIST_NOT_FOUND: 'このチェック表はすでに削除されています。',
    CHECKLIST_PAST_DATE: '過去日のチェック表は削除できません。',
  };
  return (error.code && messages[error.code]) || error.message;
}
</script>

<template>
  <section class="mx-auto max-w-6xl">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs font-black tracking-[0.16em] text-[#0b6b62]">DAILY CHECK</p>
        <h1 class="mt-2 text-3xl font-black tracking-tight">日別チェック</h1>
        <p class="mt-2 text-[#49666a]">
          {{ formatJapaneseDate(workDate) }}の持ち出し準備
        </p>
      </div>
      <RouterLink
        class="min-h-11 rounded-xl border border-[#aebfba] bg-white px-4 py-2.5 font-bold"
        :to="{ name: 'home' }"
      >
        ホームへ戻る
      </RouterLink>
    </div>

    <section
      class="mt-6 rounded-2xl border border-[#cfdbd5] bg-white p-4 sm:p-5"
      aria-label="日付と時間帯"
    >
      <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="moveToSelectedDate">
        <label class="sm:w-56">
          <span class="mb-1 block text-sm font-bold">作業日</span>
          <input
            v-model="selectedDate"
            class="min-h-11 w-full rounded-xl border border-[#aebfba] px-3"
            type="date"
            required
          />
        </label>
        <div class="flex flex-wrap gap-2">
          <button class="min-h-11 rounded-xl bg-[#102a2e] px-5 font-bold text-white" type="submit">
            この日を表示
          </button>
          <button class="min-h-11 rounded-xl border border-[#aebfba] px-5 font-bold" type="button" @click="moveToToday">
            今日
          </button>
        </div>
      </form>

      <div
        v-if="checklist && checklist.periods.length > 1"
        class="mt-5 grid grid-cols-2 rounded-xl bg-[#e8eee9] p-1"
        role="group"
        aria-label="時間帯を切り替え"
      >
        <button
          v-for="period in checklist.periods"
          :key="period.id"
          class="min-h-11 rounded-lg px-4 font-bold"
          :class="selectedPeriod === period.period ? 'bg-white shadow-sm' : ''"
          type="button"
          :aria-pressed="selectedPeriod === period.period"
          @click="selectedPeriod = period.period"
        >
          {{ periodLabel(period.period) }}
        </button>
      </div>
    </section>

    <p
      v-if="noticeMessage"
      class="mt-6 rounded-xl bg-[#d8eee8] p-4 text-sm font-bold text-[#24764d]"
      role="status"
    >
      {{ noticeMessage }}
    </p>
    <p v-if="isLoading" class="mt-8 text-center" role="status">
      日別チェックを読み込み中…
    </p>
    <p
      v-else-if="errorMessage"
      class="mt-6 rounded-xl bg-[#fbe4e1] p-4 text-sm text-[#8d2f2b]"
      role="alert"
    >
      {{ errorMessage }}
      <button class="ml-2 underline" type="button" @click="loadChecklist">再読み込み</button>
    </p>

    <section
      v-else-if="isMissing"
      class="mt-6 rounded-3xl border border-dashed border-[#aebfba] bg-[#fffdf8] p-8 text-center sm:p-12"
    >
      <p class="text-4xl" aria-hidden="true">📋</p>
      <h2 class="mt-3 text-2xl font-black">この日のチェック表はありません</h2>
      <p class="mx-auto mt-3 max-w-xl leading-7 text-[#49666a]">
        {{
          isPastDate
            ? '過去日は記録を閲覧できますが、新しいチェック表は作成できません。'
            : '時間帯と作業カテゴリを選んで、必要な道具のチェック表を作成します。'
        }}
      </p>
      <button
        v-if="!isPastDate"
        class="mt-6 min-h-12 rounded-xl bg-[#e87934] px-6 font-black text-white"
        type="button"
        @click="creationDialogOpen = true"
      >
        この日のチェック表を作成
      </button>
    </section>

    <template v-else-if="checklist && currentPeriod">
      <section
        v-if="checklist.editable"
        class="mt-6 flex flex-col gap-3 rounded-2xl border border-[#cfdbd5] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
        aria-label="チェック表の設定"
      >
        <div>
          <h2 class="font-black">チェック表の設定</h2>
          <p class="mt-1 text-sm text-[#49666a]">
            登録を間違えた場合は、内容の変更またはこの日の表の削除ができます。
          </p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row">
          <button
            class="min-h-11 rounded-xl border border-[#0b6b62] px-4 font-bold text-[#0b6b62]"
            type="button"
            @click="creationDialogOpen = true"
          >
            時間帯・作業内容を変更する
          </button>
          <button
            class="min-h-11 rounded-xl border border-[#b44b43] px-4 font-bold text-[#9a3832]"
            type="button"
            @click="openDeleteDialog"
          >
            この日のチェック表を削除する
          </button>
        </div>
      </section>

      <section class="mt-6 rounded-2xl bg-[#102a2e] p-5 text-white sm:p-6" aria-label="準備の進捗">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-sm font-bold text-[#b8d9d3]">{{ periodLabel(currentPeriod.period) }}</p>
            <p class="mt-1 text-xl font-black">
              {{ selectedItems.length === 0 ? '持ち出し未設定' : `準備 ${preparedCount} / ${selectedItems.length}` }}
            </p>
          </div>
          <strong class="text-2xl">{{ progressPercent }}%</strong>
        </div>
        <div class="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
          <div class="h-full rounded-full bg-[#6fd2b3]" :style="{ width: `${progressPercent}%` }"></div>
        </div>
        <div class="mt-4 flex flex-wrap gap-2" aria-label="選択中の作業カテゴリ">
          <span
            v-for="category in currentPeriod.categories"
            :key="category.sourceCategoryId"
            class="rounded-full bg-white/10 px-3 py-1 text-sm font-bold"
          >
            {{ category.categoryName }}
          </span>
          <span class="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">共通（自動）</span>
        </div>
        <p v-if="!checklist.editable" class="mt-4 text-sm font-bold text-[#f7d4b8]">
          過去日のため閲覧のみです。
        </p>
      </section>

      <p class="mt-5 rounded-xl bg-[#fff0df] p-3 text-sm text-[#7a421e]">
        数量と準備状態は、現在保存されている内容を表示しています。
      </p>

      <div v-if="groupedItems.length > 0" class="mt-5 space-y-5">
        <section
          v-for="group in groupedItems"
          :key="group.categoryName"
          class="overflow-hidden rounded-2xl border border-[#cfdbd5] bg-white shadow-sm"
        >
          <header class="flex items-center justify-between gap-3 border-b border-[#cfdbd5] bg-[#f7faf7] px-4 py-3 sm:px-5">
            <h2 class="text-lg font-black">{{ group.categoryName }}</h2>
            <span class="text-sm font-bold text-[#49666a]">{{ group.items.length }}種類</span>
          </header>
          <ul class="divide-y divide-[#e2e9e5]">
            <li
              v-for="item in group.items"
              :key="item.id"
              class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-4 py-4 sm:gap-4 sm:px-5"
            >
              <div class="min-w-0">
                <strong class="break-words">{{ item.toolName }}</strong>
                <span class="ml-2 text-sm text-[#49666a]">在庫 {{ item.stockQuantity }}</span>
              </div>
              <span class="whitespace-nowrap text-sm"><strong>持出</strong> {{ item.takeoutQuantity }}</span>
              <span
                class="w-fit rounded-full px-3 py-1 text-sm font-bold"
                :class="item.checked ? 'bg-[#d8eee8] text-[#24764d]' : 'bg-[#e8eee9] text-[#49666a]'"
              >
                {{ item.checked ? '準備済み' : '未準備' }}
              </span>
            </li>
          </ul>
        </section>
      </div>
      <p v-else class="mt-5 rounded-2xl bg-white p-8 text-center text-[#49666a]">
        この時間帯に表示する道具はありません。
      </p>
    </template>

    <ChecklistCreationDialog
      :open="creationDialogOpen"
      :date="workDate"
      :checklist="checklist"
      @close="creationDialogOpen = false"
      @saved="handleSaved"
    />

    <dialog
      ref="deleteDialog"
      class="m-auto w-[min(92vw,32rem)] rounded-3xl border-0 bg-white p-0 text-[#102a2e] shadow-2xl backdrop:bg-black/50"
      aria-labelledby="delete-checklist-title"
      @cancel.prevent="closeDeleteDialog"
    >
      <section class="p-6 sm:p-7">
        <p class="text-xs font-black tracking-[0.16em] text-[#9a3832]">DELETE DAILY CHECK</p>
        <h2 id="delete-checklist-title" class="mt-2 text-2xl font-black">
          この日のチェック表を削除しますか？
        </h2>
        <p class="mt-3 leading-7 text-[#49666a]">
          {{ formatJapaneseDate(workDate) }}の入力済みの持ち出し数と準備状態も画面から削除されます。削除後は、新しいチェック表を作成できます。
        </p>
        <p class="mt-3 text-sm text-[#49666a]">
          誤操作の確認に備えて、変更前の内容は内部履歴として保持されます。
        </p>
        <p
          v-if="deleteErrorMessage"
          class="mt-4 rounded-xl bg-[#fbe4e1] p-3 text-sm text-[#8d2f2b]"
          role="alert"
        >
          {{ deleteErrorMessage }}
        </p>
      </section>
      <footer class="flex justify-end gap-3 border-t border-[#cfdbd5] bg-[#fffdf8] px-6 py-4">
        <button
          class="min-h-11 rounded-xl border border-[#aebfba] px-5 font-bold"
          type="button"
          :disabled="isDeleting"
          @click="closeDeleteDialog"
        >
          戻る
        </button>
        <button
          class="min-h-11 rounded-xl bg-[#b44b43] px-5 font-bold text-white disabled:opacity-60"
          type="button"
          :disabled="isDeleting"
          @click="deleteChecklist"
        >
          {{ isDeleting ? '削除中…' : '削除する' }}
        </button>
      </footer>
    </dialog>
  </section>
</template>
