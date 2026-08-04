import { createRouter, createWebHistory } from 'vue-router';

import HomeView from '../views/HomeView.vue';

// 認証Guardは認証Issueで追加する。ここでは画面追加の土台となるRouterだけを構成する。
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
  ],
});

export default router;
