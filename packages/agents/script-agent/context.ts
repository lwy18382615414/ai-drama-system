import { eq } from 'drizzle-orm'
import type { DatabaseClient, Episode, Project, Script } from '../../database/index.js'
import { episodeEventLinks, episodes, novelEvents, projects, scripts } from '../../database/index.js'
import type {
  ScriptAgentEpisodeEventLink,
  ScriptAgentInput,
  ScriptAgentLinkedNovelEvent,
} from './schema.js'

export interface ScriptAgentOrderedSourceEvent {
  link: ScriptAgentEpisodeEventLink
  event: ScriptAgentLinkedNovelEvent
}

export interface ScriptAgentContext {
  project: Project
  episode: Episode
  existingScript: Script | null
  episodeEventLinks: ScriptAgentEpisodeEventLink[]
  linkedNovelEvents: ScriptAgentLinkedNovelEvent[]
  orderedSourceEvents: ScriptAgentOrderedSourceEvent[]
}

export async function buildScriptAgentContext(
  db: DatabaseClient,
  input: ScriptAgentInput,
): Promise<ScriptAgentContext> {
  const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)

  if (!project) {
    throw new Error(`Project not found: ${input.projectId}`)
  }

  const [episode] = await db.select().from(episodes).where(eq(episodes.id, input.episodeId)).limit(1)

  if (!episode) {
    throw new Error(`Episode not found: ${input.episodeId}`)
  }

  if (episode.projectId !== input.projectId) {
    throw new Error(`Episode belongs to a different project: ${input.episodeId}`)
  }

  if (input.episode.id !== episode.id) {
    throw new Error(`Script input episode id does not match DB episode: ${input.episode.id}`)
  }

  if (input.episode.projectId !== input.projectId) {
    throw new Error(`Script input episode belongs to a different project: ${input.episode.id}`)
  }

  const [existingScript = null] = await db.select().from(scripts).where(eq(scripts.episodeId, input.episodeId)).limit(1)

  const sourceRows = await db
    .select({
      link: episodeEventLinks,
      event: novelEvents,
    })
    .from(episodeEventLinks)
    .innerJoin(novelEvents, eq(episodeEventLinks.novelEventId, novelEvents.id))
    .where(eq(episodeEventLinks.episodeId, input.episodeId))
    .orderBy(episodeEventLinks.orderInEpisode)

  if (sourceRows.length === 0) {
    throw new Error(`Script generation requires at least one linked novel event: ${input.episodeId}`)
  }

  const normalizedLinks = sourceRows.map(({ link }) => ({
    id: link.id,
    projectId: link.projectId,
    episodeId: link.episodeId,
    novelEventId: link.novelEventId,
    orderInEpisode: link.orderInEpisode,
    usageType: link.usageType,
  }))

  const normalizedEvents = sourceRows.map(({ event }) => ({
    id: event.id,
    projectId: event.projectId,
    chapterId: event.chapterId,
    eventNo: event.eventNo,
    eventType: event.eventType,
    summary: event.summary,
    detail: event.detail,
    characters: parseCharacters(event.charactersJson),
    location: event.location,
    timeHint: event.timeHint,
    emotionTone: event.emotionTone,
    conflictLevel: event.conflictLevel,
    importance: event.importance,
  }))

  for (const link of normalizedLinks) {
    if (link.projectId !== input.projectId) {
      throw new Error(`Episode event link belongs to a different project: ${link.id}`)
    }

    if (link.episodeId !== input.episodeId) {
      throw new Error(`Episode event link belongs to a different episode: ${link.id}`)
    }
  }

  for (const event of normalizedEvents) {
    if (event.projectId !== input.projectId) {
      throw new Error(`Linked novel event belongs to a different project: ${event.id}`)
    }
  }

  assertSameSet(
    'episode_event_links',
    input.episodeEventLinks.map((link) => link.id),
    normalizedLinks.map((link) => link.id),
  )
  assertSameSet(
    'linked novel_events',
    input.linkedNovelEvents.map((event) => event.id),
    normalizedEvents.map((event) => event.id),
  )

  const normalizedEventIds = new Set(normalizedEvents.map((event) => event.id))
  for (const link of input.episodeEventLinks) {
    if (link.projectId !== input.projectId) {
      throw new Error(`Script input link belongs to a different project: ${link.id}`)
    }

    if (link.episodeId !== input.episodeId) {
      throw new Error(`Script input link belongs to a different episode: ${link.id}`)
    }

    if (!normalizedEventIds.has(link.novelEventId)) {
      throw new Error(`Script input link references an unknown linked novel event: ${link.novelEventId}`)
    }
  }

  const eventById = new Map(normalizedEvents.map((event) => [event.id, event]))
  const orderedSourceEvents = normalizedLinks.map((link) => {
    const event = eventById.get(link.novelEventId)

    if (!event) {
      throw new Error(`Linked novel event not found for episode link: ${link.novelEventId}`)
    }

    return { link, event }
  })

  return {
    project,
    episode,
    existingScript,
    episodeEventLinks: normalizedLinks,
    linkedNovelEvents: normalizedEvents,
    orderedSourceEvents,
  }
}

function assertSameSet(label: string, inputIds: string[], dbIds: string[]) {
  const inputSet = new Set(inputIds)
  const dbSet = new Set(dbIds)

  if (inputSet.size !== inputIds.length) {
    throw new Error(`Script input has duplicate ${label} ids`)
  }

  if (inputSet.size !== dbSet.size) {
    throw new Error(`Script input ${label} do not match DB state`)
  }

  for (const id of inputSet) {
    if (!dbSet.has(id)) {
      throw new Error(`Script input ${label} contain unknown id: ${id}`)
    }
  }
}

function parseCharacters(charactersJson: string) {
  try {
    const parsed = JSON.parse(charactersJson)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}
