/** Chinese display labels for the fixed English enum codes EventAgent returns (see packages/agents/event-agent/schema.ts). */
export const EVENT_TYPE_LABEL: Record<string, string> = {
  setup: '铺垫',
  action: '动作',
  dialogue: '对话',
  emotion: '情绪',
  conflict: '冲突',
  revelation: '揭示',
  transition: '转折',
  resolution: '结局',
  description: '描写',
}

export const CONFLICT_LEVEL_LABEL: Record<string, string> = {
  none: '无',
  low: '低',
  medium: '中',
  high: '高',
}

export const EVENT_IMPORTANCE_LABEL: Record<string, string> = {
  minor: '次要',
  major: '重要',
  critical: '关键',
}

export function eventTypeLabel(v: string): string {
  return EVENT_TYPE_LABEL[v] ?? v
}

export function conflictLevelLabel(v: string): string {
  return CONFLICT_LEVEL_LABEL[v] ?? v
}

export function eventImportanceLabel(v: string): string {
  return EVENT_IMPORTANCE_LABEL[v] ?? v
}
