<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    tone: 'success' | 'warning' | 'error' | 'info';
    title?: string;
  }>(),
  { title: '' },
);

const icon = computed(() => {
  if (props.tone === 'success') return '✓';
  if (props.tone === 'warning') return '⚠';
  if (props.tone === 'error') return '!';
  return 'i';
});
const defaultTitle = computed(() => {
  if (props.tone === 'success') return '完了';
  if (props.tone === 'warning') return '確認してください';
  if (props.tone === 'error') return '処理を完了できませんでした';
  return 'お知らせ';
});
const liveMode = computed(
  () =>
    props.tone === 'error' || props.tone === 'warning'
      ? 'assertive'
      : 'polite',
);
</script>

<template>
  <div
    class="app-notice"
    :class="`app-notice-${tone}`"
    :role="tone === 'error' || tone === 'warning' ? 'alert' : 'status'"
    :aria-live="liveMode"
    aria-atomic="true"
  >
    <span class="app-notice-icon" aria-hidden="true">{{ icon }}</span>
    <div class="min-w-0 flex-1">
      <strong class="block">{{ title || defaultTitle }}</strong>
      <div class="mt-0.5 break-words text-sm leading-6"><slot /></div>
    </div>
  </div>
</template>
