/**
 * Shared API response contract, mirrored from apps/server/api-response.ts.
 * Every backend response is wrapped in this envelope; `code === 0` means success.
 */

export const ApiCode = {
  Ok: 0,
  InvalidRequestBody: 40001,
  InvalidQuery: 40002,
  NotFound: 40401,
  Conflict: 40901,
  PayloadTooLarge: 41301,
  InternalError: 50001,
} as const

export type ApiCodeValue = (typeof ApiCode)[keyof typeof ApiCode]

export interface ApiResponse<T> {
  code: ApiCodeValue
  message: string
  data: T
}

/** Thrown by the axios response interceptor for any non-success (`code !== 0`) payload. */
export class ApiError extends Error {
  readonly code: ApiCodeValue
  readonly httpStatus: number
  readonly data: unknown

  constructor(message: string, code: ApiCodeValue, httpStatus: number, data: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.httpStatus = httpStatus
    this.data = data
  }
}
