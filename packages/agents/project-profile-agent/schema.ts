import { z } from 'zod/v4'

export const ProjectProfileAgentOptionsSchema = z.object({
  model: z.string().optional(),
})

export const NovelMetaSchema = z.object({
  title: z.string().nullable(),
  author: z.string().nullable(),
})

export const ProjectProfileAgentInputSchema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().optional(),
  /** Source-file metadata (e.g. EPUB title/author) passed through as an inference hint. */
  novelMeta: NovelMetaSchema.optional(),
  options: ProjectProfileAgentOptionsSchema.optional(),
})

export const ProjectProfileAgentOutputSchema = z.object({
  title: z.string().min(1).max(60),
  description: z.string().min(1).max(500),
  genre: z.string().min(1).max(30),
  visualStyle: z.string().min(1).max(120),
})

export const ProjectProfileAgentSuccessResultSchema = z.object({
  success: z.literal(true),
  taskId: z.string(),
  agentRunId: z.string(),
  data: ProjectProfileAgentOutputSchema,
})

export const ProjectProfileAgentFailureResultSchema = z.object({
  success: z.literal(false),
  taskId: z.string().optional(),
  agentRunId: z.string().optional(),
  error: z.string(),
})

export const ProjectProfileAgentResultSchema = z.union([
  ProjectProfileAgentSuccessResultSchema,
  ProjectProfileAgentFailureResultSchema,
])

export type ProjectProfileAgentOptions = z.infer<typeof ProjectProfileAgentOptionsSchema>
export type NovelMeta = z.infer<typeof NovelMetaSchema>
export type ProjectProfileAgentInput = z.infer<typeof ProjectProfileAgentInputSchema>
export type ProjectProfileAgentOutput = z.infer<typeof ProjectProfileAgentOutputSchema>
export type ProjectProfileAgentResult = z.infer<typeof ProjectProfileAgentResultSchema>
