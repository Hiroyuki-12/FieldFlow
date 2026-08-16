<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';

import {
  type CategoryStatus,
  createCategory,
  listCategories,
  type ManagedCategory,
  updateCategory,
  updateCategoryStatus,
} from '../api/categories';
import { ApiError } from '../api/errors';

type DialogMode = 'create' | 'edit' | 'status' | null;

const categories = ref<ManagedCategory[]>([]);
const search = ref('');
const status = ref<CategoryStatus | ''>('');
const isLoading = ref(false);
const isSaving = ref(false);
const notice = ref('');
const errorMessage = ref('');
const dialogMode = ref<DialogMode>(null);
const dialog = ref<HTMLDialogElement | null>(null);
const selectedCategory = ref<ManagedCategory | null>(null);
const form = ref({ name: '', displayOrder: 0 });
let dialogTrigger: HTMLElement | null = null;

const dialogTitle = computed(() => {
  if (dialogMode.value === 'create') return '作業カテゴリを作成';
  if (dialogMode.value === 'edit') return '作業カテゴリを編集';
  return selectedCategory.value?.status === 'ACTIVE'
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
    dialog.value?.querySelector<HTMLElement>('input, button')?.focus();
  } else if (dialog.value?.open) {
    if (typeof dialog.value.close === 'function') dialog.value.close();
    else dialog.value.removeAttribute('open');
    dialogTrigger?.focus();
  }
});

onMounted(loadCategories);

async function loadCategories(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await listCategories({
      search: search.value,
      status: status.value,
    });
    categories.value = response.items;
  } catch (error) {
    errorMessage.value = messageFor(error);
  } finally {
    isLoading.value = false;
  }
}

function openCreate(event: Event): void {
  errorMessage.value = '';
  dialogTrigger = event.currentTarget as HTMLElement;
  selectedCategory.value = null;
  form.value = { name: '', displayOrder: 0 };
  dialogMode.value = 'create';
}

function openEdit(category: ManagedCategory, event: Event): void {
  errorMessage.value = '';
  dialogTrigger = event.currentTarget as HTMLElement;
  selectedCategory.value = category;
  form.value = { name: category.name, displayOrder: category.displayOrder };
  dialogMode.value = 'edit';
}

function openStatus(category: ManagedCategory, event: Event): void {
  errorMessage.value = '';
  dialogTrigger = event.currentTarget as HTMLElement;
  selectedCategory.value = category;
  dialogMode.value = 'status';
}

function closeDialog(): void {
  if (isSaving.value) return;
  dialogMode.value = null;
  selectedCategory.value = null;
  errorMessage.value = '';
}

async function saveCategory(): Promise<void> {
  const name = form.value.name.trim();
  const displayOrder = Number(form.value.displayOrder);
  if (
    !name ||
    name.length > 50 ||
    !Number.isInteger(displayOrder) ||
    displayOrder < 0 ||
    displayOrder > 9999
  ) {
    errorMessage.value =
      '名前は1〜50文字、表示順は0〜9999の整数で入力してください。';
    return;
  }

  isSaving.value = true;
  errorMessage.value = '';
  try {
    if (dialogMode.value === 'create') {
      const created = await createCategory({ name, displayOrder });
      notice.value = created.name + 'を作成しました。';
    } else if (selectedCategory.value) {
      const updated = await updateCategory(selectedCategory.value.id, {
        name,
        displayOrder,
        version: selectedCategory.value.version,
      });
      notice.value = updated.name + 'を更新しました。';
    }
    dialogMode.value = null;
    await loadCategories();
  } catch (error) {
    errorMessage.value = messageFor(error);
  } finally {
    isSaving.value = false;
  }
}

async function changeStatus(): Promise<void> {
  if (!selectedCategory.value) return;
  isSaving.value = true;
  errorMessage.value = '';
  const nextStatus: CategoryStatus =
    selectedCategory.value.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  try {
    const updated = await updateCategoryStatus(
      selectedCategory.value,
      nextStatus,
    );
    notice.value =
      updated.name +
      'を' +
      (nextStatus === 'ACTIVE' ? '再有効化' : '利用停止') +
      'しました。';
    dialogMode.value = null;
    await loadCategories();
  } catch (error) {
    errorMessage.value = messageFor(error);
  } finally {
    isSaving.value = false;
  }
}

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError))
    return '処理を完了できませんでした。もう一度お試しください。';
  const messages: Record<string, string> = {
    CATEGORY_NAME_DUPLICATED:
      '同じ名前の作業カテゴリが既に存在します。別の名前を入力してください。',
    CATEGORY_UPDATE_CONFLICT:
      '他の管理者が先に更新しました。一覧を再読み込みしてください。',
    CATEGORY_IN_USE:
      '利用中の道具があるため停止できません。先に対象の道具を利用停止してください。',
    COMMON_CATEGORY_PROTECTED:
      '共通カテゴリの名前変更・利用停止はできません。',
  };
  return (error.code && messages[error.code]) || error.message;
}
</script>

<template>
  <section>
    <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="mb-1 text-sm font-bold text-[#0b6b62]">管理機能</p>
        <h1 class="text-3xl font-black tracking-tight">作業カテゴリ管理</h1>
        <p class="mt-2 text-sm text-[#49666a]">
          日別チェックで選ぶ作業と、その道具のまとまりを管理します。
        </p>
      </div>
      <button
        class="min-h-11 rounded-xl bg-[#e87934] px-5 py-3 font-bold text-white"
        type="button"
        @click="openCreate"
      >
        作業カテゴリを作成
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
      class="mb-6 grid gap-3 rounded-2xl border border-[#cfdbd5] bg-white p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
      aria-label="作業カテゴリの絞り込み"
      @submit.prevent="loadCategories"
    >
      <label>
        <span class="mb-1 block text-sm font-bold">作業カテゴリ名</span>
        <input
          v-model="search"
          class="min-h-11 w-full rounded-xl border border-[#aebfba] px-3"
          type="search"
          placeholder="名前で検索"
        />
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
      v-else-if="categories.length === 0"
      class="rounded-2xl bg-white p-8 text-center text-[#49666a]"
    >
      条件に一致する作業カテゴリはありません。
    </p>
    <div v-else class="grid gap-4 lg:grid-cols-2">
      <article
        v-for="category in categories"
        :key="category.id"
        class="rounded-2xl border border-[#cfdbd5] bg-white p-5 shadow-sm"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-black tracking-widest text-[#0b6b62]">
              {{ category.categoryType === 'COMMON' ? 'AUTO INCLUDE' : 'WORK' }}
            </p>
            <h2 class="mt-1 break-words text-xl font-black">
              {{ category.name }}
            </h2>
          </div>
          <span
            class="rounded-full px-3 py-1 text-xs font-bold"
            :class="
              category.status === 'ACTIVE'
                ? 'bg-[#d8eee8] text-[#074d47]'
                : 'bg-[#e8eee9] text-[#49666a]'
            "
          >
            {{ category.status === 'ACTIVE' ? '利用中' : '利用停止' }}
          </span>
        </div>
        <p class="mt-3 text-sm text-[#49666a]">
          表示順: {{ category.displayOrder }}
        </p>
        <p
          v-if="category.categoryType === 'COMMON'"
          class="mt-3 rounded-xl bg-[#fff3e8] p-3 text-sm text-[#7a421e]"
        >
          有効な道具をすべての日別チェックへ自動追加する特別なカテゴリです。名前変更と利用停止はできません。
        </p>
        <div class="mt-5 flex flex-wrap gap-2">
          <button
            class="min-h-11 rounded-xl border border-[#aebfba] px-4 font-bold"
            type="button"
            @click="openEdit(category, $event)"
          >
            編集
          </button>
          <button
            v-if="category.categoryType !== 'COMMON'"
            class="min-h-11 rounded-xl border border-[#aebfba] px-4 font-bold"
            type="button"
            @click="openStatus(category, $event)"
          >
            {{ category.status === 'ACTIVE' ? '利用停止' : '再有効化' }}
          </button>
        </div>
      </article>
    </div>

    <dialog
      ref="dialog"
      class="m-auto w-[min(92vw,32rem)] rounded-2xl border-0 bg-white p-0 shadow-2xl backdrop:bg-black/45"
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
          @submit.prevent="saveCategory"
        >
          <label class="block">
            <span class="mb-1 block font-bold">名前</span>
            <input
              v-model="form.name"
              class="min-h-11 w-full rounded-xl border px-3 disabled:bg-[#e8eee9]"
              maxlength="50"
              required
              :disabled="selectedCategory?.categoryType === 'COMMON'"
            />
          </label>
          <p
            v-if="selectedCategory?.categoryType === 'COMMON'"
            class="text-sm text-[#7a421e]"
          >
            共通カテゴリの名前は変更できません。表示順だけ変更できます。
          </p>
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
            {{ selectedCategory?.name }}を{{
              selectedCategory?.status === 'ACTIVE' ? '利用停止' : '再有効化'
            }}しますか？
          </p>
          <p
            v-if="selectedCategory?.status === 'ACTIVE'"
            class="mt-2 text-sm text-[#8d2f2b]"
          >
            利用中の道具が紐づいている場合は停止できません。過去の日別チェックの記録は削除されません。
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
                selectedCategory?.status === 'ACTIVE'
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
