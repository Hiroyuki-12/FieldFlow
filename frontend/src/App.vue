<script setup lang="ts">
import { RouterView } from 'vue-router';

import BackendStartupView from './components/BackendStartupView.vue';
import { useBackendStartupStore } from './stores/backend-startup';

const backendStartupStore = useBackendStartupStore();
</script>

<template>
  <BackendStartupView
    v-if="!backendStartupStore.isReady"
    :status="backendStartupStore.status"
    :attempt="backendStartupStore.attempt"
    :next-retry-seconds="backendStartupStore.nextRetrySeconds"
  />
  <RouterView v-else />
</template>
