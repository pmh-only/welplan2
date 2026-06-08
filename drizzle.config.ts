import './webapp/src/lib/server/env'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './webapp/src/lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      `postgresql://${process.env.PGUSER ?? 'welplan2'}:${process.env.PGPASSWORD ?? ''}@${process.env.PGHOST ?? 'localhost'}:${process.env.PGPORT ?? '5432'}/${process.env.PGDATABASE ?? 'welplan2'}`
  }
})
