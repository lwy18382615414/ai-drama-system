import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { DatabaseClient } from './client.js'
import {
  characterAppearanceVersions,
  characters,
  episodes,
  type CharacterAppearanceVersion,
} from './schema.js'

/**
 * The appearance a character should have in a given episode: the latest appearance
 * version effective at or before that episode, falling back to the character's base row.
 */
export interface ResolvedCharacterAppearance {
  characterId: string
  /** Version appearance, or the character's base appearance when no version applies. */
  appearance: string | null
  /** Version reference image, or the character's base reference image when no version applies. */
  referenceImageUrl: string | null
  /** Applied version id, or null when the character's base row is in effect. */
  versionId: string | null
  /** Episode number the applied version takes effect from; null for the base row. */
  effectiveFromEpisodeNo: number | null
}

export interface AppearanceVersionWithEffectiveNo {
  version: CharacterAppearanceVersion
  /** Live effective episode number: explicit for manual versions, joined from the source episode otherwise. */
  effectiveEpisodeNo: number
}

// Auto versions derive their effective episode number from the source episode at query
// time so batch re-plan renumbering is followed automatically; manual versions carry it
// explicitly. COALESCE picks whichever the row has (XOR-enforced at the service layer).
const effectiveNoSql = sql<number>`COALESCE(${characterAppearanceVersions.effectiveFromEpisodeNo}, ${episodes.episodeNo})`

/** All appearance versions of a character with live effective episode numbers, ascending. */
export async function listCharacterAppearanceVersions(
  db: DatabaseClient,
  characterId: string,
): Promise<AppearanceVersionWithEffectiveNo[]> {
  const rows = await db
    .select({ version: characterAppearanceVersions, effectiveEpisodeNo: effectiveNoSql })
    .from(characterAppearanceVersions)
    .leftJoin(episodes, eq(characterAppearanceVersions.sourceEpisodeId, episodes.id))
    .where(and(eq(characterAppearanceVersions.characterId, characterId), isNotNull(effectiveNoSql)))
    .orderBy(asc(effectiveNoSql), asc(characterAppearanceVersions.createdAt))

  return rows
}

/** Live effective episode number for a single version; null if the version doesn't exist. */
export async function getAppearanceVersionEffectiveNo(
  db: DatabaseClient,
  versionId: string,
): Promise<number | null> {
  const [row] = await db
    .select({ effectiveEpisodeNo: effectiveNoSql })
    .from(characterAppearanceVersions)
    .leftJoin(episodes, eq(characterAppearanceVersions.sourceEpisodeId, episodes.id))
    .where(eq(characterAppearanceVersions.id, versionId))
    .limit(1)

  return row?.effectiveEpisodeNo ?? null
}

/** Batch variant of {@link resolveCharacterAppearance}; two queries total, no N+1. */
export async function resolveCharacterAppearances(
  db: DatabaseClient,
  characterIds: string[],
  episodeNo: number,
): Promise<Map<string, ResolvedCharacterAppearance>> {
  const resolved = new Map<string, ResolvedCharacterAppearance>()
  if (characterIds.length === 0) return resolved

  const versionRows = await db
    .select({ version: characterAppearanceVersions, effectiveEpisodeNo: effectiveNoSql })
    .from(characterAppearanceVersions)
    .leftJoin(episodes, eq(characterAppearanceVersions.sourceEpisodeId, episodes.id))
    .where(
      and(
        inArray(characterAppearanceVersions.characterId, characterIds),
        isNotNull(effectiveNoSql),
        sql`${effectiveNoSql} <= ${episodeNo}`,
      ),
    )
    .orderBy(desc(effectiveNoSql), desc(characterAppearanceVersions.createdAt))

  // Rows come back best-first per the ordering; keep the first row seen per character.
  const winners = new Map<string, { version: CharacterAppearanceVersion; effectiveEpisodeNo: number }>()
  for (const row of versionRows) {
    if (!winners.has(row.version.characterId)) winners.set(row.version.characterId, row)
  }

  const characterRows = await db
    .select({
      id: characters.id,
      appearance: characters.appearance,
      referenceImageUrl: characters.referenceImageUrl,
    })
    .from(characters)
    .where(inArray(characters.id, characterIds))

  for (const character of characterRows) {
    const winner = winners.get(character.id)
    if (winner) {
      resolved.set(character.id, {
        characterId: character.id,
        appearance: winner.version.appearance,
        referenceImageUrl: winner.version.referenceImageUrl,
        versionId: winner.version.id,
        effectiveFromEpisodeNo: winner.effectiveEpisodeNo,
      })
    } else {
      resolved.set(character.id, {
        characterId: character.id,
        appearance: character.appearance,
        referenceImageUrl: character.referenceImageUrl,
        versionId: null,
        effectiveFromEpisodeNo: null,
      })
    }
  }

  return resolved
}

/** Resolves the appearance in effect for one character at the given episode; null if the character doesn't exist. */
export async function resolveCharacterAppearance(
  db: DatabaseClient,
  characterId: string,
  episodeNo: number,
): Promise<ResolvedCharacterAppearance | null> {
  const resolved = await resolveCharacterAppearances(db, [characterId], episodeNo)
  return resolved.get(characterId) ?? null
}
