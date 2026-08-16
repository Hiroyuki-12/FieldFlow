import { setupServer } from 'msw/node';

/** 各テストが必要なHandlerだけを追加し、実Backendへ誤接続しない共通Mock Server。 */
export const server = setupServer();
