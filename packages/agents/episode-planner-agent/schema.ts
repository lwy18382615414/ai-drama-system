import { z } from 'zod/v4'

export const EpisodePlannerOptionsSchema = z.object({
  model: z.string().optional(),
})

export const EpisodePlannerStyleConfigSchema = z.object({
  title: z.string().min(1),
  genre: z.string().min(1),
  targetPlatform: z.string().min(1),
  visualStyle: z.string().min(1),
  episodeDuration: z.number().int().positive(),
})

export const EpisodePlannerSourceEventSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  chapterId: z.string().min(1),
  chapterNo: z.number().int().positive(),
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

export const EpisodePlannerInputSchema = z.object({
  projectId: z.string().min(1),
  chapterIds: z.array(z.string().min(1)).min(1),
  novelEvents: z.array(EpisodePlannerSourceEventSchema).min(1),
  styleConfig: EpisodePlannerStyleConfigSchema,
  taskId: z.string().optional(),
  options: EpisodePlannerOptionsSchema.optional(),
})

export const EpisodePlannerUsageTypeSchema = z.enum(['primary', 'setup', 'payoff', 'supporting'])

export const EpisodePlannerSourceEventLinkSchema = z.object({
  novel_event_id: z.string().min(1),
  order_in_episode: z.number().int().positive(),
  usage_type: EpisodePlannerUsageTypeSchema,
})

export const EpisodePlannerEpisodeSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  opening_hook: z.string().min(1),
  ending_hook: z.string().min(1),
  source_event_links: z.array(EpisodePlannerSourceEventLinkSchema).min(1),
})

export const EpisodePlannerOutputSchema = z.object({
  episodes: z.array(EpisodePlannerEpisodeSchema).min(1),
})

export const EpisodePlannerSuccessResultSchema = z.object({
  success: z.literal(true),
  taskId: z.string(),
  agentRunId: z.string(),
  data: EpisodePlannerOutputSchema,
})

export const EpisodePlannerFailureResultSchema = z.object({
  success: z.literal(false),
  taskId: z.string().optional(),
  agentRunId: z.string().optional(),
  error: z.string(),
})

export const EpisodePlannerResultSchema = z.union([
  EpisodePlannerSuccessResultSchema,
  EpisodePlannerFailureResultSchema,
])

export type EpisodePlannerOptions = z.infer<typeof EpisodePlannerOptionsSchema>
export type EpisodePlannerStyleConfig = z.infer<typeof EpisodePlannerStyleConfigSchema>
export type EpisodePlannerSourceEvent = z.infer<typeof EpisodePlannerSourceEventSchema>
export type EpisodePlannerInput = z.infer<typeof EpisodePlannerInputSchema>
export type EpisodePlannerOutput = z.infer<typeof EpisodePlannerOutputSchema>
export type EpisodePlannerResult = z.infer<typeof EpisodePlannerResultSchema>
export type EpisodePlannerUsageType = z.infer<typeof EpisodePlannerUsageTypeSchema>
