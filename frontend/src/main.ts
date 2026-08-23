import { createPinia } from 'pinia';
import { createApp } from 'vue';

import { configureAuthSessionBridge } from './api/client';
import App from './App.vue';
import { createAppRouter } from './router';
import { useAuthStore } from './stores/auth';
import { useBackendStartupStore } from './stores/backend-startup';
import './styles/main.css';

async function bootstrap(): Promise<void> {
  const app = createApp(App);
  const pinia = createPinia();
  const authStore = useAuthStore(pinia);
  const backendStartupStore = useBackendStartupStore(pinia);
  let applicationReady: Promise<void> = Promise.resolve();
  const router = createAppRouter(pinia, undefined, () => applicationReady);

  configureAuthSessionBridge({
    getAccessToken: () => authStore.accessToken,
    refreshAccessToken: () => authStore.refreshAccessToken(),
    onSessionExpired: () => {
      authStore.clearSession();
      if (router.currentRoute.value.name !== 'session-expired') {
        void router.replace({ name: 'session-expired' });
      }
    },
    onBackendUnavailable: () => backendStartupStore.markUnavailable(),
  });

  // 先に画面をmountし、Render起動待ちの間も白画面にしない。Router GuardはこのPromiseを待つ。
  applicationReady = backendStartupStore
    .waitUntilReady()
    .then(() => authStore.restoreSession());
  app.use(pinia).use(router).mount('#app');
  await applicationReady;
}

void bootstrap();
