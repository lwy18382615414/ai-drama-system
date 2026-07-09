import type { Context } from 'hono'
import { z } from 'zod/v4'

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

type SuccessStatus = 200 | 201 | 202
type ApiErrorCode = (typeof ApiCode)[keyof Omit<typeof ApiCode, 'Ok'>]

/**
 * Business/logic failures do NOT expose an HTTP error status: they return HTTP
 * 200 and convey the real error only through the internal `code`. Only genuine
 * infrastructure failures keep a real HTTP status — server crashes (500, via
 * `internalError`) and unregistered routes (404, via `routeNotFound`). See
 * `docs/api-design.md` for the full contract.
 */

export function ok<T>(c: Context, data: T, status: SuccessStatus = 200, message = 'ok') {
  return c.json({ code: ApiCode.Ok, message, data }, status)
}

/** Business/logic failure: always HTTP 200, error carried by `code`. */
export function fail<T = unknown>(
  c: Context,
  code: ApiErrorCode,
  message: string,
  data: T | null = null,
) {
  return c.json({ code, message, data }, 200)
}

export function invalidRequestBody(c: Context, issues: unknown[]) {
  return fail(c, ApiCode.InvalidRequestBody, 'Invalid request body', { issues })
}

export function invalidQuery(c: Context, message = 'Invalid force query parameter') {
  return fail(c, ApiCode.InvalidQuery, message)
}

export function notFound(c: Context, message: string) {
  return fail(c, ApiCode.NotFound, message)
}

/** 422 semantics for semantically invalid requests (e.g. planning chapters whose events aren't extracted). */
export function unprocessable<T = unknown>(c: Context, message: string, data: T | null = null) {
  return fail(c, ApiCode.UnprocessableEntity, message, data)
}

/** Maps a service's internal `statusCode` classification key to a business `code`. */
export function serviceErrorCode(statusCode: number) {
  if (statusCode === 404) return ApiCode.NotFound
  if (statusCode === 409) return ApiCode.Conflict
  if (statusCode === 413) return ApiCode.PayloadTooLarge
  if (statusCode === 422) return ApiCode.UnprocessableEntity
  return ApiCode.InvalidRequestBody
}

interface ServiceLikeError {
  statusCode: number
  message: string
  data?: unknown
  /** Optional machine-readable code the frontend maps to a friendly localized message. */
  errorCode?: string
}

/**
 * Duck-typed so a single handler covers every service Error class
 * (ProjectServiceError, ChapterImportServiceError, EpisodePlannerServiceError,
 * EpubImportServiceError, EventAgentServiceError, …) without cross-package
 * `instanceof` coupling.
 */
function isServiceError(error: unknown): error is ServiceLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number' &&
    typeof (error as { message?: unknown }).message === 'string'
  )
}

/** Unified service-error translator shared by all routes. */
export function handleServiceError(c: Context, error: unknown) {
  if (error instanceof z.ZodError) {
    return invalidRequestBody(c, error.issues)
  }

  if (isServiceError(error)) {
    if (error.statusCode === 422) {
      return unprocessable(c, error.message, error.data ?? null)
    }
    // Surface a machine-readable errorCode (when the service set one) in `data` so the
    // frontend can show a friendly localized message instead of the raw English text.
    return fail(
      c,
      serviceErrorCode(error.statusCode),
      error.message,
      error.errorCode ? { errorCode: error.errorCode } : null,
    )
  }

  return internalError(c, error)
}

/** Genuine infrastructure failure: keeps HTTP 500. Raw cause is logged, not exposed. */
export function internalError(c: Context, error: unknown) {
  console.error('[internal-error]', error)
  return c.json(
    { code: ApiCode.InternalError, message: '服务器开小差了，请稍后重试', data: null },
    500,
  )
}

/** Unregistered route: keeps a real HTTP 404, distinct from resource-not-found (200 + 40401). */
export function routeNotFound(c: Context) {
  return c.json({ code: ApiCode.RouteNotFound, message: '接口不存在', data: null }, 404)
}
