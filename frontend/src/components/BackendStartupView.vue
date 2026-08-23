<script setup lang="ts">
import type { BackendStartupStatus } from '../stores/backend-startup';

defineProps<{
  status: BackendStartupStatus;
  attempt: number;
  nextRetrySeconds: number;
}>();
</script>

<template>
  <main class="grid min-h-dvh place-items-center px-4 py-10">
    <section
      class="w-full max-w-xl rounded-3xl border border-emerald-900/10 bg-white/90 p-7 text-center shadow-xl shadow-emerald-950/10 sm:p-10"
      aria-labelledby="backend-startup-title"
      aria-describedby="backend-startup-description"
    >
      <div
        class="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-800"
        aria-hidden="true"
      >
        <span class="backend-startup-spinner size-8 rounded-full border-4 border-emerald-200 border-t-emerald-700" />
      </div>
      <p class="text-sm font-bold tracking-[0.18em] text-emerald-700">FIELDFLOW</p>
      <h1
        id="backend-startup-title"
        data-page-heading
        tabindex="-1"
        class="mt-3 text-2xl font-black text-slate-900 sm:text-3xl"
      >
        {{ status === 'checking' ? 'サーバーへ接続しています' : 'バックエンドを起動しています' }}
      </h1>
      <p
        id="backend-startup-description"
        class="mx-auto mt-4 max-w-md text-sm leading-7 text-slate-600 sm:text-base"
      >
        Renderの無料サービスは、アクセスがない時間が続くと自動停止します。
        起動には約1分かかることがあります。この画面のままお待ちください。
      </p>
      <p class="mt-6 text-sm font-semibold text-emerald-800" role="status" aria-live="polite">
        <template v-if="status === 'waiting'">
          自動で再試行します（確認 {{ attempt }} 回目・次回まで最大 {{ nextRetrySeconds }} 秒）
        </template>
        <template v-else>接続状態を確認中です。</template>
      </p>
    </section>
  </main>
</template>
