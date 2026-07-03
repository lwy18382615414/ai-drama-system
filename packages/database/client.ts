import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'
import { schema } from './schema.js'

export type DatabaseClient = Awaited<ReturnType<typeof createDatabase>>

// libSQL recreates its connection after every transaction; for a real ":memory:" database
// that means each transaction lands in a fresh, empty DB. We therefore back ":memory:" with a
// unique temp file per call — same ephemeral, isolated semantics, minus the connection quirk.
const ephemeralDirs = new Map<object, string>()
let exitCleanupRegistered = false

export async function createDatabase(filename = 'data/ai-drama.sqlite') {
  const resolved = resolveDatabaseUrl(filename)
  const client = createClient({ url: resolved.url })
  const db = drizzle(client, { schema })

  // libSQL enables foreign keys per connection; WAL gives durable, concurrent-read local files.
  await db.run(sql`PRAGMA foreign_keys = ON`)
  await db.run(sql`PRAGMA journal_mode = WAL`)

  if (resolved.ephemeralDir) {
    ephemeralDirs.set(db, resolved.ephemeralDir)
    registerExitCleanup()
  }

  return db
}

/** Closes the underlying libSQL connection and removes any temp files backing a ":memory:" database. */
export function closeDatabase(db: DatabaseClient) {
  db.$client.close()

  const dir = ephemeralDirs.get(db)
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
    ephemeralDirs.delete(db)
  }
}

function resolveDatabaseUrl(filename: string): { url: string; ephemeralDir?: string } {
  if (filename === ':memory:') {
    const ephemeralDir = mkdtempSync(join(tmpdir(), 'ai-drama-mem-'))
    return { url: `file:${join(ephemeralDir, 'mem.sqlite')}`, ephemeralDir }
  }

  mkdirSync(dirname(filename), { recursive: true })
  return { url: `file:${filename}` }
}

function registerExitCleanup() {
  if (exitCleanupRegistered) return
  exitCleanupRegistered = true
  process.on('exit', () => {
    for (const dir of ephemeralDirs.values()) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // Best-effort cleanup of ephemeral ":memory:" temp files.
      }
    }
  })
}

export async function initializeDatabase(db: DatabaseClient): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      genre TEXT NOT NULL DEFAULT 'drama',
      target_platform TEXT NOT NULL DEFAULT 'short_video',
      visual_style TEXT NOT NULL DEFAULT 'realistic',
      episode_duration INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      episode_no INTEGER NOT NULL,
      title TEXT,
      summary TEXT,
      opening_hook TEXT,
      ending_hook TEXT,
      script_id TEXT,
      video_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await runOptionalSchemaUpdate(db, sql`ALTER TABLE episodes ADD COLUMN opening_hook TEXT`)
  await runOptionalSchemaUpdate(db, sql`ALTER TABLE episodes ADD COLUMN ending_hook TEXT`)

  await runOptionalSchemaUpdate(
    db,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS episodes_project_episode_no_unique
        ON episodes(project_id, episode_no)
    `,
  )

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      episode_id TEXT NOT NULL REFERENCES episodes(id),
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      opening_hook TEXT,
      ending_hook TEXT,
      content TEXT NOT NULL,
      structured_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await runOptionalSchemaUpdate(db, sql`ALTER TABLE scripts ADD COLUMN opening_hook TEXT`)
  await runOptionalSchemaUpdate(db, sql`ALTER TABLE scripts ADD COLUMN ending_hook TEXT`)

  await runOptionalSchemaUpdate(
    db,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS scripts_episode_id_unique
        ON scripts(episode_id)
    `,
  )

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS novel_chapters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      chapter_no INTEGER NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS novel_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      chapter_id TEXT NOT NULL REFERENCES novel_chapters(id),
      event_no INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail TEXT NOT NULL,
      characters_json TEXT NOT NULL DEFAULT '[]',
      location TEXT,
      time_hint TEXT,
      emotion_tone TEXT,
      conflict_level TEXT NOT NULL DEFAULT 'none',
      importance TEXT NOT NULL DEFAULT 'minor',
      source_text_range_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS novel_events_chapter_event_no_unique
      ON novel_events(chapter_id, event_no)
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS episode_event_links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      episode_id TEXT NOT NULL REFERENCES episodes(id),
      novel_event_id TEXT NOT NULL REFERENCES novel_events(id),
      order_in_episode INTEGER NOT NULL,
      usage_type TEXT NOT NULL DEFAULT 'primary',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await runOptionalSchemaUpdate(db, sql`ALTER TABLE episode_event_links ADD COLUMN novel_event_id TEXT REFERENCES novel_events(id)`)
  await runOptionalSchemaUpdate(db, sql`ALTER TABLE episode_event_links ADD COLUMN order_in_episode INTEGER`)
  await runOptionalSchemaUpdate(
    db,
    sql`ALTER TABLE episode_event_links ADD COLUMN usage_type TEXT NOT NULL DEFAULT 'primary'`,
  )
  await runOptionalSchemaUpdate(
    db,
    sql`UPDATE episode_event_links SET novel_event_id = event_id WHERE novel_event_id IS NULL AND event_id IS NOT NULL`,
  )
  await runOptionalSchemaUpdate(
    db,
    sql`UPDATE episode_event_links SET order_in_episode = order_no WHERE order_in_episode IS NULL AND order_no IS NOT NULL`,
  )

  await runOptionalSchemaUpdate(
    db,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS episode_event_links_episode_order_unique
        ON episode_event_links(episode_id, order_in_episode)
    `,
  )
  await runOptionalSchemaUpdate(
    db,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS episode_event_links_novel_event_unique
        ON episode_event_links(novel_event_id)
    `,
  )

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      alias_json TEXT NOT NULL DEFAULT '[]',
      role TEXT,
      age TEXT,
      gender TEXT,
      appearance TEXT,
      personality TEXT,
      background TEXT,
      relationship_json TEXT NOT NULL DEFAULT '[]',
      reference_image_url TEXT,
      voice_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS characters_project_name_unique
      ON characters(project_id, name)
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      description TEXT,
      location_type TEXT,
      visual_style TEXT,
      visual_prompt TEXT,
      reference_image_url TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS scenes_project_name_unique
      ON scenes(project_id, name)
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS props (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      description TEXT,
      significance TEXT,
      visual_prompt TEXT,
      reference_image_url TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS props_project_name_unique
      ON props(project_id, name)
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS episode_character_links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      episode_id TEXT NOT NULL REFERENCES episodes(id),
      character_id TEXT NOT NULL REFERENCES characters(id),
      usage_type TEXT NOT NULL DEFAULT 'mentioned',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS episode_character_links_episode_character_unique
      ON episode_character_links(episode_id, character_id)
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS episode_scene_links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      episode_id TEXT NOT NULL REFERENCES episodes(id),
      scene_id TEXT NOT NULL REFERENCES scenes(id),
      usage_type TEXT NOT NULL DEFAULT 'used',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS episode_scene_links_episode_scene_unique
      ON episode_scene_links(episode_id, scene_id)
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS episode_prop_links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      episode_id TEXT NOT NULL REFERENCES episodes(id),
      prop_id TEXT NOT NULL REFERENCES props(id),
      usage_type TEXT NOT NULL DEFAULT 'used',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS episode_prop_links_episode_prop_unique
      ON episode_prop_links(episode_id, prop_id)
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS storyboards (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      episode_id TEXT NOT NULL REFERENCES episodes(id),
      shot_no INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      scene_id TEXT REFERENCES scenes(id),
      character_ids_json TEXT NOT NULL DEFAULT '[]',
      prop_ids_json TEXT NOT NULL DEFAULT '[]',
      script_section_no INTEGER,
      shot_type TEXT NOT NULL,
      camera_angle TEXT,
      camera_movement TEXT,
      action TEXT NOT NULL,
      dialogue_json TEXT NOT NULL DEFAULT '[]',
      narration TEXT,
      emotion TEXT,
      image_prompt TEXT NOT NULL,
      video_prompt TEXT NOT NULL,
      first_frame_image_url TEXT,
      last_frame_image_url TEXT,
      video_url TEXT,
      tts_audio_url TEXT,
      subtitle_url TEXT,
      composed_video_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await runOptionalSchemaUpdate(db, sql`ALTER TABLE storyboards ADD COLUMN prop_ids_json TEXT NOT NULL DEFAULT '[]'`)
  await runOptionalSchemaUpdate(db, sql`ALTER TABLE storyboards ADD COLUMN script_section_no INTEGER`)
  await runOptionalSchemaUpdate(db, sql`ALTER TABLE storyboards ADD COLUMN emotion TEXT`)

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS storyboards_episode_shot_no_unique
      ON storyboards(episode_id, shot_no)
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      episode_id TEXT,
      agent_type TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      skill_version TEXT NOT NULL,
      model TEXT,
      input_json TEXT NOT NULL,
      output_json TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS generation_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      episode_id TEXT,
      storyboard_id TEXT,
      target_type TEXT,
      target_id TEXT,
      task_type TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      input_json TEXT NOT NULL,
      output_json TEXT,
      status TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await runOptionalSchemaUpdate(db, sql`ALTER TABLE generation_tasks ADD COLUMN target_type TEXT`)
  await runOptionalSchemaUpdate(db, sql`ALTER TABLE generation_tasks ADD COLUMN target_id TEXT`)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      asset_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      generation_task_id TEXT REFERENCES generation_tasks(id),
      url TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      prompt TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}

async function runOptionalSchemaUpdate(
  db: DatabaseClient,
  statement: Parameters<DatabaseClient['run']>[0],
) {
  try {
    await db.run(statement)
  } catch {
    // Best-effort compatibility for existing local MVP databases.
  }
}
