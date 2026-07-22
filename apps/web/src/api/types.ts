/**
 * Backend response contract — mirrors apps/server/api-response.ts.
 *
 * Every response is an envelope `{ code, message, data }`.
 * Business/logic failures return HTTP 200 with a non-zero `code`; only genuine
 * infrastructure failures keep a real HTTP status (500 internalError, 404 routeNotFound).
 * A machine-readable `errorCode` string may be nested in `data.errorCode`
 * (frontend-design.md §7) for friendly localized messaging.
 */

/** Envelope `code` values (mirror of server ApiCode). `0` = success. */
export const ApiCode = {
  Ok: 0,
  InvalidRequestBody: 40001,
  InvalidQuery: 40002,
  RouteNotFound: 40400,
  NotFound: 40401,
  Conflict: 40901,
  PayloadTooLarge: 41301,
  UnprocessableEntity: 42201,
  InternalError: 50001,
} as const

export type ApiCodeValue = (typeof ApiCode)[keyof typeof ApiCode]

/** The uniform response envelope returned by every backend route. */
export interface ApiEnvelope<T = unknown> {
  code: number
  message: string
  data: T
}

/** Shape the backend may nest under `data` to carry a machine-readable error key. */
export interface ErrorCodePayload {
  errorCode?: string
}

export interface ApiErrorInit {
  /** Envelope business `code` (non-zero). 0 is never an error. */
  code: number
  message: string
  /** Machine-readable key from `data.errorCode` (frontend-design.md §7), if any. */
  errorCode?: string
  /** Real HTTP status when relevant (500/404, or transport failures). */
  httpStatus?: number
  /** True when the request was aborted (e.g. vue-query cancellation). */
  isCanceled?: boolean
  /** True for transport/timeout/infra failures (no valid envelope). */
  isInfra?: boolean
  cause?: unknown
}

/**
 * Normalized error every rejected request produces. Callers (vue-query onError,
 * ErrorHint) branch on `code` / `errorCode` rather than parsing raw responses.
 */
export class ApiError extends Error {
  readonly code: number
  readonly errorCode?: string
  readonly httpStatus?: number
  readonly isCanceled: boolean
  readonly isInfra: boolean

  constructor(init: ApiErrorInit) {
    super(init.message, { cause: init.cause })
    this.name = 'ApiError'
    this.code = init.code
    this.errorCode = init.errorCode
    this.httpStatus = init.httpStatus
    this.isCanceled = init.isCanceled ?? false
    this.isInfra = init.isInfra ?? false
  }
}
