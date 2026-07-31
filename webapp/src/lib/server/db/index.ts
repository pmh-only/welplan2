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
  CREATE TABLE IF NOT EXISTS restaurant_selection_recency (
    restaurant_id TEXT PRIMARY KEY,
    selected_at BIGINT NOT NULL
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
    cached_at BIGINT NOT NULL,
    photo_date TEXT
  );
  ALTER TABLE image_cache ADD COLUMN IF NOT EXISTS photo_date TEXT;
  DROP TABLE IF EXISTS user_selected_restaurants;
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id TEXT PRIMARY KEY,
    manage_token_hash TEXT NOT NULL,
    platform TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    data TEXT NOT NULL,
    terms_version TEXT,
    privacy_version TEXT,
    legal_accepted_at BIGINT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
  ALTER TABLE webhook_subscriptions ADD COLUMN IF NOT EXISTS terms_version TEXT;
  ALTER TABLE webhook_subscriptions ADD COLUMN IF NOT EXISTS privacy_version TEXT;
  ALTER TABLE webhook_subscriptions ADD COLUMN IF NOT EXISTS legal_accepted_at BIGINT;
  UPDATE webhook_subscriptions SET enabled = TRUE WHERE enabled = FALSE;
  CREATE TABLE IF NOT EXISTS webhook_deliveries (
    key TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    schedule_id TEXT NOT NULL DEFAULT 'legacy',
    schedule_date TEXT NOT NULL,
    menu_date TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts BIGINT NOT NULL,
    completed_parts BIGINT NOT NULL DEFAULT 0,
    claim_token TEXT,
    payload_hash TEXT,
    next_attempt_at BIGINT,
    claimed_at BIGINT,
    response_status BIGINT,
    error TEXT,
    sent_at BIGINT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
  ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS schedule_id TEXT NOT NULL DEFAULT 'legacy';
  ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS completed_parts BIGINT NOT NULL DEFAULT 0;
  ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS claim_token TEXT;
  ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS payload_hash TEXT;
  CREATE INDEX IF NOT EXISTS webhook_subscriptions_enabled_idx
    ON webhook_subscriptions(enabled);
  CREATE INDEX IF NOT EXISTS webhook_deliveries_subscription_idx
    ON webhook_deliveries(subscription_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS webhook_registration_limits (
    address_hash TEXT PRIMARY KEY,
    window_started_at BIGINT NOT NULL,
    attempts BIGINT NOT NULL
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
