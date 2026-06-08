import { bigint, pgTable, text } from 'drizzle-orm/pg-core'

export const restaurants = pgTable('restaurants', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON: Restaurant
  cachedAt: bigint('cached_at', { mode: 'number' }).notNull()
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
  cachedAt: bigint('cached_at', { mode: 'number' }).notNull()
})

// Tracks which restaurants have been selected by at least one user (anonymously)
export const userSelectedRestaurants = pgTable('user_selected_restaurants', {
  restaurantId: text('restaurant_id').primaryKey(),
  lastSeenAt: bigint('last_seen_at', { mode: 'number' }).notNull()
})

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  data: text('data').notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
})
