import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

describe('app routes', () => {
  it('wraps health responses in the API envelope', async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL
    const previousTextApiKey = process.env.TEXT_PROVIDER_API_KEY
    const previousTextBaseUrl = process.env.TEXT_PROVIDER_BASE_URL
    const previousImageApiKey = process.env.IMAGE_PROVIDER_API_KEY
    const previousImageBaseUrl = process.env.IMAGE_PROVIDER_BASE_URL

    process.env.DATABASE_URL = ':memory:'
    process.env.TEXT_PROVIDER_API_KEY = 'test-text-key'
    process.env.TEXT_PROVIDER_BASE_URL = 'http://localhost/text'
    process.env.IMAGE_PROVIDER_API_KEY = 'test-image-key'
    process.env.IMAGE_PROVIDER_BASE_URL = 'http://localhost/image'

    try {
      const { app } = await createApp()
      const response = await app.request('/health')

      expect(response.status).toBe(200)
      const body = (await response.json()) as ApiResponse<{ ok: true }>
      expect(body).toEqual({ code: 0, message: 'ok', data: { ok: true } })
    } finally {
      restoreEnv('DATABASE_URL', previousDatabaseUrl)
      restoreEnv('TEXT_PROVIDER_API_KEY', previousTextApiKey)
      restoreEnv('TEXT_PROVIDER_BASE_URL', previousTextBaseUrl)
      restoreEnv('IMAGE_PROVIDER_API_KEY', previousImageApiKey)
      restoreEnv('IMAGE_PROVIDER_BASE_URL', previousImageBaseUrl)
    }
  })

  // Unregistered routes are the one "failure" case that keeps a real HTTP status
  // (404), distinct from a resource that exists-but-is-missing (HTTP 200 + 40401).
  it('returns a real 404 with the RouteNotFound envelope for unknown routes', async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL
    const previousTextApiKey = process.env.TEXT_PROVIDER_API_KEY
    const previousTextBaseUrl = process.env.TEXT_PROVIDER_BASE_URL
    const previousImageApiKey = process.env.IMAGE_PROVIDER_API_KEY
    const previousImageBaseUrl = process.env.IMAGE_PROVIDER_BASE_URL

    process.env.DATABASE_URL = ':memory:'
    process.env.TEXT_PROVIDER_API_KEY = 'test-text-key'
    process.env.TEXT_PROVIDER_BASE_URL = 'http://localhost/text'
    process.env.IMAGE_PROVIDER_API_KEY = 'test-image-key'
    process.env.IMAGE_PROVIDER_BASE_URL = 'http://localhost/image'

    try {
      const { app } = await createApp()
      const response = await app.request('/api/this-route-does-not-exist')

      expect(response.status).toBe(404)
      const body = (await response.json()) as ApiResponse<null>
      expect(body.code).toBe(40400)
      expect(body.data).toBeNull()
    } finally {
      restoreEnv('DATABASE_URL', previousDatabaseUrl)
      restoreEnv('TEXT_PROVIDER_API_KEY', previousTextApiKey)
      restoreEnv('TEXT_PROVIDER_BASE_URL', previousTextBaseUrl)
      restoreEnv('IMAGE_PROVIDER_API_KEY', previousImageApiKey)
      restoreEnv('IMAGE_PROVIDER_BASE_URL', previousImageBaseUrl)
    }
  })
})

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}
