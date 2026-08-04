// 業務APIのパスを一か所に集約し、環境ごとのURLを画面へ直書きしない。
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
