import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

const databaseUrl = process.env.DATABASE_URL
const dbHost = process.env.PGHOST ?? process.env.DB_HOST
const dbPort = process.env.PGPORT
const dbName = process.env.PGDATABASE ?? process.env.DB_NAME
const dbUser = process.env.PGUSER ?? process.env.DB_USER
const dbPassword = process.env.PGPASSWORD ?? process.env.DB_PASSWORD
const connectionConfig = databaseUrl
  ? { connectionString: databaseUrl }
  : {
      host: dbHost ?? 'localhost',
      port: dbPort ? Number(dbPort) : 5432,
      database: dbName ?? 'welplan2',
      user: dbUser ?? 'welplan2',
      password: dbPassword
    }

const pool = new Pool(connectionConfig)

export const db = drizzle(pool, { schema })

const createSchemaSql = `
  CREATE TABLE IF NOT EXISTS restaurants (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    cached_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meal_times_cache (
    restaurant_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    cached_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS menus_cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    cached_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS menu_detail_cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    cached_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS menu_nutrient_detail_cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    cached_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS precomputed_page_cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    cached_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS image_cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    content_type TEXT NOT NULL,
    cached_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_selected_restaurants (
    restaurant_id TEXT PRIMARY KEY,
    last_seen_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at BIGINT NOT NULL
  );
`

let initialized: Promise<void> | null = null

function initDb(): Promise<void> {
  return pool.query(createSchemaSql).then(() => undefined)
}

export async function ensureDbInitialized(): Promise<void> {
  if (initialized) {
    return initialized
  }
  initialized = initDb().catch((error) => {
    initialized = null
    throw error
  })
  return initialized
}
