import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { ApiCode, ApiError, type ApiEnvelope, type ErrorCodePayload } from './types'

/**
 * Axios instance + interceptors — the single network layer.
 *
 * Response contract (see types.ts / server api-response.ts):
 *   - success → interceptor unwraps and resolves to the envelope's inner `data`;
 *   - business error (HTTP 200, code≠0) → rejects with ApiError;
 *   - infra error (500/404, network, timeout, cancel) → normalized to ApiError.
 *
 * No auto-retry here: retry is owned by vue-query (avoids double-layer retries).
 * No auto-toast here: presentation is left to vue-query onError / ErrorHint
 * (frontend-design.md §7). Callers may pass `silent` for future opt-outs.
 */

// baseURL is '/api' by default; the Vite dev proxy forwards it to the backend.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const DEFAULT_TIMEOUT = 20_000

/** Per-request options we layer on top of AxiosRequestConfig. */
declare module 'axios' {
  export interface AxiosRequestConfig {
    /** Reserved: suppress any future centralized error surfacing for this call. */
    silent?: boolean
  }
}

export const http = axios.create({
  baseURL: BASE_URL,
  timeout: DEFAULT_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor — placeholder. Auth/token injection goes here when the
// backend adds it (frontend-design.md §11: login is out of scope pre-launch).
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // TODO: attach Authorization header once auth exists.
  return config
})

// Response interceptor — unwrap envelope, normalize every failure to ApiError.
http.interceptors.response.use(
  (response: AxiosResponse<ApiEnvelope>) => {
    const env = response.data
    if (env.code === ApiCode.Ok) {
      // Resolve to the inner data; request<T> types the result.
      return env.data as unknown as AxiosResponse
    }
    // Business failure: HTTP 200 but code≠0.
    const errorCode = (env.data as ErrorCodePayload | null)?.errorCode
    return Promise.reject(
      new ApiError({
        code: env.code,
        message: env.message,
        errorCode,
        httpStatus: response.status,
      }),
    )
  },
  (error: unknown) => {
    // Already normalized (e.g. rethrown) — pass through.
    if (error instanceof ApiError) return Promise.reject(error)

    if (axios.isCancel(error)) {
      return Promise.reject(
        new ApiError({ code: -1, message: '请求已取消', isCanceled: true, cause: error }),
      )
    }

    if (error instanceof AxiosError) {
      // Infra failure that still carried an envelope (e.g. 500 internalError, 404 routeNotFound).
      const env = error.response?.data as ApiEnvelope | undefined
      if (env && typeof env.code === 'number') {
        const errorCode = (env.data as ErrorCodePayload | null)?.errorCode
        return Promise.reject(
          new ApiError({
            code: env.code,
            message: env.message || '请求失败',
            errorCode,
            httpStatus: error.response?.status,
            isInfra: true,
            cause: error,
          }),
        )
      }

      // Transport failure: network down or timeout — no envelope at all.
      const isTimeout = error.code === 'ECONNABORTED'
      return Promise.reject(
        new ApiError({
          code: ApiCode.InternalError,
          message: isTimeout ? '请求超时，请稍后重试' : '网络异常，请检查连接后重试',
          httpStatus: error.response?.status,
          isInfra: true,
          cause: error,
        }),
      )
    }

    return Promise.reject(
      new ApiError({ code: ApiCode.InternalError, message: '未知错误', isInfra: true, cause: error }),
    )
  },
)
