<template>
  <main id="main-content" class="grid min-h-screen place-items-center bg-[#f5f2ea] px-5 py-10">
    <section class="w-full max-w-lg rounded-3xl border border-[#cfdbd5] bg-[#fffdf8] p-7 text-center shadow-lg sm:p-10">
      <div class="mx-auto grid size-14 place-items-center rounded-2xl bg-[#fff0d7] text-2xl" aria-hidden="true">⌛</div>
      <p class="mt-6 text-xs font-black tracking-[0.16em] text-[#9a5a18]">SESSION EXPIRED</p>
      <h1 class="mt-2 text-3xl font-black tracking-tight" data-page-heading tabindex="-1">
        セッションが切れました
      </h1>
      <p class="mt-4 leading-7 text-[#49666a]">
        安全のため操作を終了しました。入力中の内容は保存されていない可能性があります。
      </p>
      <RouterLink
        :to="{ name: 'login' }"
        class="mt-7 inline-grid min-h-12 w-full place-items-center rounded-xl bg-[#0b6b62] px-5 font-black text-white hover:bg-[#074d47]"
      >
        ログイン画面へ
      </RouterLink>
    </section>
  </main>
</template>
