import { bigint, boolean, index, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'

export const restaurants = pgTable('restaurants', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON: Restaurant
  cachedAt: bigint('cached_at', { mode: 'number' }).notNull()
})

export const restaurantSelectionRecency = pgTable('restaurant_selection_recency', {
  restaurantId: text('restaurant_id').primaryKey(),
  selectedAt: bigint('selected_at', { mode: 'number' }).notNull()
})

export const restaurantSelectionCombinations = pgTable('restaurant_selection_combinations', {
  combinationKey: text('combination_key').primaryKey(),
  restaurants: text('restaurants').notNull(),
  selectionCount: bigint('selection_count', { mode: 'number' }).notNull(),
  firstSelectedAt: bigint('first_selected_at', { mode: 'number' }).notNull(),
  lastSelectedAt: bigint('last_selected_at', { mode: 'number' }).notNull()
})

export const mealTimesCache = pgTable('meal_times_cache', {
  restaurantId: text('restaurant_id').primaryKey(),
  data: text('data').notNull(), // JSON: MealTime[]
  cachedAt: bigint('cached_at', { mode: 'number' }).notNull()
})

export const menusCache = pgTable('menus_cache', {
  key: text('key').primaryKey(), // `${restaurantId}:${date}:${mealTimeId}`
  data: text('data').notNull(), // JSON: Menu[]
  cachedAt: bigint('cached_at', { mode: 'number' }).notNull()
})

export const menuOccurrences = pgTable('menu_occurrences', {
  cacheKey: text('cache_key')
    .notNull()
    .references(() => menusCache.key, { onDelete: 'cascade' }),
  menuIndex: bigint('menu_index', { mode: 'number' }).notNull(),
  restaurantId: text('restaurant_id').notNull(),
  menuDate: text('menu_date').notNull(),
  normalizedName: text('normalized_name').notNull()
}, (table) => [
  primaryKey({ columns: [table.cacheKey, table.menuIndex] }),
  index('menu_occurrences_lookup_idx').on(table.normalizedName, table.restaurantId, table.menuDate)
])

export const menuDetailCache = pgTable('menu_detail_cache', {
  key: text('key').primaryKey(), // `${restaurantId}:${date}:${mealTimeId}:${hallNo}:${courseType}`
  data: text('data').notNull(), // JSON: MenuComponent[]
  cachedAt: bigint('cached_at', { mode: 'number' }).notNull()
})

export const menuNutrientDetailCache = pgTable('menu_nutrient_detail_cache', {
  key: text('key').primaryKey(), // `${restaurantId}:${date}:${mealTimeId}:${hallNo}:${courseType}`
  data: text('data').notNull(), // JSON: MenuComponent[]
  cachedAt: bigint('cached_at', { mode: 'number' }).notNull()
})

export const precomputedPageCache = pgTable('precomputed_page_cache', {
  key: text('key').primaryKey(),
  data: text('data').notNull(), // JSON: route loader payload
  cachedAt: bigint('cached_at', { mode: 'number' }).notNull()
})

export const imageCache = pgTable('image_cache', {
  key: text('key').primaryKey(),
  data: text('data').notNull(), // base64 image bytes
  contentType: text('content_type').notNull(),
  cachedAt: bigint('cached_at', { mode: 'number' }).notNull(),
  photoDate: text('photo_date')
})

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  data: text('data').notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
})

export const webhookSubscriptions = pgTable('webhook_subscriptions', {
  id: text('id').primaryKey(),
  manageTokenHash: text('manage_token_hash').notNull(),
  platform: text('platform').notNull(),
  enabled: boolean('enabled').notNull(),
  data: text('data').notNull(), // JSON: WebhookSubscriptionConfig
  termsVersion: text('terms_version'), // Null for subscriptions created before explicit acceptance records.
  privacyVersion: text('privacy_version'),
  legalAcceptedAt: bigint('legal_accepted_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
})

export const webhookDeliveries = pgTable('webhook_deliveries', {
  key: text('key').primaryKey(),
  subscriptionId: text('subscription_id')
    .notNull()
    .references(() => webhookSubscriptions.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  scheduleId: text('schedule_id').notNull().default('legacy'),
  scheduleDate: text('schedule_date').notNull(),
  menuDate: text('menu_date').notNull(),
  status: text('status').notNull(),
  attempts: bigint('attempts', { mode: 'number' }).notNull(),
  completedParts: bigint('completed_parts', { mode: 'number' }).notNull().default(0),
  claimToken: text('claim_token'),
  payloadHash: text('payload_hash'),
  nextAttemptAt: bigint('next_attempt_at', { mode: 'number' }),
  claimedAt: bigint('claimed_at', { mode: 'number' }),
  responseStatus: bigint('response_status', { mode: 'number' }),
  error: text('error'),
  sentAt: bigint('sent_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
})

export const webhookRegistrationLimits = pgTable('webhook_registration_limits', {
  addressHash: text('address_hash').primaryKey(),
  windowStartedAt: bigint('window_started_at', { mode: 'number' }).notNull(),
  attempts: bigint('attempts', { mode: 'number' }).notNull()
})

export const menuReviews = pgTable('menu_reviews', {
  menuKey: text('menu_key').notNull(),
  sessionId: text('session_id').notNull(),
  rating: bigint('rating', { mode: 'number' }).notNull(),
  menuName: text('menu_name').notNull(),
  menuDate: text('menu_date').notNull(),
  mealTimeId: text('meal_time_id').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [primaryKey({ columns: [table.menuKey, table.sessionId] })])

export const menuReviewIdentityLimits = pgTable('menu_review_identity_limits', {
  addressHash: text('address_hash').primaryKey(),
  windowStartedAt: bigint('window_started_at', { mode: 'number' }).notNull(),
  attempts: bigint('attempts', { mode: 'number' }).notNull()
})
