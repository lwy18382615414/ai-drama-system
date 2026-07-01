/**
 * Seed a fully-populated demo project so the StoryFrame workbench renders
 * meaningful content on every screen. Idempotent: skips if the demo project
 * already exists.
 *
 * Run with: npm run seed
 */
import { eq } from 'drizzle-orm'
import { createDatabase, initializeDatabase, persistDatabase, projects } from '../../packages/database/index.js'
import { seedDemoProject } from './services/seed-demo.js'

const DEMO_PROJECT_ID = 'demo-midnight-signal'

async function main() {
  const dbPath = process.env.DATABASE_URL ?? 'data/ai-drama.sqlite'
  const db = await createDatabase(dbPath)
  initializeDatabase(db)

  const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, DEMO_PROJECT_ID))

  if (existing) {
    console.log(`Seed skipped: demo project "${DEMO_PROJECT_ID}" already exists.`)
    return
  }

  await seedDemoProject(db, DEMO_PROJECT_ID)
  persistDatabase(db, dbPath)
  console.log(`Seed complete: created demo project "${DEMO_PROJECT_ID}".`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
