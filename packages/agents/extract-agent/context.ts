import { eq } from 'drizzle-orm'
import type { DatabaseClient, Episode, Project, Script } from '../../database/index.js'
import { characters, episodes, projects, props, scenes, scripts } from '../../database/index.js'
import { ScriptAgentOutputSchema, type ScriptAgentOutput } from '../script-agent/schema.js'
import type {
  ExtractAgentExistingCharacter,
  ExtractAgentExistingProp,
  ExtractAgentExistingScene,
  ExtractAgentInput,
} from './schema.js'

export interface ExtractAgentContext {
  project: Project
  episode: Episode
  script: Script
  scriptStructuredJson: ScriptAgentOutput
  existingCharacters: ExtractAgentExistingCharacter[]
  existingScenes: ExtractAgentExistingScene[]
  existingProps: ExtractAgentExistingProp[]
}

export async function buildExtractAgentContext(
  db: DatabaseClient,
  input: ExtractAgentInput,
): Promise<ExtractAgentContext> {
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
    throw new Error(`Extract input episode id does not match DB episode: ${input.episode.id}`)
  }

  if (input.episode.projectId !== input.projectId) {
    throw new Error(`Extract input episode belongs to a different project: ${input.episode.id}`)
  }

  const [script] = await db.select().from(scripts).where(eq(scripts.episodeId, input.episodeId)).limit(1)

  if (!script) {
    throw new Error(`Script not found for episode: ${input.episodeId}`)
  }

  if (script.projectId !== input.projectId) {
    throw new Error(`Script belongs to a different project: ${script.id}`)
  }

  if (script.episodeId !== input.episodeId) {
    throw new Error(`Script belongs to a different episode: ${script.id}`)
  }

  if (input.script.id !== script.id) {
    throw new Error(`Extract input script id does not match DB script: ${input.script.id}`)
  }

  if (input.script.projectId !== input.projectId) {
    throw new Error(`Extract input script belongs to a different project: ${input.script.id}`)
  }

  if (input.script.episodeId !== input.episodeId) {
    throw new Error(`Extract input script belongs to a different episode: ${input.script.id}`)
  }

  const scriptStructuredJson = ScriptAgentOutputSchema.parse(JSON.parse(script.structuredJson))

  const existingCharacterRows = await db.select().from(characters).where(eq(characters.projectId, input.projectId))
  const existingSceneRows = await db.select().from(scenes).where(eq(scenes.projectId, input.projectId))
  const existingPropRows = await db.select().from(props).where(eq(props.projectId, input.projectId))

  return {
    project,
    episode,
    script,
    scriptStructuredJson,
    existingCharacters: existingCharacterRows.map((character) => ({
      id: character.id,
      projectId: character.projectId,
      name: character.name,
      aliasJson: parseStringArray(character.aliasJson),
      role: character.role,
      age: character.age,
      gender: character.gender,
      appearance: character.appearance,
      personality: character.personality,
      background: character.background,
      relationshipJson: parseUnknownArray(character.relationshipJson),
      referenceImageUrl: character.referenceImageUrl,
      voiceId: character.voiceId,
      status: character.status,
    })),
    existingScenes: existingSceneRows.map((scene) => ({
      id: scene.id,
      projectId: scene.projectId,
      name: scene.name,
      description: scene.description,
      locationType: scene.locationType,
      visualStyle: scene.visualStyle,
      visualPrompt: scene.visualPrompt,
      referenceImageUrl: scene.referenceImageUrl,
      status: scene.status,
    })),
    existingProps: existingPropRows.map((prop) => ({
      id: prop.id,
      projectId: prop.projectId,
      name: prop.name,
      description: prop.description,
      significance: prop.significance,
      visualPrompt: prop.visualPrompt,
      referenceImageUrl: prop.referenceImageUrl,
      status: prop.status,
    })),
  }
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function parseUnknownArray(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
