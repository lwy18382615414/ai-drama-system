import { describe, expect, it } from 'vitest'
import { closeDatabase, createDatabase, episodes, initializeDatabase, projects, scripts, storyboards } from '../../../packages/database/index.js'
import { computeEpisodePipelineStatus, invalidateAfterScriptChange } from './episode-pipeline-service.js'

describe('episode pipeline status', () => {
  it('derives stale downstream stages after a script revision changes', async () => {
    const db = await createDatabase(':memory:')
    try {
      await initializeDatabase(db)
      const now = new Date().toISOString()
      await db.insert(projects).values({ id: 'p1', title: 'Project', createdAt: now, updatedAt: now })
      await db.insert(episodes).values({ id: 'e1', projectId: 'p1', episodeNo: 1, status: 'script_ready', createdAt: now, updatedAt: now })
      await db.insert(scripts).values({
        id: 's1', projectId: 'p1', episodeId: 'e1', title: 'Script', summary: 'Summary', content: 'Content', structuredJson: '{"title":"Script","summary":"Summary","duration_seconds":1,"script_sections":[]}', createdAt: now, updatedAt: now,
      })
      await db.insert(storyboards).values({
        id: 'b1', projectId: 'p1', episodeId: 'e1', shotNo: 1, duration: 1, shotType: 'close_up', action: 'Act', dialogueJson: '[]', imagePrompt: 'image', videoPrompt: 'video', status: 'ready', createdAt: now, updatedAt: now,
      })

      await invalidateAfterScriptChange(db, 'e1')
      const pipeline = await computeEpisodePipelineStatus(db, 'e1')

      expect(pipeline?.revisions.script).toBe(1)
      expect(pipeline?.stages.script_ready).toBe('ready')
      expect(pipeline?.stages.assets_ready).toBe('stale')
      expect(pipeline?.stages.storyboards_ready).toBe('stale')
      expect(pipeline?.stages.images_ready).toBe('stale')
    } finally {
      closeDatabase(db)
    }
  })
})
