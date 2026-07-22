import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createDatabase, initializeDatabase, type DatabaseClient } from '../index.js'
import { characterAppearanceVersions, characters, episodes, projects } from '../schema.js'
import {
  listCharacterAppearanceVersions,
  resolveCharacterAppearance,
  resolveCharacterAppearances,
} from '../appearance-resolver.js'

const now = new Date().toISOString()

async function createTestDb() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  return db
}

/** Seed a project with episodes 1..episodeCount and one character with a base appearance/image. */
async function seed(db: DatabaseClient, episodeCount: number) {
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
  const rows = []
  for (let no = 1; no <= episodeCount; no += 1) {
    rows.push({
      id: `ep-${no}`,
      projectId: 'p1',
      episodeNo: no,
      title: `E${no}`,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    })
  }
  await db.insert(episodes).values(rows)
  await db.insert(characters).values({
    id: 'c1',
    projectId: 'p1',
    name: '林风',
    appearance: 'base appearance',
    referenceImageUrl: '/static/base.png',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })
}

function autoVersion(id: string, sourceEpisodeId: string, appearance: string, imageUrl: string | null = null) {
  return {
    id,
    characterId: 'c1',
    sourceEpisodeId,
    effectiveFromEpisodeNo: null,
    appearance,
    referenceImageUrl: imageUrl,
    changeReason: null,
    createdAt: now,
    updatedAt: now,
  }
}

describe('resolveCharacterAppearance', () => {
  it('falls back to the character base row when no version applies', async () => {
    const db = await createTestDb()
    await seed(db, 3)

    const resolved = await resolveCharacterAppearance(db, 'c1', 2)
    expect(resolved).toEqual({
      characterId: 'c1',
      appearance: 'base appearance',
      referenceImageUrl: '/static/base.png',
      versionId: null,
      effectiveFromEpisodeNo: null,
    })
  })

  it('returns null for a missing character', async () => {
    const db = await createTestDb()
    await seed(db, 1)
    expect(await resolveCharacterAppearance(db, 'nope', 1)).toBeNull()
  })

  it('picks the latest version effective at or before the episode, mixing auto and manual', async () => {
    const db = await createTestDb()
    await seed(db, 6)
    await db.insert(characterAppearanceVersions).values([
      autoVersion('v-ep2', 'ep-2', 'scarred face', '/static/v2.png'),
      {
        ...autoVersion('v-manual', 'ep-0-unused', 'white hair', '/static/v5.png'),
        sourceEpisodeId: null,
        effectiveFromEpisodeNo: 5,
      },
    ])

    const ep1 = await resolveCharacterAppearance(db, 'c1', 1)
    expect(ep1?.versionId).toBeNull()
    expect(ep1?.appearance).toBe('base appearance')

    const ep2 = await resolveCharacterAppearance(db, 'c1', 2)
    expect(ep2?.versionId).toBe('v-ep2')
    expect(ep2?.effectiveFromEpisodeNo).toBe(2)

    const ep4 = await resolveCharacterAppearance(db, 'c1', 4)
    expect(ep4?.versionId).toBe('v-ep2')

    const ep6 = await resolveCharacterAppearance(db, 'c1', 6)
    expect(ep6?.versionId).toBe('v-manual')
    expect(ep6?.appearance).toBe('white hair')
    expect(ep6?.effectiveFromEpisodeNo).toBe(5)
  })

  it('follows episode renumbering for auto versions', async () => {
    const db = await createTestDb()
    await seed(db, 3)
    await db.insert(characterAppearanceVersions).values(autoVersion('v1', 'ep-2', 'scarred face'))

    // Simulate a re-plan renumbering episode 2 → 3.
    await db.update(episodes).set({ episodeNo: 5 }).where(eq(episodes.id, 'ep-3'))
    await db.update(episodes).set({ episodeNo: 3 }).where(eq(episodes.id, 'ep-2'))

    const at2 = await resolveCharacterAppearance(db, 'c1', 2)
    expect(at2?.versionId).toBeNull()
    const at3 = await resolveCharacterAppearance(db, 'c1', 3)
    expect(at3?.versionId).toBe('v1')
    expect(at3?.effectiveFromEpisodeNo).toBe(3)
  })

  it('falls back after the source episode is deleted (cascade)', async () => {
    const db = await createTestDb()
    await seed(db, 3)
    await db.insert(characterAppearanceVersions).values(autoVersion('v1', 'ep-2', 'scarred face'))

    await db.delete(episodes).where(eq(episodes.id, 'ep-2'))

    const rows = await db.select().from(characterAppearanceVersions)
    expect(rows).toHaveLength(0)
    const resolved = await resolveCharacterAppearance(db, 'c1', 3)
    expect(resolved?.versionId).toBeNull()
    expect(resolved?.appearance).toBe('base appearance')
  })
})

describe('resolveCharacterAppearances (batch)', () => {
  it('resolves multiple characters in one call, each independently', async () => {
    const db = await createTestDb()
    await seed(db, 3)
    await db.insert(characters).values({
      id: 'c2',
      projectId: 'p1',
      name: '苏晚',
      appearance: 'c2 base',
      referenceImageUrl: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(characterAppearanceVersions).values(autoVersion('v1', 'ep-2', 'scarred face', '/static/v.png'))

    const resolved = await resolveCharacterAppearances(db, ['c1', 'c2', 'missing'], 3)
    expect(resolved.size).toBe(2)
    expect(resolved.get('c1')?.versionId).toBe('v1')
    expect(resolved.get('c1')?.referenceImageUrl).toBe('/static/v.png')
    expect(resolved.get('c2')?.versionId).toBeNull()
    expect(resolved.get('c2')?.appearance).toBe('c2 base')
  })

  it('returns an empty map for an empty id list', async () => {
    const db = await createTestDb()
    await seed(db, 1)
    expect((await resolveCharacterAppearances(db, [], 1)).size).toBe(0)
  })
})

describe('listCharacterAppearanceVersions', () => {
  it('lists versions with live effective numbers in ascending order', async () => {
    const db = await createTestDb()
    await seed(db, 6)
    await db.insert(characterAppearanceVersions).values([
      {
        ...autoVersion('v-manual', 'unused', 'white hair'),
        sourceEpisodeId: null,
        effectiveFromEpisodeNo: 5,
      },
      autoVersion('v-ep2', 'ep-2', 'scarred face'),
    ])

    const listed = await listCharacterAppearanceVersions(db, 'c1')
    expect(listed.map((v) => [v.version.id, v.effectiveEpisodeNo])).toEqual([
      ['v-ep2', 2],
      ['v-manual', 5],
    ])
  })
})
