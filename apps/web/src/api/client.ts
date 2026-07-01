import axios from "axios";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  timeout: 30_000,
});

/**
 * Normalizes both axios errors and Hono's { error, issues? } JSON error bodies
 * into a human-readable string suitable for useMessage().error(...).
 */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
    if (error.message) return error.message;
  }

  if (error instanceof Error) return error.message;

  return "请求失败，请重试";
}
