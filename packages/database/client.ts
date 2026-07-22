import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { sql } from 'drizzle-orm'
import { schema } from './schema.js'

// Migrations are the single source of truth for the schema, generated from schema.ts
// via `pnpm db:generate`. Resolve the folder relative to this module so it works under
// tsx (no build step) regardless of the process working directory.
const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url))

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
  await db.run(sql`PRAGMA busy_timeout = 5000`)

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
    try {
      rmSync(dir, { recursive: true, force: true })
      ephemeralDirs.delete(db)
    } catch {
      // On Windows the libSQL WAL handle may linger briefly after close(), making an immediate
      // unlink race (EBUSY). Leave the entry so the process-exit handler sweeps it up later.
    }
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

/**
 * Applies all pending drizzle migrations. Idempotent: drizzle tracks applied migrations in its
 * own `__drizzle_migrations` table, so re-running against an up-to-date database is a no-op.
 * The baseline migration assumes an empty database — recreate stale local dev DBs if needed.
 */
export async function initializeDatabase(db: DatabaseClient): Promise<void> {
  await migrate(db, { migrationsFolder })
}
