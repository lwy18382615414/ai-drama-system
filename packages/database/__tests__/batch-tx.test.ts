import { asc, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createDatabase, initializeDatabase, type DatabaseClient } from '../index.js'
import { batches, episodes, projects } from '../schema.js'
import { shiftEpisodeNumbers } from '../batch-tx.js'

async function createTestDb() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  return db
}

/** Seed a project with two batches: batch 1 = episodes [1..b1End], batch 2 = [b1End+1..b2End]. */
async function seed(db: DatabaseClient, b1End: number, b2End: number) {
  const now = new Date().toISOString()
  await db.insert(projects).values({
    id: 'p1',
    title: 't',
    genre: 'drama',
    targetPlatform: 'short_video',
    visualStyle: 'realistic',
    episodeDuration: 60,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(batches).values([
    {
      id: 'b1',
      projectId: 'p1',
      batchNo: 1,
      chapterStartNo: 1,
      chapterEndNo: 1,
      episodeStartNo: 1,
      episodeEndNo: b1End,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'b2',
      projectId: 'p1',
      batchNo: 2,
      chapterStartNo: 2,
      chapterEndNo: 2,
      episodeStartNo: b1End + 1,
      episodeEndNo: b2End,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    },
  ])
  const rows = []
  for (let no = 1; no <= b2End; no += 1) {
    rows.push({
      id: `ep-${no}`,
      projectId: 'p1',
      batchId: no <= b1End ? 'b1' : 'b2',
      episodeNo: no,
      title: `E${no}`,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    })
  }
  await db.insert(episodes).values(rows)
}

async function episodeNos(db: DatabaseClient) {
  const rows = await db.select().from(episodes).where(eq(episodes.projectId, 'p1')).orderBy(asc(episodes.episodeNo))
  return rows.map((r) => r.episodeNo)
}

describe('shiftEpisodeNumbers', () => {
  it('is a no-op when delta is 0', async () => {
    const db = await createTestDb()
    await seed(db, 2, 4)
    await shiftEpisodeNumbers(db, 'p1', 2, 0)
    expect(await episodeNos(db)).toEqual([1, 2, 3, 4])
  })

  it('shifts episodes after the boundary up by a positive delta without UNIQUE collision', async () => {
    const db = await createTestDb()
    await seed(db, 2, 4) // batch1 = eps 1,2 ; batch2 = eps 3,4
    // Batch 1 grew by 1: everything after episode 2 moves up by 1 → 3,4 become 4,5.
    await shiftEpisodeNumbers(db, 'p1', 2, 1)
    expect(await episodeNos(db)).toEqual([1, 2, 4, 5])

    const [b2] = await db.select().from(batches).where(eq(batches.id, 'b2'))
    expect([b2.episodeStartNo, b2.episodeEndNo]).toEqual([4, 5])
  })

  it('shifts episodes after the boundary down by a negative delta', async () => {
    const db = await createTestDb()
    await seed(db, 3, 5) // batch1 = eps 1,2,3 ; batch2 = eps 4,5
    // Real re-plan shrinks batch 1 from 3→2 episodes: its old episodes are deleted first,
    // then the boundary (batch 1's original episodeEndNo = 3) is passed with delta -1.
    // The freed slot at 3 lets batch 2's 4,5 slide down to 3,4 with no collision.
    await db.delete(episodes).where(eq(episodes.batchId, 'b1'))
    await shiftEpisodeNumbers(db, 'p1', 3, -1)
    expect(await episodeNos(db)).toEqual([3, 4])

    const [b2] = await db.select().from(batches).where(eq(batches.id, 'b2'))
    expect([b2.episodeStartNo, b2.episodeEndNo]).toEqual([3, 4])
  })

  it('only shifts episodes strictly after the boundary', async () => {
    const db = await createTestDb()
    await seed(db, 2, 4)
    await shiftEpisodeNumbers(db, 'p1', 2, 10)
    // Episodes 1,2 (<= boundary) untouched; 3,4 → 13,14.
    expect(await episodeNos(db)).toEqual([1, 2, 13, 14])
  })
})
