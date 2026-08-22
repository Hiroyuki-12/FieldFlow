import { nextTick, ref, type Ref } from 'vue';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * 各画面で同じダイアログ操作を保証する。
 * ネイティブdialogが背景操作を防ぎ、ここでは初期フォーカス、テスト環境を含むTab循環、
 * 閉じた後の起点復帰を補うことで、キーボード利用者が現在位置を見失う事故を防ぐ。
 */
export function useModalDialog(): {
  dialog: Ref<HTMLDialogElement | null>;
  openModal: (initialFocusSelector?: string) => Promise<void>;
  closeModal: () => void;
  trapFocus: (event: KeyboardEvent) => void;
} {
  const dialog = ref<HTMLDialogElement | null>(null);
  let trigger: HTMLElement | null = null;

  async function openModal(initialFocusSelector = FOCUSABLE_SELECTOR): Promise<void> {
    trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();

    const element = dialog.value;
    if (!element) return;
    if (!element.open) {
      if (typeof element.showModal === 'function') element.showModal();
      else element.setAttribute('open', '');
    }

    element.querySelector<HTMLElement>(initialFocusSelector)?.focus();
  }

  function closeModal(): void {
    const element = dialog.value;
    if (element?.open) {
      if (typeof element.close === 'function') element.close();
      else element.removeAttribute('open');
    }

    // DOM更新後も起点が残っている場合だけ戻す。画面遷移済みの古い要素は触らない。
    if (trigger?.isConnected) trigger.focus();
    trigger = null;
  }

  function trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !dialog.value) return;
    const focusable = Array.from(
      dialog.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return { dialog, openModal, closeModal, trapFocus };
}
