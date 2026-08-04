<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { getHealth } from '../api/health';

type ConnectionState = 'checking' | 'connected' | 'failed';

const connectionState = ref<ConnectionState>('checking');

onMounted(async () => {
  try {
    await getHealth();
    connectionState.value = 'connected';
  } catch {
    connectionState.value = 'failed';
  }
});
</script>

<template>
  <main class="min-h-screen bg-stone-50 px-4 py-12 text-slate-900">
    <section class="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-stone-200">
      <p class="text-sm font-bold tracking-[0.18em] text-orange-700">FIELDFLOW</p>
      <h1 class="mt-3 text-3xl font-bold sm:text-4xl">開発基盤の準備</h1>
      <p class="mt-4 leading-7 text-slate-600">
        Vue、NestJS、MySQLを接続する最小構成です。認証と日別チェックは次のIssueから追加します。
      </p>

      <div class="mt-8 rounded-2xl bg-slate-50 p-5" aria-live="polite">
        <h2 class="font-bold">Backend・DB接続</h2>
        <p v-if="connectionState === 'checking'" class="mt-2 text-slate-600">確認中です…</p>
        <p v-else-if="connectionState === 'connected'" class="mt-2 font-medium text-emerald-700">
          接続できました
        </p>
        <p v-else class="mt-2 font-medium text-red-700">
          接続できません。BackendとMySQLの起動状態を確認してください。
        </p>
      </div>
    </section>
  </main>
</template>
