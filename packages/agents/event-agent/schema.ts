import { z } from 'zod/v4'

export const EventAgentOptionsSchema = z.object({
  maxEvents: z.number().int().positive().max(100).default(30),
  granularity: z.enum(['beat']).default('beat'),
  model: z.string().optional(),
})

export const EventAgentInputSchema = z.object({
  projectId: z.string().min(1),
  chapterId: z.string().min(1),
  taskId: z.string().optional(),
  options: EventAgentOptionsSchema.optional(),
})

export const EventTypeSchema = z.enum([
  'setup',
  'action',
  'dialogue',
  'emotion',
  'conflict',
  'revelation',
  'transition',
  'resolution',
  'description',
])

export const ConflictLevelSchema = z.enum(['none', 'low', 'medium', 'high'])
export const EventImportanceSchema = z.enum(['minor', 'major', 'critical'])

export const SourceTextRangeSchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  })
  .refine((range) => range.end >= range.start, {
    message: 'sourceTextRange.end must be greater than or equal to start',
  })

export const EventAgentEventSchema = z.object({
  eventNo: z.number().int().positive(),
  eventType: EventTypeSchema,
  summary: z.string().min(1),
  detail: z.string().min(1),
  characters: z.array(z.string()),
  location: z.string().optional(),
  timeHint: z.string().optional(),
  emotionTone: z.string().optional(),
  conflictLevel: ConflictLevelSchema,
  importance: EventImportanceSchema,
  sourceTextRange: SourceTextRangeSchema.optional(),
})

export const EventAgentOutputSchema = z
  .object({
    chapterId: z.string().min(1),
    chapterSummary: z.string().min(1),
    events: z.array(EventAgentEventSchema),
    totalEvents: z.number().int().nonnegative(),
  })
  .refine((output) => output.totalEvents === output.events.length, {
    message: 'totalEvents must equal events.length',
    path: ['totalEvents'],
  })

export const EventAgentSuccessResultSchema = z.object({
  success: z.literal(true),
  taskId: z.string(),
  agentRunId: z.string(),
  data: EventAgentOutputSchema,
})

export const EventAgentFailureResultSchema = z.object({
  success: z.literal(false),
  taskId: z.string().optional(),
  agentRunId: z.string().optional(),
  error: z.string(),
})

export const EventAgentResultSchema = z.union([
  EventAgentSuccessResultSchema,
  EventAgentFailureResultSchema,
])

export type EventAgentOptions = z.infer<typeof EventAgentOptionsSchema>
export type EventAgentInput = z.infer<typeof EventAgentInputSchema>
export type EventAgentEvent = z.infer<typeof EventAgentEventSchema>
export type EventAgentOutput = z.infer<typeof EventAgentOutputSchema>
export type EventAgentResult = z.infer<typeof EventAgentResultSchema>
