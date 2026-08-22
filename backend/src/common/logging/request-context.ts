import { AsyncLocalStorage } from 'node:async_hooks';

/** 1件のHTTPリクエストにだけ属する追跡情報。業務データや秘密値は保持しない。 */
export interface RequestContext {
  requestId: string;
}

// Node.js標準のAsyncLocalStorageを使い、awaitをまたいでも同じrequestIdを参照できるようにする。
const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/** Middlewareで確定したrequestIdを、その後に開始される非同期処理へ伝播する。 */
export function runWithRequestContext(
  context: RequestContext,
  callback: () => void,
): void {
  requestContextStorage.run(context, callback);
}

/** 現在処理中のrequestIdを返す。起動処理などHTTP外ではundefinedになる。 */
export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
