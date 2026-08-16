<script setup lang="ts">
import { computed } from 'vue';

import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const roleLabel = computed(() => (authStore.user?.role === 'ADMIN' ? '管理者' : '作業者'));
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <p class="text-xs font-black tracking-[0.16em] text-[#0b6b62]">TODAY'S PREPARATION</p>
    <h1 class="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
      おはようございます、{{ authStore.user?.name }}さん
    </h1>
    <p class="mt-3 text-[#49666a]">{{ roleLabel }}としてログインしています。</p>

    <section class="mt-8 rounded-3xl border border-[#cfdbd5] bg-[#fffdf8] p-6 shadow-sm sm:p-8">
      <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-sm font-bold text-[#0b6b62]">認証・共通UI</p>
          <h2 class="mt-2 text-2xl font-black">安全に業務画面へ進む準備ができました</h2>
          <p class="mt-3 max-w-2xl leading-7 text-[#49666a]">
            Access Tokenはメモリだけで管理し、期限切れ時はHttpOnly Cookieを使って安全に更新します。
          </p>
        </div>
        <span class="inline-flex shrink-0 items-center rounded-full bg-[#dff3e7] px-4 py-2 text-sm font-black text-[#24764d]">
          認証済み
        </span>
      </div>
    </section>

    <div class="mt-6 grid gap-5 sm:grid-cols-2">
      <section class="rounded-2xl border border-[#cfdbd5] bg-white p-6">
        <p class="text-xs font-black tracking-wider text-[#6b8285]">NEXT</p>
        <h2 class="mt-2 text-xl font-black">日別チェック</h2>
        <p class="mt-2 leading-7 text-[#49666a]">日別表の作成・表示はロードマップ9〜10で接続します。</p>
      </section>
      <section class="rounded-2xl border border-[#cfdbd5] bg-white p-6">
        <p class="text-xs font-black tracking-wider text-[#6b8285]">ACCOUNT</p>
        <h2 class="mt-2 text-xl font-black">セキュリティ設定</h2>
        <p class="mt-2 leading-7 text-[#49666a]">左のメニューから自分のパスワードを変更できます。</p>
      </section>
    </div>
  </div>
</template>
