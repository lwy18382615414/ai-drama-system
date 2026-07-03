import { defineConfig } from 'drizzle-kit'

// Single source of truth for the schema lives in packages/database/schema.ts.
// `pnpm db:generate` emits versioned SQL migrations into packages/database/migrations,
// which initializeDatabase() applies at runtime via drizzle's libSQL migrator.
export default defineConfig({
  dialect: 'sqlite',
  schema: './packages/database/schema.ts',
  out: './packages/database/migrations',
})
