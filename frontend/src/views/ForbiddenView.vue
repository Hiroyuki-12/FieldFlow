<template>
  <section class="mx-auto max-w-2xl rounded-3xl border border-[#e6c5c2] bg-[#fffdf8] p-7 text-center shadow-sm sm:p-10">
    <p class="text-xs font-black tracking-[0.16em] text-[#b33b35]">403 FORBIDDEN</p>
    <h1 class="mt-3 text-3xl font-black tracking-tight" data-page-heading tabindex="-1">
      この画面を利用する権限がありません
    </h1>
    <p class="mt-4 leading-7 text-[#49666a]">管理者へ権限を確認してください。</p>
    <RouterLink
      :to="{ name: 'home' }"
      class="mt-7 inline-grid min-h-12 place-items-center rounded-xl bg-[#0b6b62] px-6 font-black text-white hover:bg-[#074d47]"
    >
      ホームへ戻る
    </RouterLink>
  </section>
</template>
