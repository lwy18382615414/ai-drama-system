/** Public surface of the api layer. */
export { http } from './http'
export { request, get, post, put, patch, del } from './request'
export { taskStreamUrl } from './sse'
export { queryKeys } from './queryKeys'
export { ApiCode, ApiError } from './types'
export type { ApiEnvelope, ApiCodeValue, ApiErrorInit } from './types'

// Shared domain models (hand-mirrored DB rows + service shapes).
export type * from './models'

// Resource modules — one per query-key domain.
export * from './projects'
export * from './novel'
export * from './chapters'
export * from './batches'
export * from './episodes'
export * from './events'
export * from './script'
export * from './assets'
export * from './storyboards'
export * from './pipeline'
export * from './appearanceVersions'
export * from './generation'
