import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ElMessage } from 'element-plus'
import { ApiCode, ApiError, type ApiResponse } from './types'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

/** Extra per-request options honored by the interceptors. */
export interface RequestOptions extends AxiosRequestConfig {
  /** Suppress the automatic ElMessage error toast (e.g. for expected 404s). */
  skipErrorToast?: boolean
}

function shouldToast(config: unknown): boolean {
  return !(config as RequestOptions | undefined)?.skipErrorToast
}

/**
 * Shared axios instance. The response interceptor unwraps the backend
 * `{ code, message, data }` envelope so callers receive `data` directly and
 * any non-success code is thrown as an ApiError.
 */
export const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<unknown>>) => {
    // Business/logic failures arrive here as HTTP 200 and are distinguished
    // purely by `code !== Ok` — the backend never exposes an HTTP error status
    // for them. Only genuine infrastructure failures (network, server 500,
    // unregistered route 404) reach the error handler below.
    const body = response.data
    // Non-JSON / raw responses (e.g. file downloads) pass through untouched.
    if (!body || typeof body !== 'object' || !('code' in body)) {
      return response
    }
    if (body.code !== ApiCode.Ok) {
      const error = new ApiError(body.message || '请求失败', body.code, response.status, body.data)
      if (shouldToast(response.config)) ElMessage.error(error.message)
      return Promise.reject(error)
    }
    return response
  },
  (error) => {
    // Genuine infrastructure failure: network error, timeout, server 500, or an
    // unregistered-route 404 (still wrapped in the envelope by the backend).
    const body = error?.response?.data as ApiResponse<unknown> | undefined
    const message = body?.message ?? error?.message ?? '网络请求异常'
    const apiError = new ApiError(
      message,
      body?.code ?? ApiCode.InternalError,
      error?.response?.status ?? 0,
      body?.data ?? null,
    )
    if (shouldToast((error as { config?: InternalAxiosRequestConfig })?.config)) {
      ElMessage.error(apiError.message)
    }
    return Promise.reject(apiError)
  },
)

/**
 * Resolves a stored asset URL (e.g. `/static/…`, written by the backend image
 * provider) to an absolute URL, since the dev frontend (:3100) and the static
 * server (:3000) are different origins. Absolute/data URLs pass through.
 */
export function assetUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:')) return url
  return `${baseURL}${url.startsWith('/') ? '' : '/'}${url}`
}

/** GET returning the unwrapped `data` payload. */
export async function get<T>(url: string, config?: RequestOptions): Promise<T> {
  const res = await http.get<ApiResponse<T>>(url, config)
  return res.data.data
}

/** POST returning the unwrapped `data` payload. */
export async function post<T>(
  url: string,
  payload?: unknown,
  config?: RequestOptions,
): Promise<T> {
  const res = await http.post<ApiResponse<T>>(url, payload, config)
  return res.data.data
}

/** PATCH returning the unwrapped `data` payload. */
export async function patch<T>(
  url: string,
  payload?: unknown,
  config?: RequestOptions,
): Promise<T> {
  const res = await http.patch<ApiResponse<T>>(url, payload, config)
  return res.data.data
}

/** DELETE returning the unwrapped `data` payload. */
export async function del<T>(url: string, config?: RequestOptions): Promise<T> {
  const res = await http.delete<ApiResponse<T>>(url, config)
  return res.data.data
}
