import type {
  CafeteriaClient,
  MealTime,
  Menu,
  MenuComponent,
  Restaurant,
  Vendor
} from '@pmh-only/welplan2-model'
import { env } from '$env/dynamic/private'
import { WelstoryPlusClient } from '@pmh-only/welplan2-welstory-plus'
import { PlaneatChoiceClient } from '@pmh-only/welplan2-planeat-choice'
import { db } from './db/index.js'
import {
  restaurants as restaurantsTable,
  mealTimesCache,
  menusCache,
  menuDetailCache,
  menuNutrientDetailCache,
  userSelectedRestaurants
} from './db/schema.js'
import { eq, sql } from 'drizzle-orm'

class CafeteriaService {
  private welstory: WelstoryPlusClient | null = null
  private planeat: PlaneatChoiceClient | null = null
  private cacheLoaded = false
  private cachePromise: Promise<void> | null = null

  private normalizeSearchText(value: string): string {
    return value.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim()
  }

  private compactSearchText(value: string): string {
    return this.normalizeSearchText(value).replace(/\s+/g, '')
  }

  private collectSearchValues(value: unknown, values: Set<string>): void {
    if (typeof value === 'string') {
      const normalized = this.normalizeSearchText(value)
      if (normalized) values.add(normalized)
      return
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      values.add(String(value).toLowerCase())
      return
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => this.collectSearchValues(entry, values))
      return
    }

    if (value !== null && typeof value === 'object') {
      Object.values(value).forEach((entry) => this.collectSearchValues(entry, values))
    }
  }

  private isSubsequence(needle: string, haystack: string): boolean {
    let index = 0
    for (const ch of haystack) {
      if (ch === needle[index]) index++
      if (index === needle.length) return true
    }
    return needle.length === 0
  }

  private scoreSearchField(field: string, token: string): number {
    if (!field || !token) return 0
    if (field === token) return 500
    if (field.startsWith(token)) return 300
    if (field.includes(token)) return 200

    const compactField = this.compactSearchText(field)
    const compactToken = this.compactSearchText(token)

    if (!compactField || !compactToken) return 0
    if (compactField === compactToken) return 180
    if (compactField.startsWith(compactToken)) return 140
    if (compactField.includes(compactToken)) return 100
    if (compactToken.length >= 2 && this.isSubsequence(compactToken, compactField)) return 60
    return 0
  }

  private scoreRestaurantSearch(restaurant: Restaurant, query: string): number {
    const normalizedQuery = this.normalizeSearchText(query)
    if (!normalizedQuery) return 0

    const tokens = normalizedQuery.split(' ').filter(Boolean)
    const fields = new Set<string>()
    this.collectSearchValues(restaurant, fields)

    const searchableFields = [...fields]
    if (searchableFields.length === 0) return 0

    let score = 0
    for (const token of tokens) {
      let bestScore = 0
      for (const field of searchableFields) {
        bestScore = Math.max(bestScore, this.scoreSearchField(field, token))
      }
      if (bestScore === 0) return 0
      score += bestScore
    }

    score += this.scoreSearchField(this.normalizeSearchText(restaurant.name), normalizedQuery)
    score += this.scoreSearchField(this.normalizeSearchText(restaurant.id), normalizedQuery)

    return score
  }

  private mergeSearchResults(query: string, ...groups: Restaurant[][]): Restaurant[] {
    const merged = new Map<string, { restaurant: Restaurant; score: number }>()

    for (const restaurants of groups) {
      for (const restaurant of restaurants) {
        const score = this.scoreRestaurantSearch(restaurant, query)
        if (score === 0) continue

        const existing = merged.get(restaurant.id)
        if (!existing || score > existing.score) {
          merged.set(restaurant.id, { restaurant, score })
        }
      }
    }

    return [...merged.values()]
      .sort((a, b) => b.score - a.score || a.restaurant.name.localeCompare(b.restaurant.name, 'ko'))
      .map((entry) => entry.restaurant)
  }

  private readRestaurants(): Restaurant[] {
    return db
      .select()
      .from(restaurantsTable)
      .all()
      .map((row) => JSON.parse(row.data) as Restaurant)
      .filter(
        (r) =>
          typeof r.id === 'string' &&
          r.id.length > 0 &&
          typeof r.name === 'string' &&
          typeof r.vendor === 'string'
      )
  }

  private getWelstoryClient(): WelstoryPlusClient {
    this.welstory ??= new WelstoryPlusClient({
      username: env.WELSTORY_USERNAME,
      password: env.WELSTORY_PASSWORD,
      deviceId: env.WELSTORY_DEVICE_ID
    })
    return this.welstory
  }

  private getPlaneatClient(): PlaneatChoiceClient {
    this.planeat ??= new PlaneatChoiceClient()
    return this.planeat
  }

  private getClient(vendor: Vendor): CafeteriaClient {
    return vendor === 'welstory' ? this.getWelstoryClient() : this.getPlaneatClient()
  }

  private now(): number {
    return Date.now()
  }

  private async populateCache(): Promise<void> {
    const [welstoryResult, planeatResult] = await Promise.allSettled([
      Promise.resolve().then(() => this.getWelstoryClient().getRestaurants()),
      Promise.resolve().then(() => this.getPlaneatClient().getRestaurants())
    ])
    const toInsert: (typeof restaurantsTable.$inferInsert)[] = []
    if (welstoryResult.status === 'fulfilled') {
      for (const r of welstoryResult.value) {
        toInsert.push({ id: r.id, data: JSON.stringify(r), cachedAt: this.now() })
      }
    }
    if (planeatResult.status === 'fulfilled') {
      for (const r of planeatResult.value) {
        toInsert.push({ id: r.id, data: JSON.stringify(r), cachedAt: this.now() })
      }
    }
    if (toInsert.length > 0) {
      db.transaction((tx) => {
        for (const row of toInsert) {
          tx.insert(restaurantsTable)
            .values(row)
            .onConflictDoUpdate({
              target: restaurantsTable.id,
              set: { data: row.data, cachedAt: row.cachedAt }
            })
            .run()
        }
      })
    }
    this.cacheLoaded = true
  }

  private async ensureCache(): Promise<void> {
    if (this.cacheLoaded) return
    if (this.cachePromise) return this.cachePromise
    this.cachePromise = this.populateCache().finally(() => {
      this.cachePromise = null
    })
    return this.cachePromise
  }

  private async resolveRestaurant(id: string): Promise<Restaurant> {
    await this.ensureCache()
    const row = db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).get()
    if (!row) throw new Error(`Restaurant '${id}' not found`)
    return JSON.parse(row.data) as Restaurant
  }

  async getRestaurants(): Promise<Restaurant[]> {
    await this.ensureCache()
    return this.readRestaurants()
  }

  async hydrateRestaurants(restaurants: Restaurant[]): Promise<Restaurant[]> {
    await this.ensureCache()
    const knownRestaurants = new Map(
      this.readRestaurants().map((restaurant) => [restaurant.id, restaurant])
    )
    return restaurants.map((restaurant) => {
      const knownRestaurant = knownRestaurants.get(restaurant.id)
      if (!knownRestaurant) return restaurant
      return {
        ...restaurant,
        ...knownRestaurant,
        path: knownRestaurant.path ?? restaurant.path
      }
    })
  }

  getUserSelectedRestaurants(): Restaurant[] {
    const selected = db.select().from(userSelectedRestaurants).all()
    const ids = new Set(selected.map((r) => r.restaurantId))
    return this.readRestaurants().filter((r) => ids.has(r.id))
  }

  private mergeMealTimes(results: PromiseSettledResult<MealTime[]>[]): MealTime[] {
    const seen = new Set<string>()
    const merged: MealTime[] = []
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      for (const t of result.value) {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          merged.push(t)
        }
      }
    }
    return merged
  }

  async getMealTimesForRestaurants(restaurants: Restaurant[]): Promise<MealTime[]> {
    await this.ensureCache()
    const uniqueRestaurants = [...new Map(restaurants.map((r) => [r.id, r])).values()]
    const results = await Promise.allSettled(uniqueRestaurants.map((r) => this.getMealTimes(r.id)))
    return this.mergeMealTimes(results)
  }

  async getAllMealTimes(): Promise<MealTime[]> {
    await this.ensureCache()
    const byVendor = new Map<string, Restaurant>()
    for (const r of this.readRestaurants()) {
      if (!byVendor.has(r.vendor)) byVendor.set(r.vendor, r)
    }
    const results = await Promise.allSettled(
      [...byVendor.values()].map((r) => this.getMealTimes(r.id))
    )
    return this.mergeMealTimes(results)
  }

  async getMealTimes(restaurantId: string): Promise<MealTime[]> {
    const cached = db
      .select()
      .from(mealTimesCache)
      .where(eq(mealTimesCache.restaurantId, restaurantId))
      .get()
    if (cached) return JSON.parse(cached.data) as MealTime[]

    const restaurant = await this.resolveRestaurant(restaurantId)
    const mealTimes = await this.getClient(restaurant.vendor).getMealTimes(restaurant)
    db.insert(mealTimesCache)
      .values({ restaurantId, data: JSON.stringify(mealTimes), cachedAt: this.now() })
      .onConflictDoUpdate({
        target: mealTimesCache.restaurantId,
        set: { data: JSON.stringify(mealTimes), cachedAt: this.now() }
      })
      .run()
    return mealTimes
  }

  async getMenus(restaurantId: string, date: string, mealTimeId: string): Promise<Menu[]> {
    const key = `${restaurantId}:${date}:${mealTimeId}`
    const cached = db.select().from(menusCache).where(eq(menusCache.key, key)).get()
    if (cached) return JSON.parse(cached.data) as Menu[]

    const restaurant = await this.resolveRestaurant(restaurantId)
    const menus = await this.getClient(restaurant.vendor).getMenus(restaurant, date, mealTimeId)
    for (const menu of menus) {
      if (!menu.isTakeOut && (menu.nutrition?.calories ?? 0) > 2000) {
        menu.isTakeOut = true
      }
    }
    db.insert(menusCache)
      .values({ key, data: JSON.stringify(menus), cachedAt: this.now() })
      .onConflictDoUpdate({
        target: menusCache.key,
        set: { data: JSON.stringify(menus), cachedAt: this.now() }
      })
      .run()
    return menus
  }

  async getMenuDetail(
    restaurantId: string,
    date: string,
    mealTimeId: string,
    hallNo: string,
    courseType: string
  ): Promise<MenuComponent[]> {
    const key = `${restaurantId}:${date}:${mealTimeId}:${hallNo}:${courseType}`
    const cached = db.select().from(menuDetailCache).where(eq(menuDetailCache.key, key)).get()
    if (cached) return JSON.parse(cached.data) as MenuComponent[]

    const restaurant = await this.resolveRestaurant(restaurantId)
    const client = this.getClient(restaurant.vendor)
    if (!client.getMenuDetail) {
      throw new Error(`Menu detail not supported for vendor '${restaurant.vendor}'`)
    }
    const detail = await client.getMenuDetail(restaurant, date, mealTimeId, hallNo, courseType)
    db.insert(menuDetailCache)
      .values({ key, data: JSON.stringify(detail), cachedAt: this.now() })
      .onConflictDoUpdate({
        target: menuDetailCache.key,
        set: { data: JSON.stringify(detail), cachedAt: this.now() }
      })
      .run()
    return detail
  }

  async getMenuNutrientDetail(
    restaurantId: string,
    date: string,
    mealTimeId: string,
    hallNo: string,
    courseType: string
  ): Promise<MenuComponent[]> {
    const key = `${restaurantId}:${date}:${mealTimeId}:${hallNo}:${courseType}`
    const cached = db
      .select()
      .from(menuNutrientDetailCache)
      .where(eq(menuNutrientDetailCache.key, key))
      .get()
    if (cached) return JSON.parse(cached.data) as MenuComponent[]

    const restaurant = await this.resolveRestaurant(restaurantId)
    const client = this.getClient(restaurant.vendor)
    if (!client.getMenuNutrientDetail) {
      throw new Error(`Menu nutrient detail not supported for vendor '${restaurant.vendor}'`)
    }
    const detail = await client.getMenuNutrientDetail(
      restaurant,
      date,
      mealTimeId,
      hallNo,
      courseType
    )
    db.insert(menuNutrientDetailCache)
      .values({ key, data: JSON.stringify(detail), cachedAt: this.now() })
      .onConflictDoUpdate({
        target: menuNutrientDetailCache.key,
        set: { data: JSON.stringify(detail), cachedAt: this.now() }
      })
      .run()
    return detail
  }

  private count(query: { get: () => { count: number } | undefined }): number {
    return query.get()?.count ?? 0
  }

  getCacheStatus(): Record<string, number | boolean> {
    return {
      restaurantsLoaded: this.cacheLoaded,
      restaurants: this.count(db.select({ count: sql<number>`count(*)` }).from(restaurantsTable)),
      mealTimes: this.count(db.select({ count: sql<number>`count(*)` }).from(mealTimesCache)),
      menus: this.count(db.select({ count: sql<number>`count(*)` }).from(menusCache)),
      menuDetails: this.count(db.select({ count: sql<number>`count(*)` }).from(menuDetailCache)),
      menuNutrientDetails: this.count(
        db.select({ count: sql<number>`count(*)` }).from(menuNutrientDetailCache)
      )
    }
  }

  clearCaches(): Record<string, number> {
    const cleared = {
      restaurants: this.count(db.select({ count: sql<number>`count(*)` }).from(restaurantsTable)),
      mealTimes: this.count(db.select({ count: sql<number>`count(*)` }).from(mealTimesCache)),
      menus: this.count(db.select({ count: sql<number>`count(*)` }).from(menusCache)),
      menuDetails: this.count(db.select({ count: sql<number>`count(*)` }).from(menuDetailCache)),
      menuNutrientDetails: this.count(
        db.select({ count: sql<number>`count(*)` }).from(menuNutrientDetailCache)
      )
    }

    db.delete(restaurantsTable).run()
    db.delete(mealTimesCache).run()
    db.delete(menusCache).run()
    db.delete(menuDetailCache).run()
    db.delete(menuNutrientDetailCache).run()

    this.cacheLoaded = false
    this.cachePromise = null

    return cleared
  }

  registerRestaurant(restaurant: Restaurant): void {
    const existing = db
      .select()
      .from(restaurantsTable)
      .where(eq(restaurantsTable.id, restaurant.id))
      .get()
    const mergedRestaurant = existing
      ? {
          ...(JSON.parse(existing.data) as Restaurant),
          ...restaurant,
          path: restaurant.path ?? (JSON.parse(existing.data) as Restaurant).path
        }
      : restaurant

    db.insert(restaurantsTable)
      .values({
        id: mergedRestaurant.id,
        data: JSON.stringify(mergedRestaurant),
        cachedAt: this.now()
      })
      .onConflictDoUpdate({
        target: restaurantsTable.id,
        set: { data: JSON.stringify(mergedRestaurant), cachedAt: this.now() }
      })
      .run()
    // Record anonymous user selection
    db.insert(userSelectedRestaurants)
      .values({ restaurantId: restaurant.id, lastSeenAt: this.now() })
      .onConflictDoUpdate({
        target: userSelectedRestaurants.restaurantId,
        set: { lastSeenAt: this.now() }
      })
      .run()
  }

  async searchRestaurants(query: string): Promise<Restaurant[]> {
    await this.ensureCache()
    const fromCache = this.readRestaurants()
    const fromWelstory = await Promise.resolve()
      .then(() => this.getWelstoryClient().searchRestaurants(query))
      .catch(() => [])
      .then((restaurants) =>
        restaurants.filter(
          (r) =>
            typeof r.id === 'string' &&
            r.id.length > 0 &&
            typeof r.name === 'string' &&
            typeof r.vendor === 'string'
        )
      )
    return this.mergeSearchResults(query, fromCache, fromWelstory)
  }
}

export const service = new CafeteriaService()
