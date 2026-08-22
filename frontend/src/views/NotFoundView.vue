<template>
  <main id="main-content" class="grid min-h-screen place-items-center bg-[#f5f2ea] px-5 py-10">
    <section class="w-full max-w-lg rounded-3xl border border-[#cfdbd5] bg-[#fffdf8] p-7 text-center shadow-lg sm:p-10">
      <p class="text-xs font-black tracking-[0.16em] text-[#0b6b62]">404 NOT FOUND</p>
      <h1 class="mt-3 text-3xl font-black tracking-tight" data-page-heading tabindex="-1">
        ページが見つかりません
      </h1>
      <p class="mt-4 leading-7 text-[#49666a]">URLを確認するか、ホームから操作をやり直してください。</p>
      <RouterLink
        to="/"
        class="mt-7 inline-grid min-h-12 place-items-center rounded-xl bg-[#0b6b62] px-6 font-black text-white hover:bg-[#074d47]"
      >
        ホームへ戻る
      </RouterLink>
    </section>
  </main>
</template>
