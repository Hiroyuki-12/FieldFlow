import { createPinia } from 'pinia';
import { createApp } from 'vue';

import { configureAuthSessionBridge } from './api/client';
import App from './App.vue';
import { createAppRouter } from './router';
import { useAuthStore } from './stores/auth';
import './styles/main.css';

async function bootstrap(): Promise<void> {
  const app = createApp(App);
  const pinia = createPinia();
  const router = createAppRouter(pinia);
  const authStore = useAuthStore(pinia);

  configureAuthSessionBridge({
    getAccessToken: () => authStore.accessToken,
    refreshAccessToken: () => authStore.refreshAccessToken(),
    onSessionExpired: () => {
      authStore.clearSession();
      if (router.currentRoute.value.name !== 'session-expired') {
        void router.replace({ name: 'session-expired' });
      }
    },
  });

  // Access Tokenは再読み込みで消えるため、HttpOnly Cookieを使って表示前にSessionを復元する。
  await authStore.restoreSession();
  app.use(pinia).use(router).mount('#app');
}

void bootstrap();
