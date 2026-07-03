import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, createDatabase, initializeDatabase } from './client.js'
import { projects } from './schema.js'

describe('database persistence', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ai-drama-db-'))
    file = join(dir, 'persist.sqlite')
  })

  afterEach(() => {
    // Best-effort: on Windows the WAL handle can linger briefly after close.
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // Temp dir; the OS reclaims it.
    }
  })

  it('keeps written rows after the connection is closed and reopened', async () => {
    const now = new Date().toISOString()

    const db = await createDatabase(file)
    await initializeDatabase(db)
    await db.insert(projects).values({
      id: 'p1',
      title: 'Persisted project',
      createdAt: now,
      updatedAt: now,
    })
    closeDatabase(db)

    // Reopen the same file — simulates a process restart.
    const reopened = await createDatabase(file)
    const rows = await reopened.select().from(projects).where(eq(projects.id, 'p1'))
    closeDatabase(reopened)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('Persisted project')
  })
})
