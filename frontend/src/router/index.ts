import type { Pinia } from 'pinia';
import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalized,
  type RouterHistory,
} from 'vue-router';

import AppLayout from '../components/AppLayout.vue';
import { useAuthStore } from '../stores/auth';
import ForbiddenView from '../views/ForbiddenView.vue';
import HomeView from '../views/HomeView.vue';
import LoginView from '../views/LoginView.vue';
import NotFoundView from '../views/NotFoundView.vue';
import PasswordChangeView from '../views/PasswordChangeView.vue';
import SessionExpiredView from '../views/SessionExpiredView.vue';

/** 外部URL形式を戻り先に採用せず、ログイン後のOpen Redirectを防ぐ。 */
export function sanitizeInternalRedirect(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : null;
}

function loginRedirect(to: RouteLocationNormalized) {
  const redirect = sanitizeInternalRedirect(to.fullPath);
  return redirect ? { name: 'login', query: { redirect } } : { name: 'login' };
}

export function createAppRouter(
  pinia: Pinia,
  history: RouterHistory = createWebHistory(import.meta.env.BASE_URL),
) {
  const router = createRouter({
    history,
    routes: [
      {
        path: '/login',
        name: 'login',
        component: LoginView,
        meta: { guestOnly: true },
      },
      {
        path: '/change-password/initial',
        name: 'initial-password-change',
        component: PasswordChangeView,
        meta: { requiresAuth: true, allowBeforePasswordChange: true, initialPasswordOnly: true },
      },
      {
        path: '/session-expired',
        name: 'session-expired',
        component: SessionExpiredView,
      },
      {
        path: '/',
        component: AppLayout,
        meta: { requiresAuth: true },
        children: [
          {
            path: '',
            name: 'home',
            component: HomeView,
          },
          {
            path: 'password',
            name: 'password-change',
            component: PasswordChangeView,
          },
          {
            path: 'forbidden',
            name: 'forbidden',
            component: ForbiddenView,
          },
        ],
      },
      {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        component: NotFoundView,
      },
    ],
  });

  router.beforeEach((to) => {
    const authStore = useAuthStore(pinia);

    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
      return loginRedirect(to);
    }

    if (authStore.isAuthenticated && authStore.user?.mustChangePassword) {
      if (!to.meta.allowBeforePasswordChange) {
        return { name: 'initial-password-change' };
      }
    } else if (authStore.isAuthenticated && to.meta.initialPasswordOnly) {
      return { name: 'home' };
    }

    if (authStore.isAuthenticated && to.meta.roles && authStore.user) {
      if (!to.meta.roles.includes(authStore.user.role)) {
        return { name: 'forbidden' };
      }
    }

    if (to.meta.guestOnly && authStore.isAuthenticated) {
      return { name: 'home' };
    }

    return true;
  });

  return router;
}
