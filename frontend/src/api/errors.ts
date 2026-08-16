import axios from 'axios';

/**
 * 画面へ渡してよい情報だけを持つAPIエラー。
 * Backendのレスポンス全体を保持しないことで、秘密値や内部構造を誤って画面へ出す事故を防ぐ。
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const statusMessages: Record<number, string> = {
  400: '入力内容を確認してください。',
  401: 'ログイン情報を確認できませんでした。',
  403: 'この操作を行う権限がありません。',
  404: '対象が見つかりませんでした。',
  409: '他の操作と競合しました。最新の状態を確認してください。',
  429: '操作が続いたため一時的に制限されています。しばらく待ってからお試しください。',
};

/** Axios固有の例外を、画面が一貫して扱える安全なエラーへ変換する。 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (!axios.isAxiosError(error)) {
    return new ApiError(
      '予期しないエラーが発生しました。もう一度お試しください。',
      null,
    );
  }

  const status = error.response?.status ?? null;
  if (status === null) {
    return new ApiError(
      'サーバーへ接続できませんでした。通信環境を確認してもう一度お試しください。',
      null,
    );
  }

  const data = error.response?.data;
  const code =
    typeof data === 'object' &&
    data !== null &&
    'code' in data &&
    typeof data.code === 'string'
      ? data.code
      : null;
  return new ApiError(
    statusMessages[status] ??
      '処理を完了できませんでした。もう一度お試しください。',
    status,
    code,
  );
}
