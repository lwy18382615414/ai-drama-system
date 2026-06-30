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
      script_id TEXT,
      video_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

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
      event_id TEXT NOT NULL REFERENCES novel_events(id),
      order_no INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
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
