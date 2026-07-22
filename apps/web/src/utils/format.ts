/** Small display formatters. */

/** "更新于" 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期。 */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PROJECT_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  planning: '规划中',
  planned: '已规划',
  active: '进行中',
  completed: '已完成',
  archived: '已归档',
}

/** Maps a project's raw status to a Chinese label (falls back to the raw value). */
export function projectStatusLabel(status: string): string {
  return PROJECT_STATUS_LABELS[status] ?? status
}
