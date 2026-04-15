import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './webapp/src/lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DB_PATH ?? 'cache.db'
  }
})
