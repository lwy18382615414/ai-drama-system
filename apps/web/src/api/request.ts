import type { AxiosRequestConfig } from 'axios'
import { http } from './http'

/**
 * Typed request helpers. Because the response interceptor unwraps the envelope,
 * these resolve to the inner business `data` (type T) directly, and reject with
 * ApiError on any failure.
 *
 * All helpers accept an AxiosRequestConfig, so callers can forward an
 * AbortSignal (config.signal) — this is how vue-query cancellation reaches axios.
 */

export function request<T>(config: AxiosRequestConfig): Promise<T> {
  // R = T tells axios our interceptor resolves to the unwrapped data, not AxiosResponse.
  return http.request<unknown, T>(config)
}

export function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return request<T>({ ...config, method: 'GET', url })
}

export function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return request<T>({ ...config, method: 'POST', url, data })
}

export function put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return request<T>({ ...config, method: 'PUT', url, data })
}

export function patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return request<T>({ ...config, method: 'PATCH', url, data })
}

export function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return request<T>({ ...config, method: 'DELETE', url })
}
