import type { Context } from 'hono'

export const ApiCode = {
  Ok: 0,
  InvalidRequestBody: 40001,
  InvalidQuery: 40002,
  NotFound: 40401,
  Conflict: 40901,
  PayloadTooLarge: 41301,
  UnprocessableEntity: 42201,
  InternalError: 50001,
} as const

type SuccessStatus = 200 | 201 | 202
type ErrorStatus = 400 | 404 | 409 | 413 | 422 | 500
type ApiErrorCode = (typeof ApiCode)[keyof Omit<typeof ApiCode, 'Ok'>]

export function ok<T>(c: Context, data: T, status: SuccessStatus = 200, message = 'ok') {
  return c.json({ code: ApiCode.Ok, message, data }, status)
}

export function fail<T = unknown>(
  c: Context,
  code: ApiErrorCode,
  message: string,
  status: ErrorStatus,
  data: T | null = null,
) {
  return c.json({ code, message, data }, status)
}

export function invalidRequestBody(c: Context, issues: unknown[]) {
  return fail(c, ApiCode.InvalidRequestBody, 'Invalid request body', 400, { issues })
}

export function invalidQuery(c: Context, message = 'Invalid force query parameter') {
  return fail(c, ApiCode.InvalidQuery, message, 400)
}

export function notFound(c: Context, message: string) {
  return fail(c, ApiCode.NotFound, message, 404)
}

/** 422 for semantically invalid requests (e.g. planning chapters whose events aren't extracted). */
export function unprocessable<T = unknown>(c: Context, message: string, data: T | null = null) {
  return fail(c, ApiCode.UnprocessableEntity, message, 422, data)
}

export function serviceErrorCode(statusCode: number) {
  if (statusCode === 404) return ApiCode.NotFound
  if (statusCode === 409) return ApiCode.Conflict
  if (statusCode === 413) return ApiCode.PayloadTooLarge
  if (statusCode === 422) return ApiCode.UnprocessableEntity
  return ApiCode.InvalidRequestBody
}

export function internalError(c: Context, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return fail(c, ApiCode.InternalError, message, 500)
}
