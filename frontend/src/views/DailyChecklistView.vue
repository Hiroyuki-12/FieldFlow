<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  type ChecklistPeriod,
  cancelDailyChecklist,
  type DailyChecklist,
  type DailyChecklistItem,
  getDailyChecklist,
  updateDailyChecklistItem,
} from '../api/daily-checklists';
import { ApiError } from '../api/errors';
import ChecklistCategoryAdditionDialog from '../components/ChecklistCategoryAdditionDialog.vue';
import ChecklistCreationDialog from '../components/ChecklistCreationDialog.vue';
import AppNotice from '../components/AppNotice.vue';
import { useModalDialog } from '../composables/useModalDialog';
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
const categoryAdditionDialogOpen = ref(false);
const deleteDialogOpen = ref(false);
const {
  dialog: deleteDialog,
  openModal: openDeleteModal,
  closeModal: closeDeleteModal,
  trapFocus: trapDeleteDialogFocus,
} = useModalDialog();
const settingsExpanded = ref(false);
const isDeleting = ref(false);
const deleteErrorMessage = ref('');
const errorMessage = ref('');
const noticeMessage = ref('');

type ItemSaveStatus = 'saved' | 'saving' | 'failed';

interface PendingItemValues {
  takeoutQuantity: number;
  checked: boolean;
}

interface ItemConflictNotice {
  takeoutQuantity: number;
  checked: boolean;
}

interface ItemSaveState {
  status: ItemSaveStatus;
  message: string;
  running: boolean;
  pending: PendingItemValues | null;
  period: ChecklistPeriod;
  workDate: string;
  conflict: ItemConflictNotice | null;
}

// 道具ごとに独立したキューを持ち、1件の通信失敗で別の道具の保存まで止めない。
const itemSaveStates = ref<Record<string, ItemSaveState>>({});
// 午前・午後を切り替えても利用者の選択を失わないよう、時間帯ごとに開閉状態を分離する。
const expandedCategories = ref<
  Record<ChecklistPeriod, Record<string, boolean>>
>({
  FULL_DAY: {},
  MORNING: {},
  AFTERNOON: {},
});

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
  // 道具0件の選択カテゴリも見出しへ残し、設定されている作業を一覧で把握できるようにする。
  for (const category of currentPeriod.value?.categories ?? []) {
    if (!groups.has(category.categoryName)) groups.set(category.categoryName, []);
  }
  return [...groups.entries()].map(([categoryName, items]) => {
    const selected = items.filter((item) => item.takeoutQuantity > 0);
    const prepared = selected.filter((item) => item.checked).length;
    const progress =
      selected.length === 0
        ? 0
        : Math.round((prepared / selected.length) * 100);
    const hasSaveFailure = items.some(
      (item) => itemSaveStates.value[item.id]?.status === 'failed',
    );
    const hasConflict = items.some(
      (item) => Boolean(itemSaveStates.value[item.id]?.conflict),
    );
    return {
      categoryName,
      items,
      prepared,
      selectedCount: selected.length,
      progress,
      hasSaveFailure,
      hasConflict,
    };
  });
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
const hasPendingItemSaves = computed(() =>
  Object.values(itemSaveStates.value).some(
    (state) =>
      state.status !== 'saved' || state.running || state.pending !== null,
  ),
);
const conflictedItemNames = computed(() =>
  (currentPeriod.value?.items ?? [])
    .filter((item) => itemSaveStates.value[item.id]?.conflict)
    .map((item) => item.toolName),
);
const conflictSummary = computed(() => {
  if (conflictedItemNames.value.length === 0) return '';
  if (conflictedItemNames.value.length === 1)
    return `${conflictedItemNames.value[0]}は他のユーザーが更新しました。最新の値へ戻しました。`;
  return `${conflictedItemNames.value.join('、')}は他のユーザーが更新しました。各道具の最新値を確認してください。`;
});

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
  if (open) {
    await openDeleteModal('button');
  } else closeDeleteModal();
});

async function loadChecklist(): Promise<void> {
  isLoading.value = true;
  isMissing.value = false;
  errorMessage.value = '';
  noticeMessage.value = '';
  itemSaveStates.value = {};
  resetCategoryExpansionStates();
  checklist.value = null;
  try {
    const loaded = await getDailyChecklist(workDate.value);
    checklist.value = loaded;
    selectedPeriod.value = loaded.periods[0]?.period ?? 'FULL_DAY';
    resetItemSaveStates(loaded);
    syncCategoryExpansionStates(loaded);
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
  resetItemSaveStates(saved);
  resetCategoryExpansionStates();
  syncCategoryExpansionStates(saved);
  noticeMessage.value = wasEditing
    ? '時間帯・作業内容を変更しました。'
    : 'この日のチェック表を作成しました。';
}

function handleCategoriesAdded(saved: DailyChecklist): void {
  const currentSelection = selectedPeriod.value;
  checklist.value = saved;
  categoryAdditionDialogOpen.value = false;
  selectedPeriod.value = saved.periods.some(
    (period) => period.period === currentSelection,
  )
    ? currentSelection
    : (saved.periods[0]?.period ?? 'FULL_DAY');
  resetItemSaveStates(saved, true);
  syncCategoryExpansionStates(saved, true);
  noticeMessage.value = `${periodLabel(selectedPeriod.value)}へ作業カテゴリを追加しました。`;
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

function saveStateFor(itemId: string): ItemSaveState {
  const existing = itemSaveStates.value[itemId];
  if (existing) return existing;
  const created: ItemSaveState = {
    status: 'saved',
    message: '',
    running: false,
    pending: null,
    period: selectedPeriod.value,
    workDate: workDate.value,
    conflict: null,
  };
  itemSaveStates.value[itemId] = created;
  return created;
}

function resetItemSaveStates(
  saved: DailyChecklist,
  preserveExisting = false,
): void {
  const states: Record<string, ItemSaveState> = {};
  for (const period of saved.periods) {
    for (const item of period.items) {
      const existing = preserveExisting
        ? itemSaveStates.value[item.id]
        : undefined;
      states[item.id] = existing
        ? {
            ...existing,
            period: period.period,
            workDate: saved.workDate,
          }
        : {
            status: 'saved',
            message: '',
            running: false,
            pending: null,
            period: period.period,
            workDate: saved.workDate,
            conflict: null,
          };
    }
  }
  itemSaveStates.value = states;
}

function resetCategoryExpansionStates(): void {
  expandedCategories.value = {
    FULL_DAY: {},
    MORNING: {},
    AFTERNOON: {},
  };
}

function syncCategoryExpansionStates(
  saved: DailyChecklist,
  preserveExisting = false,
): void {
  const next: Record<ChecklistPeriod, Record<string, boolean>> = {
    FULL_DAY: {},
    MORNING: {},
    AFTERNOON: {},
  };
  for (const period of saved.periods) {
    const categoryNames = new Set([
      ...period.items.map((item) => item.categoryName),
      ...period.categories.map((category) => category.categoryName),
    ]);
    for (const categoryName of categoryNames) {
      next[period.period][categoryName] = preserveExisting
        ? (expandedCategories.value[period.period][categoryName] ?? true)
        : true;
    }
  }
  expandedCategories.value = next;
}

function isCategoryExpanded(categoryName: string): boolean {
  return expandedCategories.value[selectedPeriod.value][categoryName] ?? true;
}

function setCategoryExpanded(categoryName: string, expanded: boolean): void {
  expandedCategories.value[selectedPeriod.value][categoryName] = expanded;
}

function toggleCategory(categoryName: string): void {
  setCategoryExpanded(categoryName, !isCategoryExpanded(categoryName));
}

function setAllCategoriesExpanded(expanded: boolean): void {
  for (const group of groupedItems.value) {
    setCategoryExpanded(group.categoryName, expanded);
  }
}

function expandCategory(
  period: ChecklistPeriod,
  categoryName: string,
): void {
  expandedCategories.value[period][categoryName] = true;
}

function categoryPanelId(categoryName: string): string {
  const index = groupedItems.value.findIndex(
    (group) => group.categoryName === categoryName,
  );
  return `category-items-${currentPeriod.value?.id ?? 'unknown'}-${Math.max(index, 0)}`;
}

function categoryProgressLabel(group: (typeof groupedItems.value)[number]): string {
  return group.selectedCount === 0
    ? '持ち出し未設定'
    : `準備 ${group.prepared} / ${group.selectedCount}・${group.progress}%`;
}

function changeQuantity(item: DailyChecklistItem, quantity: number): void {
  const state = saveStateFor(item.id);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > item.stockQuantity) {
    state.status = 'failed';
    state.message = `0〜${item.stockQuantity}の整数で入力してください。`;
    return;
  }
  if (item.takeoutQuantity === quantity && !(quantity === 0 && item.checked))
    return;

  item.takeoutQuantity = quantity;
  if (quantity === 0) item.checked = false;
  queueItemSave(item);
}

function handleQuantityChange(item: DailyChecklistItem, event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const quantity = Number(input.value);
  changeQuantity(item, quantity);
  // 不正値を画面へ残さず、最後に保存済みまたは保存待ちの値へ戻す。
  input.value = String(item.takeoutQuantity);
}

function changeChecked(item: DailyChecklistItem, checked: boolean): void {
  if (item.takeoutQuantity === 0) return;
  item.checked = checked;
  queueItemSave(item);
}

function queueItemSave(item: DailyChecklistItem): void {
  const state = saveStateFor(item.id);
  // 同じ道具を再操作した時点で、利用者が競合内容を確認したものとして警告を解除する。
  state.conflict = null;
  state.pending = {
    takeoutQuantity: item.takeoutQuantity,
    checked: item.checked,
  };
  state.message = '';
  state.status = 'saving';
  if (!state.running) void drainItemSaveQueue(item, state);
}

/**
 * 同じ行の更新を必ず直列化する。先の応答versionを次のリクエストへ渡すため、
 * 利用者自身の高速な連続操作を競合として誤検知しない。
 */
async function drainItemSaveQueue(
  item: DailyChecklistItem,
  state: ItemSaveState,
): Promise<void> {
  state.running = true;
  try {
    while (state.pending) {
      const requested = state.pending;
      state.pending = null;
      state.status = 'saving';
      try {
        const saved = await updateDailyChecklistItem(
          state.workDate,
          state.period,
          item.id,
          { ...requested, version: item.version },
        );
        const hasNewerInput = state.pending !== null;
        item.version = saved.version;
        item.updatedAt = saved.updatedAt;
        if (!hasNewerInput) Object.assign(item, saved);
        state.status = hasNewerInput ? 'saving' : 'saved';
        state.message = '';
      } catch (error) {
        const currentItem = currentItemFromConflict(error);
        if (currentItem) {
          Object.assign(item, currentItem);
          state.message = '';
          state.status = 'saved';
          state.conflict = {
            takeoutQuantity: currentItem.takeoutQuantity,
            checked: currentItem.checked,
          };
          expandCategory(state.period, item.categoryName);
        } else {
          state.message = itemSaveMessageFor(error);
          state.status = 'failed';
          expandCategory(state.period, item.categoryName);
        }
        state.pending = null;
        break;
      }
    }
  } finally {
    state.running = false;
  }
}

function closeConflictNotice(itemId: string): void {
  const state = itemSaveStates.value[itemId];
  if (state) state.conflict = null;
}

function retryItemSave(item: DailyChecklistItem): void {
  queueItemSave(item);
}

function saveStatusLabel(itemId: string): string {
  const status = saveStateFor(itemId).status;
  if (status === 'saving') return '保存中';
  if (status === 'failed') return '保存失敗';
  return '保存済み';
}

function currentItemFromConflict(error: unknown): DailyChecklistItem | null {
  if (
    !(error instanceof ApiError) ||
    error.code !== 'CHECKLIST_ITEM_UPDATE_CONFLICT' ||
    typeof error.details !== 'object' ||
    error.details === null ||
    !('currentItem' in error.details)
  ) {
    return null;
  }
  const currentItem = error.details.currentItem as Record<string, unknown>;
  if (
    typeof currentItem !== 'object' ||
    currentItem === null ||
    typeof currentItem.id !== 'string' ||
    typeof currentItem.sourceToolId !== 'string' ||
    typeof currentItem.toolName !== 'string' ||
    typeof currentItem.categoryName !== 'string' ||
    typeof currentItem.stockQuantity !== 'number' ||
    typeof currentItem.takeoutQuantity !== 'number' ||
    typeof currentItem.checked !== 'boolean' ||
    typeof currentItem.version !== 'number' ||
    typeof currentItem.updatedAt !== 'string'
  ) {
    return null;
  }
  return currentItem as unknown as DailyChecklistItem;
}

function itemSaveMessageFor(error: unknown): string {
  if (!(error instanceof ApiError))
    return '保存できませんでした。通信環境を確認して再試行してください。';
  const messages: Record<string, string> = {
    CHECKLIST_ITEM_QUANTITY_INVALID: '持ち出し数が在庫数を超えています。',
    CHECKLIST_ITEM_CHECK_INVALID:
      '持ち出し数が0の道具は準備済みにできません。',
    CHECKLIST_PAST_DATE: '過去日の内容は更新できません。',
    CHECKLIST_NOT_FOUND:
      'このチェック表は変更または削除されています。再読み込みしてください。',
    CHECKLIST_PERIOD_NOT_FOUND:
      'この時間帯は変更されています。再読み込みしてください。',
    CHECKLIST_ITEM_NOT_FOUND:
      'この道具は変更されています。再読み込みしてください。',
  };
  return (error.code && messages[error.code]) || error.message;
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
        <h1
          class="mt-2 text-3xl font-black tracking-tight"
          data-page-heading
          tabindex="-1"
        >
          日別チェック
        </h1>
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
      aria-labelledby="date-period-settings-title"
    >
      <div class="flex items-center justify-between gap-3">
        <h2 id="date-period-settings-title" class="font-black sm:sr-only">日付と時間帯</h2>
        <button
          class="min-h-11 rounded-xl border border-[#aebfba] px-4 font-bold sm:hidden"
          type="button"
          :aria-expanded="settingsExpanded"
          aria-controls="date-period-settings-content"
          @click="settingsExpanded = !settingsExpanded"
        >
          {{ settingsExpanded ? '閉じる' : '変更する' }}
        </button>
      </div>
      <div
        id="date-period-settings-content"
        class="mt-4 sm:mt-0 sm:block"
        :class="settingsExpanded ? 'block' : 'hidden'"
      >
        <form
          class="flex flex-col gap-3 sm:flex-row sm:items-end"
          @submit.prevent="moveToSelectedDate"
        >
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
            <button
              class="min-h-11 rounded-xl bg-[#102a2e] px-5 font-bold text-white"
              type="submit"
            >
              この日を表示
            </button>
            <button
              class="min-h-11 rounded-xl border border-[#aebfba] px-5 font-bold"
              type="button"
              @click="moveToToday"
            >
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
            :class="
              selectedPeriod === period.period ? 'bg-white shadow-sm' : ''
            "
            type="button"
            :aria-pressed="selectedPeriod === period.period"
            @click="selectedPeriod = period.period"
          >
            {{ periodLabel(period.period) }}
          </button>
        </div>
      </div>
    </section>

    <AppNotice v-if="noticeMessage" class="mt-6" tone="success">
      {{ noticeMessage }}
    </AppNotice>
    <AppNotice
      v-if="conflictSummary"
      class="mt-4"
      tone="warning"
      title="他のユーザーによる更新を検出しました"
    >
      {{ conflictSummary }} 該当する道具行の内容を確認してください。
    </AppNotice>
    <p v-if="isLoading" class="mt-8 text-center" role="status">
      日別チェックを読み込み中…
    </p>
    <AppNotice
      v-else-if="errorMessage"
      class="mt-6"
      tone="error"
      title="日別チェックを読み込めませんでした"
    >
      {{ errorMessage }}
      <button
        class="ml-2 min-h-11 font-bold underline"
        type="button"
        @click="loadChecklist"
      >
        再読み込み
      </button>
    </AppNotice>

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
        class="mt-6 rounded-2xl border border-[#cfdbd5] bg-white p-4 sm:p-5"
        aria-label="チェック表の設定"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="font-black">チェック表の設定</h2>
            <p class="mt-1 text-sm text-[#49666a]">
              登録を間違えた場合は、内容の変更またはこの日の表の削除ができます。
            </p>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row">
            <button
              class="min-h-11 rounded-xl bg-[#0b6b62] px-4 font-bold text-white disabled:opacity-60"
              type="button"
              :disabled="hasPendingItemSaves"
              @click="categoryAdditionDialogOpen = true"
            >
              作業カテゴリを追加
            </button>
            <button
              class="min-h-11 rounded-xl border border-[#0b6b62] px-4 font-bold text-[#0b6b62] disabled:opacity-60"
              type="button"
              :disabled="hasPendingItemSaves"
              @click="creationDialogOpen = true"
            >
              時間帯・作業内容を変更する
            </button>
            <button
              class="min-h-11 rounded-xl border border-[#b44b43] px-4 font-bold text-[#9a3832] disabled:opacity-60"
              type="button"
              :disabled="hasPendingItemSaves"
              @click="openDeleteDialog"
            >
              この日のチェック表を削除する
            </button>
          </div>
        </div>
      </section>

      <section
        class="mt-4 rounded-2xl border border-[#d7c9aa] bg-[#fffaf0] p-4 text-sm leading-6 text-[#624b2f] sm:p-5"
        aria-labelledby="snapshot-explanation-title"
      >
        <h2 id="snapshot-explanation-title" class="font-black text-[#5b4023]">
          このチェック表は作成時点の内容を保存しています
        </h2>
        <p class="mt-1">
          作成または設定変更した時点のカテゴリ・道具・在庫数を保存しているため、後からマスターへ追加・変更した内容は自動反映されません。
        </p>
        <p v-if="checklist.editable" class="mt-2 font-bold">
          最新の作業カテゴリと共通道具を取り込む場合は、「時間帯・作業内容を変更する」から新版を作成してください。
        </p>
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
        {{
          checklist.editable
            ? '数量と準備状態は、変更するたびに道具ごとに自動保存します。'
            : '数量と準備状態は、当時保存された内容を表示しています。'
        }}
      </p>

      <div
        v-if="groupedItems.length > 0"
        class="mt-5 flex flex-wrap justify-end gap-2"
        aria-label="カテゴリ一覧の開閉"
      >
        <button
          class="min-h-11 rounded-xl border border-[#aebfba] bg-white px-4 text-sm font-bold"
          type="button"
          @click="setAllCategoriesExpanded(true)"
        >
          すべて開く
        </button>
        <button
          class="min-h-11 rounded-xl border border-[#aebfba] bg-white px-4 text-sm font-bold"
          type="button"
          @click="setAllCategoriesExpanded(false)"
        >
          すべて閉じる
        </button>
      </div>

      <div v-if="groupedItems.length > 0" class="mt-3 space-y-3">
        <section
          v-for="group in groupedItems"
          :key="group.categoryName"
          class="overflow-hidden rounded-2xl border bg-white shadow-sm"
          :class="
            group.hasSaveFailure || group.hasConflict
              ? 'border-[#dc8b45] ring-2 ring-[#f4c792]/50'
              : 'border-[#cfdbd5]'
          "
        >
          <h2>
            <button
              class="flex min-h-14 w-full flex-wrap items-center gap-3 bg-[#f7faf7] px-4 py-3 text-left sm:flex-nowrap sm:px-5"
              type="button"
              :aria-expanded="isCategoryExpanded(group.categoryName)"
              :aria-controls="categoryPanelId(group.categoryName)"
              @click="toggleCategory(group.categoryName)"
            >
              <span class="w-5 shrink-0 text-center" aria-hidden="true">
                {{ isCategoryExpanded(group.categoryName) ? '▼' : '▶' }}
              </span>
              <span class="min-w-[7rem] flex-1">
                <span class="block text-lg font-black">{{ group.categoryName }}</span>
                <span class="text-xs font-bold text-[#49666a]">{{ group.items.length }}種類</span>
              </span>
              <span
                v-if="group.hasSaveFailure || group.hasConflict"
                class="shrink-0 rounded-full bg-[#fff0df] px-2 py-1 text-xs font-black text-[#9a4d16]"
              >
                ⚠ {{ group.hasConflict ? '競合あり' : '保存失敗あり' }}
              </span>
              <span class="basis-full pl-8 text-left text-sm font-black text-[#0b6b62] sm:basis-auto sm:pl-0 sm:text-right">
                {{ categoryProgressLabel(group) }}
              </span>
            </button>
          </h2>
          <ul
            v-show="isCategoryExpanded(group.categoryName)"
            :id="categoryPanelId(group.categoryName)"
            class="divide-y divide-[#e2e9e5] border-t border-[#cfdbd5]"
          >
            <li
              v-for="item in group.items"
              :key="item.id"
              class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-4 transition-colors sm:flex-nowrap sm:gap-4 sm:px-5"
              :class="
                saveStateFor(item.id).conflict
                  ? 'bg-[#fff4e8] ring-2 ring-inset ring-[#dc8b45]'
                  : ''
              "
            >
              <div class="min-w-[7rem] flex-1">
                <strong class="break-words">{{ item.toolName }}</strong>
                <span class="ml-2 text-sm text-[#49666a]">在庫 {{ item.stockQuantity }}</span>
              </div>
              <template v-if="checklist.editable">
                <div class="flex items-center gap-1" role="group" :aria-label="`${item.toolName}の数量操作`">
                  <button
                    class="min-h-11 min-w-11 rounded-lg border border-[#aebfba] bg-white font-black disabled:opacity-40"
                    type="button"
                    :aria-label="`${item.toolName}を1減らす`"
                    :disabled="item.takeoutQuantity === 0"
                    @click="changeQuantity(item, item.takeoutQuantity - 1)"
                  >
                    −
                  </button>
                  <input
                    class="min-h-11 w-14 rounded-lg border border-[#aebfba] px-1 text-center font-bold"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    :max="item.stockQuantity"
                    step="1"
                    :value="item.takeoutQuantity"
                    :aria-label="`${item.toolName}の持ち出し数`"
                    @change="handleQuantityChange(item, $event)"
                  />
                  <button
                    class="min-h-11 min-w-11 rounded-lg border border-[#aebfba] bg-white font-black disabled:opacity-40"
                    type="button"
                    :aria-label="`${item.toolName}を1増やす`"
                    :disabled="item.takeoutQuantity === item.stockQuantity"
                    @click="changeQuantity(item, item.takeoutQuantity + 1)"
                  >
                    ＋
                  </button>
                </div>
                <div class="ml-auto flex min-w-[6.5rem] flex-col items-end gap-1 sm:ml-0">
                  <label class="flex min-h-11 cursor-pointer items-center gap-2 font-bold">
                    <input
                      type="checkbox"
                      :checked="item.checked"
                      :disabled="item.takeoutQuantity === 0"
                      :aria-label="`${item.toolName}を準備済みにする`"
                      @change="changeChecked(item, ($event.currentTarget as HTMLInputElement).checked)"
                    />
                    <span>{{ item.checked ? '準備済み' : '未準備' }}</span>
                  </label>
                  <span
                    class="text-xs font-bold"
                    :class="{
                      'text-[#0b6b62]': saveStateFor(item.id).status === 'saved',
                      'text-[#7a421e]': saveStateFor(item.id).status === 'saving',
                      'text-[#9a3832]': saveStateFor(item.id).status === 'failed',
                    }"
                    role="status"
                  >
                    {{ saveStatusLabel(item.id) }}
                  </span>
                </div>
                <div
                  v-if="saveStateFor(item.id).status === 'failed'"
                  class="basis-full text-right text-xs text-[#9a3832]"
                  role="alert"
                >
                  <span>{{ saveStateFor(item.id).message }}</span>
                  <button class="ml-2 font-bold underline" type="button" @click="retryItemSave(item)">
                    再試行
                  </button>
                </div>
                <div
                  v-if="saveStateFor(item.id).conflict"
                  class="basis-full rounded-xl border border-[#dc8b45] bg-[#fffaf0] p-3 text-sm leading-6 text-[#7a421e]"
                  role="alert"
                >
                  <strong class="block">
                    ⚠ 他のユーザーが更新したため、最新値へ戻しました。
                  </strong>
                  <span class="block">
                    最新値: 数量{{ saveStateFor(item.id).conflict?.takeoutQuantity }}・{{ saveStateFor(item.id).conflict?.checked ? '準備済み' : '未準備' }}
                  </span>
                  <span>内容を確認して、必要であればもう一度操作してください。</span>
                  <button
                    class="ml-2 font-bold underline"
                    type="button"
                    :aria-label="`${item.toolName}の競合メッセージを閉じる`"
                    @click="closeConflictNotice(item.id)"
                  >
                    閉じる
                  </button>
                </div>
              </template>
              <template v-else>
                <span class="whitespace-nowrap text-sm"><strong>持出</strong> {{ item.takeoutQuantity }}</span>
                <span
                  class="w-fit rounded-full px-3 py-1 text-sm font-bold"
                  :class="item.checked ? 'bg-[#d8eee8] text-[#24764d]' : 'bg-[#e8eee9] text-[#49666a]'"
                >
                  {{ item.checked ? '準備済み' : '未準備' }}
                </span>
              </template>
            </li>
            <li
              v-if="group.items.length === 0"
              class="px-4 py-5 text-center text-sm text-[#49666a] sm:px-5"
            >
              このカテゴリに表示する道具はありません。
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

    <ChecklistCategoryAdditionDialog
      v-if="currentPeriod"
      :open="categoryAdditionDialogOpen"
      :date="workDate"
      :period="currentPeriod.period"
      :current-category-ids="currentPeriod.categories.map((category) => category.sourceCategoryId)"
      @close="categoryAdditionDialogOpen = false"
      @saved="handleCategoriesAdded"
    />

    <dialog
      ref="deleteDialog"
      class="app-dialog w-[min(92vw,32rem)] rounded-3xl border-0 bg-white p-0 text-[#102a2e] shadow-2xl"
      aria-labelledby="delete-checklist-title"
      @cancel.prevent="closeDeleteDialog"
      @keydown="trapDeleteDialogFocus"
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
      <footer class="app-dialog-actions border-t border-[#cfdbd5] bg-[#fffdf8] px-6 py-4">
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
