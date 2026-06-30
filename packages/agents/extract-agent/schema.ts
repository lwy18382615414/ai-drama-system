import { z } from 'zod'
import { ScriptAgentOutputSchema } from '../script-agent/schema.js'

const NullableStringSchema = z.string().nullable().optional()

export const ExtractAgentOptionsSchema = z.object({
  model: z.string().optional(),
  force: z.boolean().optional(),
})

export const ExtractAgentProjectStyleSchema = z.object({
  title: z.string().min(1),
  genre: z.string().min(1),
  targetPlatform: z.string().min(1),
  visualStyle: z.string().min(1),
  episodeDuration: z.number().int().positive(),
})

export const ExtractAgentEpisodeSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  episodeNo: z.number().int().positive(),
  title: NullableStringSchema,
  summary: NullableStringSchema,
  openingHook: NullableStringSchema,
  endingHook: NullableStringSchema,
  status: z.string().min(1),
})

export const ExtractAgentScriptSchema = z.object({
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

export const ExtractAgentExistingCharacterSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  aliasJson: z.array(z.string()).default([]),
  role: NullableStringSchema,
  age: NullableStringSchema,
  gender: NullableStringSchema,
  appearance: NullableStringSchema,
  personality: NullableStringSchema,
  background: NullableStringSchema,
  relationshipJson: z.array(z.unknown()).default([]),
  referenceImageUrl: NullableStringSchema,
  voiceId: NullableStringSchema,
  status: z.string().min(1),
})

export const ExtractAgentExistingSceneSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  description: NullableStringSchema,
  locationType: NullableStringSchema,
  visualStyle: NullableStringSchema,
  visualPrompt: NullableStringSchema,
  referenceImageUrl: NullableStringSchema,
  status: z.string().min(1),
})

export const ExtractAgentExistingPropSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  description: NullableStringSchema,
  significance: NullableStringSchema,
  visualPrompt: NullableStringSchema,
  referenceImageUrl: NullableStringSchema,
  status: z.string().min(1),
})

export const ExtractAgentInputSchema = z.object({
  projectId: z.string().min(1),
  episodeId: z.string().min(1),
  episode: ExtractAgentEpisodeSchema,
  script: ExtractAgentScriptSchema,
  scriptStructuredJson: ScriptAgentOutputSchema,
  projectStyle: ExtractAgentProjectStyleSchema,
  existingCharacters: z.array(ExtractAgentExistingCharacterSchema).default([]),
  existingScenes: z.array(ExtractAgentExistingSceneSchema).default([]),
  existingProps: z.array(ExtractAgentExistingPropSchema).default([]),
  taskId: z.string().optional(),
  options: ExtractAgentOptionsSchema.optional(),
})

export const ExtractedCharacterSchema = z.object({
  name: z.string().min(1),
  alias_json: z.array(z.string()).default([]),
  role: NullableStringSchema,
  age: NullableStringSchema,
  gender: NullableStringSchema,
  appearance: NullableStringSchema,
  personality: NullableStringSchema,
  background: NullableStringSchema,
  relationship_json: z.array(z.unknown()).default([]),
  reference_image_url: NullableStringSchema,
  voice_id: NullableStringSchema,
  usage_type: z.string().min(1).default('mentioned'),
})

export const ExtractedSceneSchema = z.object({
  name: z.string().min(1),
  description: NullableStringSchema,
  location_type: NullableStringSchema,
  visual_style: NullableStringSchema,
  visual_prompt: NullableStringSchema,
  reference_image_url: NullableStringSchema,
  usage_type: z.string().min(1).default('used'),
})

export const ExtractedPropSchema = z.object({
  name: z.string().min(1),
  description: NullableStringSchema,
  significance: NullableStringSchema,
  visual_prompt: NullableStringSchema,
  reference_image_url: NullableStringSchema,
  usage_type: z.string().min(1).default('used'),
})

export const ExtractAgentOutputSchema = z.object({
  characters: z.array(ExtractedCharacterSchema).default([]),
  scenes: z.array(ExtractedSceneSchema).default([]),
  props: z.array(ExtractedPropSchema).default([]),
})

export const ExtractAgentSuccessResultSchema = z.object({
  success: z.literal(true),
  taskId: z.string(),
  agentRunId: z.string(),
  data: ExtractAgentOutputSchema,
  assetIds: z.object({
    characterIds: z.array(z.string()),
    sceneIds: z.array(z.string()),
    propIds: z.array(z.string()),
  }),
})

export const ExtractAgentFailureResultSchema = z.object({
  success: z.literal(false),
  taskId: z.string().optional(),
  agentRunId: z.string().optional(),
  error: z.string(),
})

export const ExtractAgentResultSchema = z.union([
  ExtractAgentSuccessResultSchema,
  ExtractAgentFailureResultSchema,
])

export type ExtractAgentOptions = z.infer<typeof ExtractAgentOptionsSchema>
export type ExtractAgentProjectStyle = z.infer<typeof ExtractAgentProjectStyleSchema>
export type ExtractAgentEpisode = z.infer<typeof ExtractAgentEpisodeSchema>
export type ExtractAgentScript = z.infer<typeof ExtractAgentScriptSchema>
export type ExtractAgentExistingCharacter = z.infer<typeof ExtractAgentExistingCharacterSchema>
export type ExtractAgentExistingScene = z.infer<typeof ExtractAgentExistingSceneSchema>
export type ExtractAgentExistingProp = z.infer<typeof ExtractAgentExistingPropSchema>
export type ExtractAgentInput = z.infer<typeof ExtractAgentInputSchema>
export type ExtractedCharacter = z.infer<typeof ExtractedCharacterSchema>
export type ExtractedScene = z.infer<typeof ExtractedSceneSchema>
export type ExtractedProp = z.infer<typeof ExtractedPropSchema>
export type ExtractAgentOutput = z.infer<typeof ExtractAgentOutputSchema>
export type ExtractAgentResult = z.infer<typeof ExtractAgentResultSchema>
