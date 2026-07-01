import type { PipelineStatus } from '@/types'

/** Maps backend status strings (task status, entity status, etc) to the UI's PipelineStatus badge states. */
export function toPipelineStatus(status: string): PipelineStatus {
  if (status === 'pending' || status === 'running' || status === 'generating') return 'generating'
  if (status === 'completed' || status === 'done' || status === 'active') return 'done'
  if (status === 'failed') return 'failed'
  return 'draft'
}
