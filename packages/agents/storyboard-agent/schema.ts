import { z } from 'zod'
import { ScriptAgentOutputSchema } from '../script-agent/schema.js'

const NullableStringSchema = z.string().nullable().optional()

export const StoryboardAgentOptionsSchema = z.object({
  model: z.string().optional(),
  force: z.boolean().optional(),
})

export const StoryboardAgentProjectStyleSchema = z.object({
  title: z.string().min(1),
  genre: z.string().min(1),
  targetPlatform: z.string().min(1),
  visualStyle: z.string().min(1),
  episodeDuration: z.number().int().positive(),
})

export const StoryboardAgentEpisodeSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  episodeNo: z.number().int().positive(),
  title: NullableStringSchema,
  summary: NullableStringSchema,
  openingHook: NullableStringSchema,
  endingHook: NullableStringSchema,
  status: z.string().min(1),
})

export const StoryboardAgentScriptSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  episodeId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  openingHook: NullableStringSchema,
  endingHook: NullableStringSchema,
  content: z.string().min(1),
  status: z.string().min(1),
})

export const StoryboardAgentCharacterSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  role: NullableStringSchema,
  appearance: NullableStringSchema,
  status: z.string().min(1),
})

export const StoryboardAgentSceneSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  description: NullableStringSchema,
  locationType: NullableStringSchema,
  visualStyle: NullableStringSchema,
  visualPrompt: NullableStringSchema,
  status: z.string().min(1),
})

export const StoryboardAgentPropSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  description: NullableStringSchema,
  significance: NullableStringSchema,
  visualPrompt: NullableStringSchema,
  status: z.string().min(1),
})

export const StoryboardAgentInputSchema = z.object({
  projectId: z.string().min(1),
  episodeId: z.string().min(1),
  episode: StoryboardAgentEpisodeSchema,
  script: StoryboardAgentScriptSchema,
  scriptStructuredJson: ScriptAgentOutputSchema,
  characters: z.array(StoryboardAgentCharacterSchema).default([]),
  scenes: z.array(StoryboardAgentSceneSchema).min(1),
  props: z.array(StoryboardAgentPropSchema).default([]),
  projectStyle: StoryboardAgentProjectStyleSchema,
  taskId: z.string().optional(),
  options: StoryboardAgentOptionsSchema.optional(),
})

export const StoryboardDialogueSchema = z.object({
  character: z.string().min(1),
  line: z.string().min(1),
  emotion: NullableStringSchema,
})

export const StoryboardShotSchema = z.object({
  shot_no: z.number().int().positive(),
  duration: z.number().int().positive(),
  scene_id: z.string().min(1),
  character_ids: z.array(z.string()).default([]),
  prop_ids: z.array(z.string()).default([]),
  script_section_no: z.number().int().positive().nullable().optional(),
  shot_type: z.string().min(1),
  camera_angle: NullableStringSchema,
  camera_movement: NullableStringSchema,
  action: z.string().min(1),
  dialogue: z.array(StoryboardDialogueSchema).default([]),
  narration: NullableStringSchema,
  emotion: NullableStringSchema,
  image_prompt: z.string().min(1),
  video_prompt: z.string().min(1),
})

export const StoryboardAgentOutputSchema = z.object({
  storyboards: z.array(StoryboardShotSchema).min(1).max(100),
})

export const StoryboardAgentSuccessResultSchema = z.object({
  success: z.literal(true),
  taskId: z.string(),
  agentRunId: z.string(),
  storyboardIds: z.array(z.string()),
  data: StoryboardAgentOutputSchema,
})

export const StoryboardAgentFailureResultSchema = z.object({
  success: z.literal(false),
  taskId: z.string().optional(),
  agentRunId: z.string().optional(),
  error: z.string(),
})

export const StoryboardAgentResultSchema = z.union([
  StoryboardAgentSuccessResultSchema,
  StoryboardAgentFailureResultSchema,
])

export type StoryboardAgentOptions = z.infer<typeof StoryboardAgentOptionsSchema>
export type StoryboardAgentProjectStyle = z.infer<typeof StoryboardAgentProjectStyleSchema>
export type StoryboardAgentEpisode = z.infer<typeof StoryboardAgentEpisodeSchema>
export type StoryboardAgentScript = z.infer<typeof StoryboardAgentScriptSchema>
export type StoryboardAgentCharacter = z.infer<typeof StoryboardAgentCharacterSchema>
export type StoryboardAgentScene = z.infer<typeof StoryboardAgentSceneSchema>
export type StoryboardAgentProp = z.infer<typeof StoryboardAgentPropSchema>
export type StoryboardAgentInput = z.infer<typeof StoryboardAgentInputSchema>
export type StoryboardDialogue = z.infer<typeof StoryboardDialogueSchema>
export type StoryboardShot = z.infer<typeof StoryboardShotSchema>
export type StoryboardAgentOutput = z.infer<typeof StoryboardAgentOutputSchema>
export type StoryboardAgentResult = z.infer<typeof StoryboardAgentResultSchema>
