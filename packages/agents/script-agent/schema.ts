import { z } from 'zod'

export const ScriptAgentOptionsSchema = z.object({
  model: z.string().optional(),
  force: z.boolean().optional(),
})

export const ScriptAgentStyleConfigSchema = z.object({
  title: z.string().min(1),
  genre: z.string().min(1),
  targetPlatform: z.string().min(1),
  visualStyle: z.string().min(1),
  episodeDuration: z.number().int().positive(),
})

export const ScriptAgentEpisodeSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  episodeNo: z.number().int().positive(),
  title: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  openingHook: z.string().nullable().optional(),
  endingHook: z.string().nullable().optional(),
  status: z.string().min(1),
})

export const ScriptAgentEpisodeEventLinkSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  episodeId: z.string().min(1),
  novelEventId: z.string().min(1),
  orderInEpisode: z.number().int().positive(),
  usageType: z.string().min(1),
})

export const ScriptAgentLinkedNovelEventSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  chapterId: z.string().min(1),
  eventNo: z.number().int().positive(),
  eventType: z.string().min(1),
  summary: z.string().min(1),
  detail: z.string().min(1),
  characters: z.array(z.string()).default([]),
  location: z.string().nullable().optional(),
  timeHint: z.string().nullable().optional(),
  emotionTone: z.string().nullable().optional(),
  conflictLevel: z.string().optional(),
  importance: z.string().optional(),
})

export const ScriptAgentInputSchema = z.object({
  projectId: z.string().min(1),
  episodeId: z.string().min(1),
  episode: ScriptAgentEpisodeSchema,
  episodeEventLinks: z.array(ScriptAgentEpisodeEventLinkSchema).min(1),
  linkedNovelEvents: z.array(ScriptAgentLinkedNovelEventSchema).min(1),
  styleConfig: ScriptAgentStyleConfigSchema,
  taskId: z.string().optional(),
  options: ScriptAgentOptionsSchema.optional(),
})

export const ScriptDialogueSchema = z.object({
  character: z.string().min(1),
  line: z.string().min(1),
  emotion: z.string().nullable().optional(),
})

export const ScriptSectionSchema = z.object({
  section_no: z.number().int().positive(),
  type: z.string().min(1),
  location: z.string().nullable().optional(),
  characters: z.array(z.string()).default([]),
  description: z.string().min(1),
  dialogues: z.array(ScriptDialogueSchema).default([]),
  narration: z.string().nullable().optional(),
  emotion: z.string().nullable().optional(),
})

export const ScriptAgentOutputSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  duration_seconds: z.number().int().positive(),
  opening_hook: z.string().min(1),
  ending_hook: z.string().min(1),
  script_sections: z.array(ScriptSectionSchema).min(1),
})

export const ScriptAgentSuccessResultSchema = z.object({
  success: z.literal(true),
  taskId: z.string(),
  agentRunId: z.string(),
  scriptId: z.string(),
  data: ScriptAgentOutputSchema,
})

export const ScriptAgentFailureResultSchema = z.object({
  success: z.literal(false),
  taskId: z.string().optional(),
  agentRunId: z.string().optional(),
  error: z.string(),
})

export const ScriptAgentResultSchema = z.union([
  ScriptAgentSuccessResultSchema,
  ScriptAgentFailureResultSchema,
])

export type ScriptAgentOptions = z.infer<typeof ScriptAgentOptionsSchema>
export type ScriptAgentStyleConfig = z.infer<typeof ScriptAgentStyleConfigSchema>
export type ScriptAgentEpisode = z.infer<typeof ScriptAgentEpisodeSchema>
export type ScriptAgentEpisodeEventLink = z.infer<typeof ScriptAgentEpisodeEventLinkSchema>
export type ScriptAgentLinkedNovelEvent = z.infer<typeof ScriptAgentLinkedNovelEventSchema>
export type ScriptAgentInput = z.infer<typeof ScriptAgentInputSchema>
export type ScriptDialogue = z.infer<typeof ScriptDialogueSchema>
export type ScriptSection = z.infer<typeof ScriptSectionSchema>
export type ScriptAgentOutput = z.infer<typeof ScriptAgentOutputSchema>
export type ScriptAgentResult = z.infer<typeof ScriptAgentResultSchema>
