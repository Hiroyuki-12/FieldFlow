<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import {
  addDailyChecklistCategories,
  type ChecklistCategoryOption,
  type ChecklistPeriod,
  type DailyChecklist,
  listChecklistCategoryOptions,
} from '../api/daily-checklists';
import { ApiError } from '../api/errors';
import { formatJapaneseDate } from '../utils/date';

const props = defineProps<{
  open: boolean;
  date: string;
  period: ChecklistPeriod;
  currentCategoryIds: string[];
}>();

const emit = defineEmits<{
  close: [];
  saved: [checklist: DailyChecklist];
}>();

const dialog = ref<HTMLDialogElement | null>(null);
const categories = ref<ChecklistCategoryOption[]>([]);
const selectedCategoryIds = ref<string[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref('');
const availableCategories = computed(() => {
  const currentIds = new Set(props.currentCategoryIds);
  return categories.value.filter((category) => !currentIds.has(category.id));
});

watch(
  () => props.open,
  async (open) => {
    if (open) {
      selectedCategoryIds.value = [];
      categories.value = [];
      errorMessage.value = '';
      await nextTick();
      if (!dialog.value?.open) {
        if (typeof dialog.value?.showModal === 'function')
          dialog.value.showModal();
        else dialog.value?.setAttribute('open', '');
      }
      dialog.value?.querySelector<HTMLElement>('button, input')?.focus();
      await loadCategories();
    } else if (dialog.value?.open) {
      if (typeof dialog.value.close === 'function') dialog.value.close();
      else dialog.value.removeAttribute('open');
    }
  },
);

async function loadCategories(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    categories.value = await listChecklistCategoryOptions();
  } catch (error) {
    errorMessage.value = messageFor(error);
  } finally {
    isLoading.value = false;
  }
}

function requestClose(): void {
  if (!isSaving.value) emit('close');
}

async function submit(): Promise<void> {
  if (selectedCategoryIds.value.length === 0) {
    errorMessage.value = '追加する作業カテゴリを1つ以上選択してください。';
    return;
  }
  isSaving.value = true;
  errorMessage.value = '';
  try {
    const saved = await addDailyChecklistCategories(props.date, props.period, {
      categoryIds: selectedCategoryIds.value,
    });
    emit('saved', saved);
  } catch (error) {
    errorMessage.value = messageFor(error);
  } finally {
    isSaving.value = false;
  }
}

function periodLabel(): string {
  if (props.period === 'MORNING') return '午前';
  if (props.period === 'AFTERNOON') return '午後';
  return '1日通し';
}

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError))
    return '作業カテゴリを追加できませんでした。もう一度お試しください。';
  const messages: Record<string, string> = {
    CHECKLIST_CATEGORY_ALREADY_ADDED:
      '別の利用者が先にカテゴリを追加しました。画面を閉じて最新の状態を確認してください。',
    CHECKLIST_TOOL_ALREADY_ADDED:
      '同じ道具がすでに含まれるため追加できません。管理者へカテゴリ設定の確認を依頼してください。',
    CATEGORY_NOT_FOUND:
      '選択した作業カテゴリが見つかりません。候補を読み直してください。',
    CATEGORY_INACTIVE:
      '選択した作業カテゴリは利用停止になりました。候補を読み直してください。',
    CHECKLIST_CATEGORY_TYPE_INVALID: '共通カテゴリは追加できません。',
    CHECKLIST_PAST_DATE: '過去日へ作業カテゴリは追加できません。',
    CHECKLIST_NOT_FOUND:
      'このチェック表はすでに変更または削除されています。最新の状態を確認してください。',
    CHECKLIST_PERIOD_NOT_FOUND:
      'この時間帯はすでに変更されています。最新の状態を確認してください。',
  };
  return (error.code && messages[error.code]) || error.message;
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(94vw,38rem)] rounded-3xl border-0 bg-white p-0 text-[#102a2e] shadow-2xl backdrop:bg-black/50"
    aria-labelledby="category-addition-title"
    @cancel.prevent="requestClose"
  >
    <form class="flex max-h-[90vh] flex-col" @submit.prevent="submit">
      <header class="shrink-0 border-b border-[#cfdbd5] px-5 py-5 sm:px-7">
        <p class="text-xs font-black tracking-[0.16em] text-[#0b6b62]">ADD WORK CATEGORY</p>
        <h2 id="category-addition-title" class="mt-1 text-2xl font-black">
          作業カテゴリを追加
        </h2>
        <p class="mt-2 text-sm leading-6 text-[#49666a]">
          {{ formatJapaneseDate(date) }}・{{ periodLabel() }}へ作業カテゴリを追加します。
        </p>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        <section
          class="mb-5 rounded-2xl border border-[#b8d2ca] bg-[#edf7f3] p-4 text-sm leading-6 text-[#315b59]"
          aria-labelledby="category-addition-impact-title"
        >
          <h3 id="category-addition-impact-title" class="font-black text-[#153f3d]">
            この操作で追加される内容
          </h3>
          選択した作業カテゴリと、そのカテゴリの現在有効な道具を追加します。共通道具は再取得しないため、後から共通マスターへ追加した道具はこの操作では反映されません。
        </section>

        <p
          v-if="errorMessage"
          class="mb-4 rounded-xl bg-[#fbe4e1] p-3 text-sm text-[#8d2f2b]"
          role="alert"
        >
          {{ errorMessage }}
        </p>
        <p v-if="isLoading" role="status">作業カテゴリを読み込み中…</p>
        <p
          v-else-if="availableCategories.length === 0"
          class="rounded-xl bg-[#e8eee9] p-4 text-sm text-[#49666a]"
        >
          追加できる作業カテゴリはありません。
        </p>
        <fieldset v-else>
          <legend class="font-black">追加するカテゴリ</legend>
          <p class="mt-1 text-sm text-[#49666a]">1つ以上選択してください。</p>
          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <label
              v-for="category in availableCategories"
              :key="category.id"
              class="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-[#cfdbd5] px-4 py-3"
            >
              <input
                v-model="selectedCategoryIds"
                type="checkbox"
                :value="category.id"
              />
              <span class="font-bold">{{ category.name }}</span>
            </label>
          </div>
        </fieldset>
      </div>

      <footer class="flex shrink-0 justify-end gap-3 border-t border-[#cfdbd5] bg-[#fffdf8] px-5 py-4 sm:px-7">
        <button
          class="min-h-11 rounded-xl border border-[#aebfba] px-5 font-bold"
          type="button"
          :disabled="isSaving"
          @click="requestClose"
        >
          キャンセル
        </button>
        <button
          class="min-h-11 rounded-xl bg-[#e87934] px-5 font-bold text-white disabled:opacity-60"
          type="submit"
          :disabled="isLoading || isSaving || availableCategories.length === 0"
        >
          {{ isSaving ? '追加中…' : '選択したカテゴリを追加' }}
        </button>
      </footer>
    </form>
  </dialog>
</template>
