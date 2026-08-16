<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';

import { ApiError } from '../api/errors';
import {
  createTool,
  listTools,
  type ManagedTool,
  type ToolCategoryOption,
  type ToolStatus,
  updateTool,
  updateToolStatus,
} from '../api/tools';
import { useAuthStore } from '../stores/auth';

type DialogMode = 'create' | 'edit' | 'status' | null;

const authStore = useAuthStore();
const tools = ref<ManagedTool[]>([]);
const categories = ref<ToolCategoryOption[]>([]);
const search = ref('');
const categoryId = ref('');
const status = ref<ToolStatus | ''>('');
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const isLoading = ref(false);
const isSaving = ref(false);
const notice = ref('');
const errorMessage = ref('');
const dialogMode = ref<DialogMode>(null);
const dialog = ref<HTMLDialogElement | null>(null);
const selectedTool = ref<ManagedTool | null>(null);
const form = ref({
  name: '',
  categoryId: '',
  stockQuantity: 0,
  displayOrder: 0,
});
let dialogTrigger: HTMLElement | null = null;

const isAdmin = computed(() => authStore.user?.role === 'ADMIN');
const pageCount = computed(() =>
  Math.max(1, Math.ceil(total.value / pageSize)),
);
const activeCategories = computed(() =>
  categories.value.filter((category) => category.status === 'ACTIVE'),
);
const dialogTitle = computed(() => {
  if (dialogMode.value === 'create') return '道具を作成';
  if (dialogMode.value === 'edit') return '道具を編集';
  return selectedTool.value?.status === 'ACTIVE'
    ? '利用停止の確認'
    : '再有効化の確認';
});

watch(dialogMode, async (mode) => {
  if (mode) {
    await nextTick();
    if (!dialog.value?.open) {
      if (typeof dialog.value?.showModal === 'function')
        dialog.value.showModal();
      else dialog.value?.setAttribute('open', '');
    }
    dialog.value?.querySelector<HTMLElement>('input, select, button')?.focus();
  } else if (dialog.value?.open) {
    if (typeof dialog.value.close === 'function') dialog.value.close();
    else dialog.value.removeAttribute('open');
    dialogTrigger?.focus();
  }
});

onMounted(loadTools);

async function loadTools(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await listTools({
      search: search.value,
      categoryId: categoryId.value,
      status: status.value,
      page: page.value,
      pageSize,
    });
    tools.value = response.items;
    categories.value = response.categories;
    total.value = response.total;
    // 削除ではなく絞り込み結果の変化でページが空になった場合、存在する最終ページへ戻す。
    if (page.value > pageCount.value) {
      page.value = pageCount.value;
      await loadTools();
    }
  } catch (error) {
    errorMessage.value = messageFor(error);
  } finally {
    isLoading.value = false;
  }
}

async function applyFilters(): Promise<void> {
  page.value = 1;
  await loadTools();
}

async function movePage(nextPage: number): Promise<void> {
  if (nextPage < 1 || nextPage > pageCount.value || nextPage === page.value)
    return;
  page.value = nextPage;
  await loadTools();
}

function openCreate(event: Event): void {
  if (!isAdmin.value) return;
  errorMessage.value = '';
  dialogTrigger = event.currentTarget as HTMLElement;
  selectedTool.value = null;
  form.value = {
    name: '',
    categoryId: activeCategories.value[0]?.id ?? '',
    stockQuantity: 0,
    displayOrder: 0,
  };
  dialogMode.value = 'create';
}

function openEdit(tool: ManagedTool, event: Event): void {
  if (!isAdmin.value) return;
  errorMessage.value = '';
  dialogTrigger = event.currentTarget as HTMLElement;
  selectedTool.value = tool;
  form.value = {
    name: tool.name,
    categoryId: tool.categoryId,
    stockQuantity: tool.stockQuantity,
    displayOrder: tool.displayOrder,
  };
  dialogMode.value = 'edit';
}

function openStatus(tool: ManagedTool, event: Event): void {
  if (!isAdmin.value) return;
  errorMessage.value = '';
  dialogTrigger = event.currentTarget as HTMLElement;
  selectedTool.value = tool;
  dialogMode.value = 'status';
}

function closeDialog(): void {
  if (isSaving.value) return;
  dialogMode.value = null;
  selectedTool.value = null;
  errorMessage.value = '';
}

async function saveTool(): Promise<void> {
  const name = form.value.name.trim();
  const stockQuantity = Number(form.value.stockQuantity);
  const displayOrder = Number(form.value.displayOrder);
  const selectedCategory = categories.value.find(
    (category) => category.id === form.value.categoryId,
  );
  if (
    !name ||
    name.length > 100 ||
    !selectedCategory ||
    selectedCategory.status !== 'ACTIVE' ||
    !isBoundedInteger(stockQuantity) ||
    !isBoundedInteger(displayOrder)
  ) {
    errorMessage.value =
      '名前は1〜100文字、有効なカテゴリ、在庫数・表示順は0〜9999の整数で入力してください。';
    return;
  }

  isSaving.value = true;
  errorMessage.value = '';
  const input = {
    name,
    categoryId: selectedCategory.id,
    stockQuantity,
    displayOrder,
  };
  try {
    if (dialogMode.value === 'create') {
      const created = await createTool(input);
      notice.value = created.name + 'を作成しました。';
    } else if (selectedTool.value) {
      const updated = await updateTool(selectedTool.value.id, {
        ...input,
        version: selectedTool.value.version,
      });
      notice.value = updated.name + 'を更新しました。';
    }
    dialogMode.value = null;
    await loadTools();
  } catch (error) {
    errorMessage.value = messageFor(error);
  } finally {
    isSaving.value = false;
  }
}

async function changeStatus(): Promise<void> {
  if (!selectedTool.value) return;
  isSaving.value = true;
  errorMessage.value = '';
  const nextStatus: ToolStatus =
    selectedTool.value.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  try {
    const updated = await updateToolStatus(selectedTool.value, nextStatus);
    notice.value =
      updated.name +
      'を' +
      (nextStatus === 'ACTIVE' ? '再有効化' : '利用停止') +
      'しました。';
    dialogMode.value = null;
    await loadTools();
  } catch (error) {
    errorMessage.value = messageFor(error);
  } finally {
    isSaving.value = false;
  }
}

function isBoundedInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 9999;
}

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError))
    return '処理を完了できませんでした。もう一度お試しください。';
  const messages: Record<string, string> = {
    TOOL_NAME_DUPLICATED:
      '同じ名前の道具が既に存在します。別の名前を入力してください。',
    TOOL_UPDATE_CONFLICT:
      '他の管理者が先に更新しました。一覧を再読み込みしてください。',
    CATEGORY_INACTIVE:
      '選択した作業カテゴリは利用停止中です。有効なカテゴリを選び直してください。',
  };
  return (error.code && messages[error.code]) || error.message;
}
</script>

<template>
  <section>
    <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="mb-1 text-sm font-bold text-[#0b6b62]">道具マスター</p>
        <h1 class="text-3xl font-black tracking-tight">道具管理</h1>
        <p class="mt-2 text-sm text-[#49666a]">
          日別チェックで使う道具、所属カテゴリ、チームの保有数を確認します。
        </p>
      </div>
      <button
        v-if="isAdmin"
        class="min-h-11 rounded-xl bg-[#e87934] px-5 py-3 font-bold text-white"
        type="button"
        @click="openCreate"
      >
        道具を作成
      </button>
    </div>

    <p
      v-if="notice"
      class="mb-5 rounded-xl bg-[#d8eee8] p-4 text-sm text-[#074d47]"
      role="status"
    >
      {{ notice }}
    </p>
    <p
      v-if="errorMessage && !dialogMode"
      class="mb-5 rounded-xl bg-[#fbe4e1] p-4 text-sm text-[#8d2f2b]"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <form
      class="mb-6 grid gap-3 rounded-2xl border border-[#cfdbd5] bg-white p-4 md:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)_10rem_auto] md:items-end"
      aria-label="道具の絞り込み"
      @submit.prevent="applyFilters"
    >
      <label>
        <span class="mb-1 block text-sm font-bold">道具名</span>
        <input
          v-model="search"
          class="min-h-11 w-full rounded-xl border border-[#aebfba] px-3"
          type="search"
          placeholder="名前で検索"
        />
      </label>
      <label>
        <span class="mb-1 block text-sm font-bold">作業カテゴリ</span>
        <select
          v-model="categoryId"
          class="min-h-11 w-full rounded-xl border border-[#aebfba] px-3"
        >
          <option value="">すべて</option>
          <option
            v-for="category in categories"
            :key="category.id"
            :value="category.id"
          >
            {{ category.name
            }}{{ category.status === 'INACTIVE' ? '（停止中）' : '' }}
          </option>
        </select>
      </label>
      <label>
        <span class="mb-1 block text-sm font-bold">状態</span>
        <select
          v-model="status"
          class="min-h-11 w-full rounded-xl border border-[#aebfba] px-3"
        >
          <option value="">すべて</option>
          <option value="ACTIVE">利用中</option>
          <option value="INACTIVE">利用停止</option>
        </select>
      </label>
      <button
        class="min-h-11 rounded-xl bg-[#102a2e] px-5 font-bold text-white"
        type="submit"
        :disabled="isLoading"
      >
        検索
      </button>
    </form>

    <p v-if="isLoading" role="status">読み込み中…</p>
    <p
      v-else-if="tools.length === 0"
      class="rounded-2xl bg-white p-8 text-center text-[#49666a]"
    >
      条件に一致する道具はありません。
    </p>
    <div v-else class="grid gap-4 lg:grid-cols-2">
      <article
        v-for="tool in tools"
        :key="tool.id"
        class="rounded-2xl border border-[#cfdbd5] bg-white p-5 shadow-sm"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-black tracking-widest text-[#0b6b62]">
              {{ tool.categoryName }}
            </p>
            <h2 class="mt-1 break-words text-xl font-black">{{ tool.name }}</h2>
          </div>
          <span
            class="rounded-full px-3 py-1 text-xs font-bold"
            :class="
              tool.status === 'ACTIVE'
                ? 'bg-[#d8eee8] text-[#074d47]'
                : 'bg-[#e8eee9] text-[#49666a]'
            "
          >
            {{ tool.status === 'ACTIVE' ? '利用中' : '利用停止' }}
          </span>
        </div>
        <dl class="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div class="rounded-xl bg-[#f5f2ea] p-3">
            <dt class="text-[#49666a]">保有数</dt>
            <dd class="mt-1 text-lg font-black">{{ tool.stockQuantity }}</dd>
          </div>
          <div class="rounded-xl bg-[#f5f2ea] p-3">
            <dt class="text-[#49666a]">表示順</dt>
            <dd class="mt-1 text-lg font-black">{{ tool.displayOrder }}</dd>
          </div>
        </dl>
        <p
          v-if="tool.categoryStatus === 'INACTIVE'"
          class="mt-3 rounded-xl bg-[#fff3e8] p-3 text-sm text-[#7a421e]"
        >
          所属カテゴリが利用停止中です。再有効化や編集では有効なカテゴリを選んでください。
        </p>
        <div v-if="isAdmin" class="mt-5 flex flex-wrap gap-2">
          <button
            class="min-h-11 rounded-xl border border-[#aebfba] px-4 font-bold"
            type="button"
            @click="openEdit(tool, $event)"
          >
            編集
          </button>
          <button
            class="min-h-11 rounded-xl border border-[#aebfba] px-4 font-bold"
            type="button"
            @click="openStatus(tool, $event)"
          >
            {{ tool.status === 'ACTIVE' ? '利用停止' : '再有効化' }}
          </button>
        </div>
      </article>
    </div>

    <nav
      v-if="total > pageSize"
      class="mt-6 flex items-center justify-center gap-4"
      aria-label="道具一覧のページ"
    >
      <button
        class="min-h-11 rounded-xl border border-[#aebfba] bg-white px-4 font-bold disabled:opacity-50"
        type="button"
        :disabled="page <= 1 || isLoading"
        @click="movePage(page - 1)"
      >
        前へ
      </button>
      <span>{{ page }} / {{ pageCount }}ページ</span>
      <button
        class="min-h-11 rounded-xl border border-[#aebfba] bg-white px-4 font-bold disabled:opacity-50"
        type="button"
        :disabled="page >= pageCount || isLoading"
        @click="movePage(page + 1)"
      >
        次へ
      </button>
    </nav>

    <dialog
      ref="dialog"
      class="m-auto w-[min(92vw,34rem)] rounded-2xl border-0 bg-white p-0 shadow-2xl backdrop:bg-black/45"
      @cancel.prevent="closeDialog"
    >
      <div class="p-6" @keydown.esc="closeDialog">
        <h2 class="text-xl font-black">{{ dialogTitle }}</h2>
        <p
          v-if="errorMessage"
          class="mt-4 rounded-xl bg-[#fbe4e1] p-3 text-sm text-[#8d2f2b]"
          role="alert"
        >
          {{ errorMessage }}
        </p>
        <form
          v-if="dialogMode === 'create' || dialogMode === 'edit'"
          class="mt-5 space-y-4"
          @submit.prevent="saveTool"
        >
          <label class="block">
            <span class="mb-1 block font-bold">名前</span>
            <input
              v-model="form.name"
              class="min-h-11 w-full rounded-xl border px-3"
              maxlength="100"
              required
            />
          </label>
          <label class="block">
            <span class="mb-1 block font-bold">作業カテゴリ</span>
            <select
              v-model="form.categoryId"
              class="min-h-11 w-full rounded-xl border px-3"
              required
            >
              <option value="" disabled>選択してください</option>
              <option
                v-for="category in categories"
                :key="category.id"
                :value="category.id"
                :disabled="category.status === 'INACTIVE'"
              >
                {{ category.name
                }}{{ category.status === 'INACTIVE' ? '（停止中）' : '' }}
              </option>
            </select>
          </label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block font-bold">保有数</span>
              <input
                v-model.number="form.stockQuantity"
                class="min-h-11 w-full rounded-xl border px-3"
                type="number"
                min="0"
                max="9999"
                step="1"
                required
              />
            </label>
            <label class="block">
              <span class="mb-1 block font-bold">表示順</span>
              <input
                v-model.number="form.displayOrder"
                class="min-h-11 w-full rounded-xl border px-3"
                type="number"
                min="0"
                max="9999"
                step="1"
                required
              />
            </label>
          </div>
          <p class="text-sm text-[#49666a]">
            保有数はチームの総数です。日別の持ち出し操作では増減しません。
          </p>
          <div class="flex justify-end gap-3">
            <button
              class="min-h-11 rounded-xl border px-4"
              type="button"
              :disabled="isSaving"
              @click="closeDialog"
            >
              キャンセル
            </button>
            <button
              class="min-h-11 rounded-xl bg-[#e87934] px-5 font-bold text-white"
              type="submit"
              :disabled="isSaving"
            >
              {{ isSaving ? '保存中…' : '保存' }}
            </button>
          </div>
        </form>
        <div v-else-if="dialogMode === 'status'" class="mt-5">
          <p>
            {{ selectedTool?.name }}を{{
              selectedTool?.status === 'ACTIVE' ? '利用停止' : '再有効化'
            }}しますか？
          </p>
          <p class="mt-2 text-sm text-[#49666a]">
            過去の日別チェックの記録は削除されません。
          </p>
          <div class="mt-6 flex justify-end gap-3">
            <button
              class="min-h-11 rounded-xl border px-4"
              type="button"
              :disabled="isSaving"
              @click="closeDialog"
            >
              キャンセル
            </button>
            <button
              class="min-h-11 rounded-xl bg-[#b33b35] px-5 font-bold text-white"
              type="button"
              :disabled="isSaving"
              @click="changeStatus"
            >
              {{
                selectedTool?.status === 'ACTIVE'
                  ? '利用停止する'
                  : '再有効化する'
              }}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  </section>
</template>
