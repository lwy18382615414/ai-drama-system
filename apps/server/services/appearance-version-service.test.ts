import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  assets,
  characterAppearanceVersions,
  characters,
  createDatabase,
  episodes,
  generationTasks,
  initializeDatabase,
  projects,
  type DatabaseClient,
} from '../../../packages/database/index.js'
import {
  AppearanceVersionServiceError,
  CreateAppearanceVersionRequestSchema,
  UpdateAppearanceVersionRequestSchema,
  createAppearanceVersion,
  deleteAppearanceVersion,
  listAppearanceVersions,
  updateAppearanceVersion,
} from './appearance-version-service.js'

const now = new Date().toISOString()

async function createTestDb() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  return db
}

async function seed(db: DatabaseClient) {
  await db.insert(projects).values({
    id: 'project-1',
    title: 't',
    genre: 'drama',
    targetPlatform: 'short_video',
    visualStyle: 'realistic',
    episodeDuration: 60,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(episodes).values([
    {
      id: 'ep-1',
      projectId: 'project-1',
      episodeNo: 1,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'ep-2',
      projectId: 'project-1',
      episodeNo: 2,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    },
  ])
  await db.insert(characters).values({
    id: 'c1',
    projectId: 'project-1',
    name: '林晚',
    appearance: 'base',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })
}

async function seedAutoVersion(db: DatabaseClient, id = 'v-auto') {
  await db.insert(characterAppearanceVersions).values({
    id,
    characterId: 'c1',
    sourceEpisodeId: 'ep-2',
    effectiveFromEpisodeNo: null,
    appearance: 'scarred face',
    referenceImageUrl: null,
    changeReason: 'injury',
    createdAt: now,
    updatedAt: now,
  })
}

describe('appearance-version-service', () => {
  it('validates create/update request schemas', () => {
    expect(CreateAppearanceVersionRequestSchema.safeParse({ appearance: 'x' }).success).toBe(false)
    expect(CreateAppearanceVersionRequestSchema.safeParse({ effectiveFromEpisodeNo: 3 }).success).toBe(false)
    expect(
      CreateAppearanceVersionRequestSchema.safeParse({ appearance: 'x', effectiveFromEpisodeNo: 3 }).success,
    ).toBe(true)
    expect(UpdateAppearanceVersionRequestSchema.safeParse({}).success).toBe(false)
    expect(UpdateAppearanceVersionRequestSchema.safeParse({ appearance: 'y' }).success).toBe(true)
  })

  it('creates a manual version and lists versions with live effective numbers', async () => {
    const db = await createTestDb()
    await seed(db)
    await seedAutoVersion(db)

    const created = await createAppearanceVersion(db, 'c1', {
      appearance: 'white hair',
      effectiveFromEpisodeNo: 5,
      changeReason: 'time skip',
    })
    expect(created.sourceEpisodeId).toBeNull()
    expect(created.effectiveFromEpisodeNo).toBe(5)
    // Manual version: effectiveEpisodeNo mirrors the requested episode, matching the list endpoint.
    expect(created.effectiveEpisodeNo).toBe(5)

    const listed = await listAppearanceVersions(db, 'c1')
    expect(listed.versions.map((v) => [v.id, v.effectiveEpisodeNo])).toEqual([
      ['v-auto', 2],
      [created.id, 5],
    ])
  })

  it('rejects create for a missing character and conflicting effective episode', async () => {
    const db = await createTestDb()
    await seed(db)

    await expect(
      createAppearanceVersion(db, 'missing', { appearance: 'x', effectiveFromEpisodeNo: 3 }),
    ).rejects.toMatchObject({ statusCode: 404 })

    await createAppearanceVersion(db, 'c1', { appearance: 'x', effectiveFromEpisodeNo: 3 })
    await expect(
      createAppearanceVersion(db, 'c1', { appearance: 'y', effectiveFromEpisodeNo: 3 }),
    ).rejects.toMatchObject({ statusCode: 409, errorCode: 'APPEARANCE_VERSION_EPISODE_CONFLICT' })
  })

  it('rejects moving an auto version and allows editing its appearance', async () => {
    const db = await createTestDb()
    await seed(db)
    await seedAutoVersion(db)

    await expect(
      updateAppearanceVersion(db, 'v-auto', { effectiveFromEpisodeNo: 4 }),
    ).rejects.toMatchObject({ statusCode: 400, errorCode: 'APPEARANCE_VERSION_AUTO_EFFECTIVE_NO' })

    const updated = await updateAppearanceVersion(db, 'v-auto', { appearance: 'edited scar' })
    expect(updated.appearance).toBe('edited scar')
    // Auto version: effectiveEpisodeNo is joined from the source episode (ep-2 → 2), not null.
    expect(updated.effectiveEpisodeNo).toBe(2)

    const [row] = await db
      .select()
      .from(characterAppearanceVersions)
      .where(eq(characterAppearanceVersions.id, 'v-auto'))
    expect(row.appearance).toBe('edited scar')
    expect(row.sourceEpisodeId).toBe('ep-2')
  })

  it('deletes a version and supersedes its active assets', async () => {
    const db = await createTestDb()
    await seed(db)
    await seedAutoVersion(db)
    await db.insert(assets).values({
      id: 'asset-1',
      projectId: 'project-1',
      assetType: 'character_appearance_version',
      targetType: 'character_appearance_version',
      targetId: 'v-auto',
      url: '/static/v.png',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    await deleteAppearanceVersion(db, 'v-auto')

    expect(await db.select().from(characterAppearanceVersions)).toHaveLength(0)
    const [asset] = await db.select().from(assets).where(eq(assets.id, 'asset-1'))
    expect(asset.status).toBe('superseded')

    await expect(deleteAppearanceVersion(db, 'v-auto')).rejects.toBeInstanceOf(AppearanceVersionServiceError)
  })

  it('refuses to delete a version with an in-flight image task', async () => {
    const db = await createTestDb()
    await seed(db)
    await seedAutoVersion(db)
    await db.insert(generationTasks).values({
      id: 'task-1',
      projectId: 'project-1',
      targetType: 'character_appearance_version',
      targetId: 'v-auto',
      taskType: 'image_generation',
      inputJson: '{}',
      status: 'pending',
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    })

    await expect(deleteAppearanceVersion(db, 'v-auto')).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'APPEARANCE_VERSION_TASK_IN_FLIGHT',
    })
    expect(await db.select().from(characterAppearanceVersions)).toHaveLength(1)
  })
})
