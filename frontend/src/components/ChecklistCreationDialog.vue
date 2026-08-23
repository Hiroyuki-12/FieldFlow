<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import {
  type ChecklistCategoryOption,
  type ChecklistPeriod,
  createDailyChecklist,
  type DailyChecklist,
  listChecklistCategoryOptions,
  type ScheduleMode,
  updateDailyChecklistConfiguration,
} from '../api/daily-checklists';
import { ApiError } from '../api/errors';
import { useModalDialog } from '../composables/useModalDialog';
import { formatJapaneseDate } from '../utils/date';

const props = defineProps<{
  open: boolean;
  date: string;
  checklist?: DailyChecklist | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [checklist: DailyChecklist];
}>();

const { dialog, openModal, closeModal, trapFocus } = useModalDialog();
const categories = ref<ChecklistCategoryOption[]>([]);
const scheduleMode = ref<ScheduleMode>('FULL_DAY');
const activeSplitPeriod = ref<ChecklistPeriod>('MORNING');
const selectedCategoryIds = ref<Record<ChecklistPeriod, string[]>>({
  FULL_DAY: [],
  MORNING: [],
  AFTERNOON: [],
});
const isLoadingCategories = ref(false);
const isSaving = ref(false);
const errorMessage = ref('');
const selectionErrorMessage = ref('');
const confirmationRequired = ref(false);
const categorySelectionFieldset = ref<HTMLFieldSetElement | null>(null);
const isEditing = computed(() => Boolean(props.checklist));
const hasEnteredItems = computed(() =>
  Boolean(
    props.checklist?.periods.some((period) =>
      period.items.some((item) => item.takeoutQuantity > 0 || item.checked),
    ),
  ),
);
const emptyCategoryMessage =
  '選択できる作業カテゴリがありません。管理者へカテゴリの登録・設定確認を依頼してください。';

type SplitPeriod = Extract<ChecklistPeriod, 'MORNING' | 'AFTERNOON'>;

/**
 * 必須選択の条件と案内文を一か所で導出する。
 * ボタンとsubmitが別々の式を持つと、押せるのに保存できない状態へ戻るため、必ずこの結果を共有する。
 */
const categorySelectionState = computed(() => {
  if (scheduleMode.value === 'FULL_DAY') {
    const isValid = selectedCategoryIds.value.FULL_DAY.length > 0;
    return {
      isValid,
      missingSplitPeriods: [] as SplitPeriod[],
      disabledReason: isValid
        ? ''
        : `作業カテゴリを1つ以上選択すると${isEditing.value ? '保存' : '作成'}できます。`,
      validationMessage: isValid
        ? ''
        : '作業カテゴリを1つ以上選択してください。',
    };
  }

  const missingSplitPeriods = (['MORNING', 'AFTERNOON'] as const).filter(
    (period) => selectedCategoryIds.value[period].length === 0,
  );
  const isValid = missingSplitPeriods.length === 0;
  const validationMessage =
    missingSplitPeriods.length === 2
      ? '午前と午後の作業カテゴリを1つ以上選択してください。'
      : missingSplitPeriods.length === 1
        ? `${missingSplitPeriods[0] === 'MORNING' ? '午前' : '午後'}の作業カテゴリを1つ以上選択してください。`
        : '';

  return {
    isValid,
    missingSplitPeriods,
    disabledReason: validationMessage,
    validationMessage,
  };
});
const isSubmitDisabled = computed(
  () =>
    isSaving.value ||
    isLoadingCategories.value ||
    categories.value.length === 0 ||
    !categorySelectionState.value.isValid,
);
const submitDisabledReason = computed(() => {
  if (isSaving.value)
    return `${isEditing.value ? '保存' : '作成'}処理中です。完了までお待ちください。`;
  if (isLoadingCategories.value) return '作業カテゴリを読み込んでいます。';
  if (categories.value.length === 0) return emptyCategoryMessage;
  return categorySelectionState.value.disabledReason;
});
const categoryDescriptionIds = computed(() =>
  [
    'checklist-category-help',
    isLoadingCategories.value ? 'checklist-category-loading' : '',
    categories.value.length === 0 && !isLoadingCategories.value
      ? 'checklist-category-empty'
      : '',
    selectionErrorMessage.value ? 'checklist-category-error' : '',
  ]
    .filter(Boolean)
    .join(' '),
);

watch(
  () => props.open,
  async (open) => {
    if (open) {
      resetForm();
      await openModal('input, button');
      await loadCategories();
    } else closeModal();
  },
);

function resetForm(): void {
  scheduleMode.value = props.checklist?.scheduleMode ?? 'FULL_DAY';
  // 1日通しから午前・午後へ切り替えた直後も、最初の入力先を必ず午前にする。
  activeSplitPeriod.value = 'MORNING';
  const selections: Record<ChecklistPeriod, string[]> = {
    FULL_DAY: [],
    MORNING: [],
    AFTERNOON: [],
  };
  for (const period of props.checklist?.periods ?? []) {
    selections[period.period] = period.categories.map(
      (category) => category.sourceCategoryId,
    );
  }
  selectedCategoryIds.value = selections;
  categories.value = [];
  errorMessage.value = '';
  selectionErrorMessage.value = '';
  confirmationRequired.value = false;
}

watch(
  [scheduleMode, selectedCategoryIds],
  () => {
    confirmationRequired.value = false;
    if (selectionErrorMessage.value) {
      selectionErrorMessage.value =
        categorySelectionState.value.validationMessage;
    }
  },
  { deep: true },
);

async function loadCategories(): Promise<void> {
  isLoadingCategories.value = true;
  try {
    categories.value = await listChecklistCategoryOptions();
  } catch (error) {
    errorMessage.value = messageFor(error);
  } finally {
    isLoadingCategories.value = false;
  }
}

function requestClose(): void {
  if (!isSaving.value) emit('close');
}

/**
 * disabled属性が外れる前のEnter送信やプログラム送信にも備え、最初に不足している時間帯を表示して入力欄へ案内する。
 * モバイルの長いダイアログでも、エラーだけが上に出て入力場所を見失わないようにする。
 */
async function focusInvalidCategorySelection(): Promise<void> {
  if (scheduleMode.value === 'SPLIT') {
    activeSplitPeriod.value =
      categorySelectionState.value.missingSplitPeriods[0] ?? 'MORNING';
  }
  await nextTick();
  const firstCheckbox =
    categorySelectionFieldset.value?.querySelector<HTMLInputElement>(
      'input[type="checkbox"]:not(:disabled)',
    );
  const focusTarget = firstCheckbox ?? categorySelectionFieldset.value;
  // 修正をすぐ始められる入力へ直接フォーカスし、モーダル内のフォーカストラップも維持する。
  focusTarget?.focus({ preventScroll: true });
  focusTarget?.scrollIntoView?.({
    behavior: 'smooth',
    block: 'center',
  });
}

async function submit(): Promise<void> {
  // disabledを迂回したsubmitでも、読込案内・0件案内を選択エラーと競合させず、APIも二重に呼ばない。
  if (
    isSaving.value ||
    isLoadingCategories.value ||
    categories.value.length === 0
  )
    return;

  const periods =
    scheduleMode.value === 'FULL_DAY'
      ? [
          {
            period: 'FULL_DAY' as const,
            categoryIds: selectedCategoryIds.value.FULL_DAY,
          },
        ]
      : [
          {
            period: 'MORNING' as const,
            categoryIds: selectedCategoryIds.value.MORNING,
          },
          {
            period: 'AFTERNOON' as const,
            categoryIds: selectedCategoryIds.value.AFTERNOON,
          },
        ];

  // UIと同じcomputedを使い、表示上の有効条件と防御的バリデーションの食い違いを防ぐ。
  if (!categorySelectionState.value.isValid) {
    selectionErrorMessage.value =
      categorySelectionState.value.validationMessage;
    errorMessage.value = '';
    await focusInvalidCategorySelection();
    return;
  }

  if (isEditing.value && hasEnteredItems.value && !confirmationRequired.value) {
    confirmationRequired.value = true;
    return;
  }

  isSaving.value = true;
  errorMessage.value = '';
  selectionErrorMessage.value = '';
  try {
    // SPLITも1回で送り、午前・午後の片方だけが残る状態を防ぐ。
    const input = { scheduleMode: scheduleMode.value, periods };
    const saved = props.checklist
      ? await updateDailyChecklistConfiguration(props.date, {
          ...input,
          checklistId: props.checklist.id,
          version: props.checklist.version,
          confirmDataLoss: confirmationRequired.value,
        })
      : await createDailyChecklist(props.date, input);
    emit('saved', saved);
  } catch (error) {
    errorMessage.value = messageFor(error);
  } finally {
    isSaving.value = false;
  }
}

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError))
    return isEditing.value
      ? '時間帯・作業内容を変更できませんでした。もう一度お試しください。'
      : '日別チェックを作成できませんでした。もう一度お試しください。';
  const messages: Record<string, string> = {
    CHECKLIST_ALREADY_CONFIGURED:
      'この日は別の方式で作成済みです。画面を閉じて最新の表を開き直してください。',
    CHECKLIST_PAST_DATE: '過去日の日別チェックは作成できません。',
    CATEGORY_NOT_FOUND:
      '選択した作業カテゴリが見つかりません。候補を読み直してください。',
    CATEGORY_INACTIVE:
      '選択した作業カテゴリは利用停止になりました。候補を読み直してください。',
    COMMON_CATEGORY_UNAVAILABLE:
      '共通カテゴリを利用できません。管理者へ設定の確認を依頼してください。',
    CHECKLIST_UPDATE_CONFLICT:
      '別の利用者が先に変更しました。閉じて最新の表を読み直してください。',
    CHECKLIST_NOT_FOUND:
      'このチェック表はすでに削除されています。閉じて最新の状態を確認してください。',
    CHECKLIST_RECONFIGURATION_DATA_LOSS:
      '入力済み内容への影響を確認してから、もう一度保存してください。',
  };
  return (error.code && messages[error.code]) || error.message;
}
</script>

<template>
  <dialog
    ref="dialog"
    class="app-dialog w-[min(94vw,42rem)] rounded-3xl border-0 bg-white p-0 text-[#102a2e] shadow-2xl"
    aria-labelledby="checklist-form-title"
    @cancel.prevent="requestClose"
    @keydown="trapFocus"
  >
    <form class="flex max-h-[90dvh] flex-col" @submit.prevent="submit">
      <header class="shrink-0 border-b border-[#cfdbd5] px-5 py-5 sm:px-7">
        <p class="text-xs font-black tracking-[0.16em] text-[#0b6b62]">
          {{ isEditing ? 'EDIT DAILY CHECK' : 'NEW DAILY CHECK' }}
        </p>
        <h2 id="checklist-form-title" class="mt-1 text-2xl font-black">
          {{
            isEditing
              ? `${formatJapaneseDate(date)}の時間帯・作業内容を変更`
              : `${formatJapaneseDate(date)}のチェック表を作成`
          }}
        </h2>
        <p class="mt-2 text-sm leading-6 text-[#49666a]">
          {{
            isEditing
              ? '最新のマスター内容から新版を作成します。保存前に入力値への影響を確認してください。'
              : '時間帯と作業カテゴリをまとめて選び、現在のマスター内容からチェック表を作成します。'
          }}
        </p>
      </header>

      <div class="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7">
        <section
          class="rounded-2xl border border-[#b8d2ca] bg-[#edf7f3] p-4 text-sm leading-6 text-[#315b59]"
          aria-labelledby="snapshot-impact-title"
        >
          <h3 id="snapshot-impact-title" class="font-black text-[#153f3d]">
            {{
              isEditing
                ? '設定変更で作成する新版について'
                : '作成時に保存される内容'
            }}
          </h3>
          <ul v-if="isEditing" class="mt-2 list-disc space-y-1 pl-5">
            <li>最新の作業カテゴリ・共通道具から新版を作成します。</li>
            <li>変更前の表は、取消された履歴として残ります。</li>
            <li>同じ時間帯・同じ道具の数量と準備状態だけを引き継ぎます。</li>
            <li>
              午前・午後から1日通しへ変更するなど、時間帯が変わる道具の入力値は引き継ぎません。
            </li>
          </ul>
          <p v-else class="mt-2">
            選択した作業カテゴリと現在有効な共通道具・在庫数を、作成時点の内容として保存します。作成後のマスター変更は自動では反映されません。
          </p>
        </section>

        <p
          v-if="errorMessage"
          class="rounded-xl bg-[#fbe4e1] p-3 text-sm text-[#8d2f2b]"
          role="alert"
        >
          {{ errorMessage }}
        </p>

        <div
          v-if="confirmationRequired"
          class="rounded-xl border border-[#e2a96f] bg-[#fff0df] p-4 text-sm leading-6 text-[#7a421e]"
          role="alert"
        >
          <strong class="block">入力済みの内容があります</strong>
          同じ時間帯・同じ道具の数量と準備状態は引き継ぎます。時間帯が変わる道具や、選択から外した道具の入力内容は新しい表には残りません。内容を確認して保存してください。
        </div>

        <fieldset>
          <legend class="font-black">作成方式</legend>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <label
              class="flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border p-4"
              :class="
                scheduleMode === 'FULL_DAY'
                  ? 'border-[#0b6b62] bg-[#e7f4ef]'
                  : 'border-[#cfdbd5]'
              "
            >
              <input v-model="scheduleMode" type="radio" value="FULL_DAY" />
              <span
                ><strong class="block">1日通し</strong
                ><small>1つの表で準備する</small></span
              >
            </label>
            <label
              class="flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border p-4"
              :class="
                scheduleMode === 'SPLIT'
                  ? 'border-[#0b6b62] bg-[#e7f4ef]'
                  : 'border-[#cfdbd5]'
              "
            >
              <input v-model="scheduleMode" type="radio" value="SPLIT" />
              <span
                ><strong class="block">午前・午後</strong
                ><small>時間帯ごとに分ける</small></span
              >
            </label>
          </div>
        </fieldset>

        <div
          v-if="scheduleMode === 'SPLIT'"
          class="grid grid-cols-2 rounded-xl bg-[#e8eee9] p-1"
          role="group"
          aria-label="設定する時間帯"
        >
          <button
            v-for="period in ['MORNING', 'AFTERNOON'] as const"
            :key="period"
            type="button"
            class="min-h-11 rounded-lg px-4 font-bold"
            :class="activeSplitPeriod === period ? 'bg-white shadow-sm' : ''"
            :aria-pressed="activeSplitPeriod === period"
            @click="activeSplitPeriod = period"
          >
            {{ period === 'MORNING' ? '午前' : '午後' }}
            <span class="text-xs text-[#49666a]">
              ({{ selectedCategoryIds[period].length }})
            </span>
          </button>
        </div>

        <fieldset
          ref="categorySelectionFieldset"
          class="rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-[#9ccfc2]"
          tabindex="-1"
          :aria-describedby="categoryDescriptionIds"
          :aria-invalid="selectionErrorMessage ? 'true' : undefined"
        >
          <legend class="font-black">
            {{
              scheduleMode === 'FULL_DAY'
                ? '1日通しの作業カテゴリ'
                : activeSplitPeriod === 'MORNING'
                  ? '午前の作業カテゴリ'
                  : '午後の作業カテゴリ'
            }}
          </legend>
          <p id="checklist-category-help" class="mt-1 text-sm text-[#49666a]">
            1つ以上選択してください。共通の道具は自動で追加されます。
          </p>
          <p
            v-if="isLoadingCategories"
            id="checklist-category-loading"
            class="mt-4"
            role="status"
          >
            作業カテゴリを読み込み中…
          </p>
          <p
            v-else-if="categories.length === 0"
            id="checklist-category-empty"
            class="mt-4 rounded-xl border border-[#d7c9aa] bg-[#fffaf0] p-3 text-sm font-bold text-[#624b2f]"
            role="status"
          >
            {{ emptyCategoryMessage }}
          </p>
          <div v-else class="mt-4 grid gap-3 sm:grid-cols-2">
            <label
              v-for="category in categories"
              :key="category.id"
              class="flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-[#cfdbd5] px-4 py-3"
            >
              <input
                v-if="scheduleMode === 'FULL_DAY'"
                v-model="selectedCategoryIds.FULL_DAY"
                type="checkbox"
                :value="category.id"
              />
              <input
                v-else-if="activeSplitPeriod === 'MORNING'"
                v-model="selectedCategoryIds.MORNING"
                type="checkbox"
                :value="category.id"
              />
              <input
                v-else
                v-model="selectedCategoryIds.AFTERNOON"
                type="checkbox"
                :value="category.id"
              />
              <span class="min-w-0 break-words font-bold">{{
                category.name
              }}</span>
            </label>
          </div>
          <p
            v-if="selectionErrorMessage"
            id="checklist-category-error"
            class="mt-3 rounded-xl bg-[#fbe4e1] p-3 text-sm font-bold text-[#8d2f2b]"
            role="alert"
          >
            {{ selectionErrorMessage }}
          </p>
        </fieldset>
      </div>

      <footer
        class="shrink-0 border-t border-[#cfdbd5] bg-[#fffdf8] px-5 py-4 sm:px-7"
      >
        <!-- 案内文が消えても領域を残し、選択のたびに操作ボタンが上下へ跳ねることを防ぐ。 -->
        <div class="min-h-16" aria-live="polite">
          <p
            v-if="submitDisabledReason"
            id="checklist-submit-disabled-reason"
            class="mb-3 rounded-xl bg-[#fff0df] px-3 py-2 text-sm font-bold leading-5 text-[#7a421e]"
            role="status"
          >
            <span aria-hidden="true">ℹ</span> {{ submitDisabledReason }}
          </p>
        </div>
        <div class="app-dialog-actions">
          <button
            type="button"
            class="min-h-11 rounded-xl border border-[#aebfba] px-5 font-bold"
            :disabled="isSaving"
            @click="requestClose"
          >
            キャンセル
          </button>
          <button
            type="submit"
            class="min-h-11 rounded-xl border border-transparent bg-[#e87934] px-5 font-bold text-white disabled:cursor-not-allowed disabled:border-[#c8d1cd] disabled:bg-[#dfe5e2] disabled:text-[#667a78] disabled:opacity-100"
            :disabled="isSubmitDisabled"
            :aria-describedby="
              submitDisabledReason
                ? 'checklist-submit-disabled-reason'
                : undefined
            "
          >
            {{
              isSaving
                ? isEditing
                  ? '保存中…'
                  : '作成中…'
                : confirmationRequired
                  ? '変更を確定する'
                  : isEditing
                    ? '変更を保存'
                    : 'チェック表を作成'
            }}
          </button>
        </div>
      </footer>
    </form>
  </dialog>
</template>
