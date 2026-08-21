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
  CREATE TABLE IF NOT EXISTS restaurant_selection_combinations (
    combination_key TEXT PRIMARY KEY,
    restaurants TEXT NOT NULL,
    selection_count BIGINT NOT NULL,
    first_selected_at BIGINT NOT NULL,
    last_selected_at BIGINT NOT NULL
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
  CREATE TABLE IF NOT EXISTS menu_occurrences (
    cache_key TEXT NOT NULL REFERENCES menus_cache(key) ON DELETE CASCADE,
    menu_index BIGINT NOT NULL,
    restaurant_id TEXT NOT NULL,
    menu_date TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    PRIMARY KEY (cache_key, menu_index)
  );
  CREATE OR REPLACE FUNCTION normalize_menu_occurrence_name(input TEXT)
  RETURNS TEXT
  IMMUTABLE
  STRICT
  LANGUAGE SQL
  AS $function$
    SELECT lower(regexp_replace(
      regexp_replace(normalize(input, NFKC), '[(][^)]*[)]', '', 'g'),
      '[[:space:]]+',
      '',
      'g'
    ));
  $function$;
  CREATE OR REPLACE FUNCTION refresh_menu_occurrences()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
  BEGIN
    DELETE FROM menu_occurrences WHERE cache_key = NEW.key;
    INSERT INTO menu_occurrences (cache_key, menu_index, restaurant_id, menu_date, normalized_name)
    SELECT
      NEW.key,
      entry.menu_index,
      entry.menu->>'restaurantId',
      entry.menu->>'date',
      normalized.normalized_name
    FROM jsonb_array_elements(NEW.data::jsonb) WITH ORDINALITY AS entry(menu, menu_index)
    CROSS JOIN LATERAL (
      SELECT normalize_menu_occurrence_name(entry.menu->>'name') AS normalized_name
    ) normalized
    WHERE entry.menu->>'restaurantId' IS NOT NULL
      AND entry.menu->>'date' IS NOT NULL
      AND normalized.normalized_name <> '';
    RETURN NEW;
  END;
  $function$;
  CREATE OR REPLACE TRIGGER menus_cache_occurrences_trigger
    AFTER INSERT OR UPDATE OF data ON menus_cache
    FOR EACH ROW
    EXECUTE FUNCTION refresh_menu_occurrences();
  INSERT INTO menu_occurrences (cache_key, menu_index, restaurant_id, menu_date, normalized_name)
  SELECT
    cache.key,
    entry.menu_index,
    entry.menu->>'restaurantId',
    entry.menu->>'date',
    normalized.normalized_name
  FROM menus_cache cache
  CROSS JOIN LATERAL jsonb_array_elements(cache.data::jsonb) WITH ORDINALITY AS entry(menu, menu_index)
  CROSS JOIN LATERAL (
    SELECT normalize_menu_occurrence_name(entry.menu->>'name') AS normalized_name
  ) normalized
  WHERE NOT EXISTS (SELECT 1 FROM menu_occurrences LIMIT 1)
    AND entry.menu->>'restaurantId' IS NOT NULL
    AND entry.menu->>'date' >= to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - 29, 'YYYYMMDD')
    AND normalized.normalized_name <> ''
  ON CONFLICT DO NOTHING;
  CREATE INDEX IF NOT EXISTS menu_occurrences_lookup_idx
    ON menu_occurrences(normalized_name, restaurant_id, menu_date);
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
  CREATE TABLE IF NOT EXISTS menu_reviews (
    menu_key TEXT NOT NULL,
    review_id TEXT NOT NULL,
    rating BIGINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    menu_name TEXT NOT NULL,
    menu_date TEXT NOT NULL,
    meal_time_id TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (menu_key, review_id)
  );
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'menu_reviews' AND column_name = 'session_id')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'menu_reviews' AND column_name = 'review_id') THEN
      ALTER TABLE menu_reviews RENAME COLUMN session_id TO review_id;
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS menu_reviews_menu_key_idx ON menu_reviews(menu_key);
  CREATE INDEX IF NOT EXISTS menu_reviews_normalized_name_idx
    ON menu_reviews(normalize_menu_occurrence_name(menu_name));
  DROP TABLE IF EXISTS menu_review_identity_limits;
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
