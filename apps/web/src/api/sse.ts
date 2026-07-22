/**
 * SSE endpoints. The per-project task stream uses the native EventSource
 * (frontend-design.md §3.2) — axios does not handle SSE. Kept alongside the
 * axios layer so all backend URLs live under api/.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

/** Per-project SSE task stream URL (see useProjectTaskStream). */
export function taskStreamUrl(projectId: string): string {
  return `${BASE_URL}/projects/${projectId}/tasks/stream`
}
