import { eq } from 'drizzle-orm'
import type { DatabaseClient, Episode, Project, Script, Storyboard } from '../../database/index.js'
import {
  characters,
  episodeCharacterLinks,
  episodePropLinks,
  episodeSceneLinks,
  episodes,
  projects,
  props,
  resolveCharacterAppearances,
  scenes,
  scripts,
  storyboards,
} from '../../database/index.js'
import { ScriptAgentOutputSchema, type ScriptAgentOutput } from '../script-agent/schema.js'
import type {
  StoryboardAgentCharacter,
  StoryboardAgentInput,
  StoryboardAgentProp,
  StoryboardAgentScene,
} from './schema.js'

export interface StoryboardAgentContext {
  project: Project
  episode: Episode
  script: Script
  scriptStructuredJson: ScriptAgentOutput
  characters: StoryboardAgentCharacter[]
  scenes: StoryboardAgentScene[]
  props: StoryboardAgentProp[]
  existingStoryboards: Storyboard[]
}

export async function buildStoryboardAgentContext(
  db: DatabaseClient,
  input: StoryboardAgentInput,
): Promise<StoryboardAgentContext> {
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
    throw new Error(`Storyboard input episode id does not match DB episode: ${input.episode.id}`)
  }

  if (input.episode.projectId !== input.projectId) {
    throw new Error(`Storyboard input episode belongs to a different project: ${input.episode.id}`)
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
    throw new Error(`Storyboard input script id does not match DB script: ${input.script.id}`)
  }

  if (input.script.projectId !== input.projectId) {
    throw new Error(`Storyboard input script belongs to a different project: ${input.script.id}`)
  }

  if (input.script.episodeId !== input.episodeId) {
    throw new Error(`Storyboard input script belongs to a different episode: ${input.script.id}`)
  }

  const scriptStructuredJson = ScriptAgentOutputSchema.parse(JSON.parse(script.structuredJson))

  const characterRows = await db
    .select({ character: characters })
    .from(episodeCharacterLinks)
    .innerJoin(characters, eq(episodeCharacterLinks.characterId, characters.id))
    .where(eq(episodeCharacterLinks.episodeId, input.episodeId))
    .orderBy(characters.name)

  const sceneRows = await db
    .select({ scene: scenes })
    .from(episodeSceneLinks)
    .innerJoin(scenes, eq(episodeSceneLinks.sceneId, scenes.id))
    .where(eq(episodeSceneLinks.episodeId, input.episodeId))
    .orderBy(scenes.name)

  const propRows = await db
    .select({ prop: props })
    .from(episodePropLinks)
    .innerJoin(props, eq(episodePropLinks.propId, props.id))
    .where(eq(episodePropLinks.episodeId, input.episodeId))
    .orderBy(props.name)

  if (sceneRows.length === 0) {
    throw new Error(`Storyboard generation requires at least one linked scene: ${input.episodeId}`)
  }

  // Appearance is episode-dependent: use the appearance version in effect for this
  // episode (falling back to the character's base row) so shot prompts describe the
  // right look after scars, haircuts, or time skips.
  const resolvedAppearances = await resolveCharacterAppearances(
    db,
    characterRows.map(({ character }) => character.id),
    episode.episodeNo,
  )

  const normalizedCharacters = characterRows.map(({ character }) => ({
    id: character.id,
    projectId: character.projectId,
    name: character.name,
    role: character.role,
    appearance: resolvedAppearances.get(character.id)?.appearance ?? character.appearance,
    status: character.status,
  }))

  const normalizedScenes = sceneRows.map(({ scene }) => ({
    id: scene.id,
    projectId: scene.projectId,
    name: scene.name,
    description: scene.description,
    locationType: scene.locationType,
    visualStyle: scene.visualStyle,
    visualPrompt: scene.visualPrompt,
    status: scene.status,
  }))

  const normalizedProps = propRows.map(({ prop }) => ({
    id: prop.id,
    projectId: prop.projectId,
    name: prop.name,
    description: prop.description,
    significance: prop.significance,
    visualPrompt: prop.visualPrompt,
    status: prop.status,
  }))

  for (const character of normalizedCharacters) {
    if (character.projectId !== input.projectId) {
      throw new Error(`Linked character belongs to a different project: ${character.id}`)
    }
  }

  for (const scene of normalizedScenes) {
    if (scene.projectId !== input.projectId) {
      throw new Error(`Linked scene belongs to a different project: ${scene.id}`)
    }
  }

  for (const prop of normalizedProps) {
    if (prop.projectId !== input.projectId) {
      throw new Error(`Linked prop belongs to a different project: ${prop.id}`)
    }
  }

  assertSameSet(
    'characters',
    input.characters.map((character) => character.id),
    normalizedCharacters.map((character) => character.id),
  )
  assertSameSet(
    'scenes',
    input.scenes.map((scene) => scene.id),
    normalizedScenes.map((scene) => scene.id),
  )
  assertSameSet(
    'props',
    input.props.map((prop) => prop.id),
    normalizedProps.map((prop) => prop.id),
  )

  const existingStoryboards = await db
    .select()
    .from(storyboards)
    .where(eq(storyboards.episodeId, input.episodeId))
    .orderBy(storyboards.shotNo)

  return {
    project,
    episode,
    script,
    scriptStructuredJson,
    characters: normalizedCharacters,
    scenes: normalizedScenes,
    props: normalizedProps,
    existingStoryboards,
  }
}

function assertSameSet(label: string, inputIds: string[], dbIds: string[]) {
  const inputSet = new Set(inputIds)
  const dbSet = new Set(dbIds)

  if (inputSet.size !== inputIds.length) {
    throw new Error(`Storyboard input has duplicate ${label} ids`)
  }

  if (inputSet.size !== dbSet.size) {
    throw new Error(`Storyboard input ${label} do not match DB state`)
  }

  for (const id of inputSet) {
    if (!dbSet.has(id)) {
      throw new Error(`Storyboard input ${label} contain unknown id: ${id}`)
    }
  }
}
