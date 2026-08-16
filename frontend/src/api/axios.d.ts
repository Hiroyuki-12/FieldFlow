import 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Refresh後の401をSession失効ではなく、画面固有の認証エラーとして扱う。 */
    keepSessionOnAuthFailure?: boolean;
  }
}
