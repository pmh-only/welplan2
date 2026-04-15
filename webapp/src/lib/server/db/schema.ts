import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const restaurants = sqliteTable('restaurants', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON: Restaurant
  cachedAt: integer('cached_at').notNull()
})

export const mealTimesCache = sqliteTable('meal_times_cache', {
  restaurantId: text('restaurant_id').primaryKey(),
  data: text('data').notNull(), // JSON: MealTime[]
  cachedAt: integer('cached_at').notNull()
})

export const menusCache = sqliteTable('menus_cache', {
  key: text('key').primaryKey(), // `${restaurantId}:${date}:${mealTimeId}`
  data: text('data').notNull(), // JSON: Menu[]
  cachedAt: integer('cached_at').notNull()
})

export const menuDetailCache = sqliteTable('menu_detail_cache', {
  key: text('key').primaryKey(), // `${restaurantId}:${date}:${mealTimeId}:${hallNo}:${courseType}`
  data: text('data').notNull(), // JSON: MenuComponent[]
  cachedAt: integer('cached_at').notNull()
})

export const menuNutrientDetailCache = sqliteTable('menu_nutrient_detail_cache', {
  key: text('key').primaryKey(), // `${restaurantId}:${date}:${mealTimeId}:${hallNo}:${courseType}`
  data: text('data').notNull(), // JSON: MenuComponent[]
  cachedAt: integer('cached_at').notNull()
})

// Tracks which restaurants have been selected by at least one user (anonymously)
export const userSelectedRestaurants = sqliteTable('user_selected_restaurants', {
  restaurantId: text('restaurant_id').primaryKey(),
  lastSeenAt: integer('last_seen_at').notNull()
})
