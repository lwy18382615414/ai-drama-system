import axios from "axios";

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  timeout: 30_000,
});

function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    "data" in value
  );
}

apiClient.interceptors.response.use((response) => {
  if (isApiEnvelope(response.data)) {
    response.data = response.data.data;
  }

  return response;
});

/**
 * Normalizes axios errors and the API's { code, message, data } error body
 * into a human-readable string suitable for useMessage().error(...).
 */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    if (error.message) return error.message;
  }

  if (error instanceof Error) return error.message;

  return "Request failed, please try again";
}
