import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { drizzle } from 'drizzle-orm/sql-js'
import { sql } from 'drizzle-orm'
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { schema } from './schema.js'

export type DatabaseClient = Awaited<ReturnType<typeof createDatabase>>

export async function createDatabase(filename = 'data/ai-drama.sqlite') {
  const SQL = await initSqlJs()
  let sqlite: SqlJsDatabase

  if (filename === ':memory:') {
    sqlite = new SQL.Database()
  } else {
    mkdirSync(dirname(filename), { recursive: true })

    try {
      sqlite = new SQL.Database(readFileSync(filename))
    } catch {
      sqlite = new SQL.Database()
    }
  }

  sqlite.run('PRAGMA foreign_keys = ON')

  return drizzle(sqlite, { schema })
}

export function initializeDatabase(db: DatabaseClient) {
  db.run(sql`
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

  db.run(sql`
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

  runOptionalSchemaUpdate(db, sql`ALTER TABLE episodes ADD COLUMN opening_hook TEXT`)
  runOptionalSchemaUpdate(db, sql`ALTER TABLE episodes ADD COLUMN ending_hook TEXT`)

  runOptionalSchemaUpdate(
    db,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS episodes_project_episode_no_unique
        ON episodes(project_id, episode_no)
    `,
  )

  db.run(sql`
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

  runOptionalSchemaUpdate(db, sql`ALTER TABLE scripts ADD COLUMN opening_hook TEXT`)
  runOptionalSchemaUpdate(db, sql`ALTER TABLE scripts ADD COLUMN ending_hook TEXT`)

  runOptionalSchemaUpdate(
    db,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS scripts_episode_id_unique
        ON scripts(episode_id)
    `,
  )

  db.run(sql`
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

  db.run(sql`
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

  db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS novel_events_chapter_event_no_unique
      ON novel_events(chapter_id, event_no)
  `)

  db.run(sql`
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

  runOptionalSchemaUpdate(db, sql`ALTER TABLE episode_event_links ADD COLUMN novel_event_id TEXT REFERENCES novel_events(id)`)
  runOptionalSchemaUpdate(db, sql`ALTER TABLE episode_event_links ADD COLUMN order_in_episode INTEGER`)
  runOptionalSchemaUpdate(
    db,
    sql`ALTER TABLE episode_event_links ADD COLUMN usage_type TEXT NOT NULL DEFAULT 'primary'`,
  )
  runOptionalSchemaUpdate(
    db,
    sql`UPDATE episode_event_links SET novel_event_id = event_id WHERE novel_event_id IS NULL AND event_id IS NOT NULL`,
  )
  runOptionalSchemaUpdate(
    db,
    sql`UPDATE episode_event_links SET order_in_episode = order_no WHERE order_in_episode IS NULL AND order_no IS NOT NULL`,
  )

  runOptionalSchemaUpdate(
    db,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS episode_event_links_episode_order_unique
        ON episode_event_links(episode_id, order_in_episode)
    `,
  )
  runOptionalSchemaUpdate(
    db,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS episode_event_links_novel_event_unique
        ON episode_event_links(novel_event_id)
    `,
  )

  db.run(sql`
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

  db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS characters_project_name_unique
      ON characters(project_id, name)
  `)

  db.run(sql`
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

  db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS scenes_project_name_unique
      ON scenes(project_id, name)
  `)

  db.run(sql`
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

  db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS props_project_name_unique
      ON props(project_id, name)
  `)

  db.run(sql`
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

  db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS episode_character_links_episode_character_unique
      ON episode_character_links(episode_id, character_id)
  `)

  db.run(sql`
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

  db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS episode_scene_links_episode_scene_unique
      ON episode_scene_links(episode_id, scene_id)
  `)

  db.run(sql`
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

  db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS episode_prop_links_episode_prop_unique
      ON episode_prop_links(episode_id, prop_id)
  `)

  db.run(sql`
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

  db.run(sql`
    CREATE TABLE IF NOT EXISTS generation_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      episode_id TEXT,
      storyboard_id TEXT,
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
}

function runOptionalSchemaUpdate(
  db: DatabaseClient,
  statement: Parameters<DatabaseClient['run']>[0],
) {
  try {
    db.run(statement)
  } catch {
    // Best-effort compatibility for existing local MVP databases.
  }
}
