import type { Vendor, CafeteriaClient, MealTime, Menu, MenuComponent, Restaurant } from '@pmh-only/welplan2-model'
import { WelstoryPlusClient } from '@pmh-only/welplan2-welstory-plus'
import { PlaneatChoiceClient } from '@pmh-only/welplan2-planeat-choice'
import './env.js'
import { db, ensureDbInitialized } from './db/index.js'
import { createServerLogger } from './log.js'
import {
  restaurants as restaurantsTable,
  mealTimesCache,
  menusCache,
  menuDetailCache,
  menuNutrientDetailCache,
  precomputedPageCache,
  imageCache,
  appSettings
} from './db/schema.js'
import { desc, eq, sql } from 'drizzle-orm'

const syncLog = createServerLogger('sync')
const DEFAULT_MENU_CACHE_TTL_MS = 30 * 60 * 1000
const NOTICE_SETTINGS_KEY = 'notice'
const EMPTY_NOTICE_SETTINGS: NoticeSettings = {
  enabled: false,
  title: '',
  summary: '',
  detail: ''
}

type CachedCountRow = { count: number | string | bigint }

export type CacheTableName =
  | 'restaurants'
  | 'mealTimes'
  | 'menus'
  | 'menuDetails'
  | 'menuNutrientDetails'
  | 'precomputedPages'
  | 'images'

export type CachePageRow = {
  key: string
  cachedAt: number
  contentType?: string
  dataSize: number
  dataPreview: string
}

export type CachePage = {
  table: CacheTableName
  page: number
  pageSize: number
  total: number
  totalPages: number
  rows: CachePageRow[]
}

export type CachedMenus = {
  restaurantId: string
  date: string
  mealTimeId: string
  menus: Menu[]
}

export type NoticeSettings = {
  enabled: boolean
  title: string
  summary: string
  detail: string
  updatedAt?: number
}

export type ServiceOptions = { allowRemoteFetch?: boolean }

export class CafeteriaService {
  private welstory: WelstoryPlusClient | null = null
  private planeat: PlaneatChoiceClient | null = null
  private cacheLoaded = false
  private cachePromise: Promise<void> | null = null
  private readonly allowRemoteFetch: boolean

  constructor(options: ServiceOptions = {}) {
    this.allowRemoteFetch = options.allowRemoteFetch === true
  }

  private normalizeSearchText(value: string): string {
    return value.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim()
  }

  private compactSearchText(value: string): string {
    return this.normalizeSearchText(value).replace(/\s+/g, '')
  }

  private isClosedRestaurant(restaurant: Restaurant): boolean {
    return this.normalizeSearchText(restaurant.name).includes('(운영종료)')
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

  private async readRestaurants(): Promise<Restaurant[]> {
    await ensureDbInitialized()
    const rows = await db.select().from(restaurantsTable).execute()
    return rows
      .map((row) => {
        try {
          return JSON.parse(row.data) as Restaurant
        } catch {
          return null
        }
      })
      .filter(
        (restaurant): restaurant is Restaurant =>
          Boolean(
            restaurant &&
              typeof restaurant.id === 'string' &&
              restaurant.id.length > 0 &&
              typeof restaurant.name === 'string' &&
              typeof restaurant.vendor === 'string'
          )
      )
  }

  private async readOne<T>(query: { execute: () => Promise<T[]> }): Promise<T | undefined> {
    await ensureDbInitialized()
    const rows = await query.execute()
    return rows[0]
  }

  private getWelstoryClient(): WelstoryPlusClient {
    if (!this.welstory) {
      syncLog.info('initializing vendor client', { vendor: 'welstory' })
      this.welstory = new WelstoryPlusClient({
        username: process.env.WELSTORY_USERNAME,
        password: process.env.WELSTORY_PASSWORD,
        deviceId: process.env.WELSTORY_DEVICE_ID
      })
    }
    return this.welstory
  }

  private getPlaneatClient(): PlaneatChoiceClient {
    if (!this.planeat) {
      syncLog.info('initializing vendor client', { vendor: 'planeat' })
      this.planeat = new PlaneatChoiceClient()
    }
    return this.planeat
  }

  private getClient(vendor: Vendor): CafeteriaClient {
    return vendor === 'welstory' ? this.getWelstoryClient() : this.getPlaneatClient()
  }

  private now(): number {
    return Date.now()
  }

  private menuCacheTtlMs(): number {
    const ttl = Number(process.env.MENU_CACHE_TTL_MS)
    return Number.isFinite(ttl) && ttl >= 0 ? ttl : DEFAULT_MENU_CACHE_TTL_MS
  }

  private isFreshCache(cachedAt: number): boolean {
    return this.now() - cachedAt < this.menuCacheTtlMs()
  }

  private menuCacheKey(restaurantId: string, date: string, mealTimeId: string): string {
    return `${restaurantId}:${date}:${mealTimeId}`
  }

  private parseMenuCacheKey(key: string): { restaurantId: string; date: string; mealTimeId: string } | null {
    const parts = key.split(':')
    if (parts.length < 3) return null
    const mealTimeId = parts[parts.length - 1]
    const date = parts[parts.length - 2]
    const restaurantId = parts.slice(0, -2).join(':')
    if (!restaurantId || !date || !mealTimeId) return null
    return { restaurantId, date, mealTimeId }
  }

  private normalizeMenus(menus: Menu[]): { menus: Menu[]; takeOutAdjustments: number } {
    let takeOutAdjustments = 0
    for (const menu of menus) {
      if (!menu.isTakeOut && (menu.nutrition?.calories ?? 0) > 3000) {
        menu.isTakeOut = true
        takeOutAdjustments++
      }
    }
    return { menus, takeOutAdjustments }
  }

  private async populateCache(): Promise<void> {
    await ensureDbInitialized()
    const startedAt = this.now()
    syncLog.info('restaurant sync started')

    const [welstorySelectedResult, welstorySearchResult, planeatResult] = await Promise.allSettled([
      Promise.resolve().then(() => this.getWelstoryClient().getRestaurants()),
      Promise.resolve().then(() => this.getWelstoryClient().searchRestaurants('')),
      Promise.resolve().then(() => this.getPlaneatClient().getRestaurants())
    ])

    const toInsert: (typeof restaurantsTable.$inferInsert)[] = []
    const welstoryRestaurants = new Map<string, Restaurant>()

    if (welstorySelectedResult.status === 'fulfilled') {
      syncLog.info('vendor restaurant sync completed', {
        vendor: 'welstory-selected',
        restaurantCount: welstorySelectedResult.value.length
      })
      for (const r of welstorySelectedResult.value) welstoryRestaurants.set(r.id, r)
    } else {
      syncLog.warn('vendor restaurant sync failed', {
        vendor: 'welstory-selected',
        error: welstorySelectedResult.reason
      })
    }

    if (welstorySearchResult.status === 'fulfilled') {
      syncLog.info('vendor restaurant sync completed', {
        vendor: 'welstory-search',
        restaurantCount: welstorySearchResult.value.length
      })
      for (const r of welstorySearchResult.value) welstoryRestaurants.set(r.id, r)
    } else {
      syncLog.warn('vendor restaurant sync failed', {
        vendor: 'welstory-search',
        error: welstorySearchResult.reason
      })
    }

    for (const r of welstoryRestaurants.values()) {
      toInsert.push({ id: r.id, data: JSON.stringify(r), cachedAt: this.now() })
    }

    if (planeatResult.status === 'fulfilled') {
      syncLog.info('vendor restaurant sync completed', {
        vendor: 'planeat',
        restaurantCount: planeatResult.value.length
      })
      for (const r of planeatResult.value) {
        toInsert.push({ id: r.id, data: JSON.stringify(r), cachedAt: this.now() })
      }
    } else {
      syncLog.warn('vendor restaurant sync failed', {
        vendor: 'planeat',
        error: planeatResult.reason
      })
    }

    if (toInsert.length > 0) {
      await db.transaction(async (tx) => {
        for (const row of toInsert) {
          await tx
            .insert(restaurantsTable)
            .values(row)
            .onConflictDoUpdate({
              target: restaurantsTable.id,
              set: { data: row.data, cachedAt: row.cachedAt }
            })
            .execute()
        }
      })
    }

    this.cacheLoaded = true
    syncLog.info('restaurant sync completed', {
      restaurantCount: toInsert.length,
      durationMs: this.now() - startedAt
    })
  }

  private async ensureCache(): Promise<void> {
    await ensureDbInitialized()
    if (this.cacheLoaded) {
      syncLog.debug('restaurant cache already loaded')
      return
    }

    if (!this.allowRemoteFetch) {
      this.cacheLoaded = true
      syncLog.debug('restaurant cache load skipped because remote fetch is disabled')
      return
    }

    if (this.cachePromise) {
      syncLog.debug('waiting for in-flight restaurant sync')
      return this.cachePromise
    }

    syncLog.info('restaurant cache load requested')
    this.cachePromise = this.populateCache().finally(() => {
      this.cachePromise = null
    })
    return this.cachePromise
  }

  private async resolveRestaurant(id: string): Promise<Restaurant> {
    await ensureDbInitialized()
    let row = await this.readOne(db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)))
    if (!row) {
      await this.ensureCache()
      row = await this.readOne(db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)))
    }
    if (!row) {
      syncLog.warn('restaurant lookup failed', { restaurantId: id })
      throw new Error(`Restaurant '${id}' not found`)
    }
    try {
      return JSON.parse(row.data) as Restaurant
    } catch {
      throw new Error(`Restaurant '${id}' cache data is invalid`)
    }
  }

  async getRestaurant(id: string): Promise<Restaurant | null> {
    await this.ensureCache()
    const row = await this.readOne(db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)))
    if (!row) {
      syncLog.warn('restaurant lookup failed', { restaurantId: id })
      return null
    }
    try {
      return JSON.parse(row.data) as Restaurant
    } catch {
      return null
    }
  }

  async getRestaurants(): Promise<Restaurant[]> {
    await this.ensureCache()
    return this.readRestaurants()
  }

  async getCachedMenus(restaurantId: string, date: string, mealTimeId: string): Promise<Menu[] | null> {
    const cached = await this.readOne(
      db
        .select()
        .from(menusCache)
        .where(eq(menusCache.key, this.menuCacheKey(restaurantId, date, mealTimeId)))
    )
    if (!cached) return null

    try {
      return JSON.parse(cached.data) as Menu[]
    } catch {
      return null
    }
  }

  async getCachedMenusForDates(dates: string[]): Promise<CachedMenus[]> {
    await ensureDbInitialized()
    const wantedDates = new Set(dates)
    const rows = await db.select({ key: menusCache.key, data: menusCache.data }).from(menusCache).execute()
    const cachedMenus: CachedMenus[] = []

    for (const row of rows) {
      const parsed = this.parseMenuCacheKey(row.key)
      if (!parsed || !wantedDates.has(parsed.date)) continue

      try {
        const menus = JSON.parse(row.data) as Menu[]
        if (menus.length > 0) cachedMenus.push({ ...parsed, menus })
      } catch {
        continue
      }
    }

    return cachedMenus
  }

  async getCachedMenuDates(dates: string[]): Promise<Map<string, Set<string>>> {
    await ensureDbInitialized()
    const wantedDates = new Set(dates)
    const byRestaurant = new Map<string, Set<string>>()
    const rows = await db.select().from(menusCache).execute()

    for (const row of rows) {
      const parsed = this.parseMenuCacheKey(row.key)
      if (!parsed || !wantedDates.has(parsed.date)) continue

      const menus = JSON.parse(row.data) as Menu[]
      if (menus.length === 0) continue

      const restaurantDates = byRestaurant.get(parsed.restaurantId) ?? new Set<string>()
      restaurantDates.add(parsed.date)
      byRestaurant.set(parsed.restaurantId, restaurantDates)
    }

    return byRestaurant
  }

  async hydrateRestaurants(restaurants: Restaurant[]): Promise<Restaurant[]> {
    await this.ensureCache()
    const knownRestaurants = new Map((await this.readRestaurants()).map((restaurant) => [restaurant.id, restaurant]))
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
    const cachedRows = await db.select().from(mealTimesCache).execute()
    const cachedMealTimes = this.mergeMealTimes(
      cachedRows.map((row): PromiseSettledResult<MealTime[]> => {
        try {
          return { status: 'fulfilled', value: JSON.parse(row.data) as MealTime[] }
        } catch (error) {
          return { status: 'rejected', reason: error }
        }
      })
    )
    if (cachedMealTimes.length > 0) return cachedMealTimes

    const byVendor = new Map<string, Restaurant>()
    for (const r of await this.readRestaurants()) {
      if (!byVendor.has(r.vendor)) byVendor.set(r.vendor, r)
    }
    const results = await Promise.allSettled([...byVendor.values()].map((r) => this.getMealTimes(r.id)))
    return this.mergeMealTimes(results)
  }

  async getMealTimes(restaurantId: string): Promise<MealTime[]> {
    const restaurant = await this.resolveRestaurant(restaurantId)
    const cached = await this.readOne(
      db.select().from(mealTimesCache).where(eq(mealTimesCache.restaurantId, restaurantId))
    )

    if (cached && restaurant.vendor !== 'shinsegae') {
      const mealTimes = JSON.parse(cached.data) as MealTime[]
      syncLog.info('meal-time cache hit', {
        restaurantId,
        mealTimeCount: mealTimes.length
      })
      return mealTimes
    }

    if (!this.allowRemoteFetch) {
      if (cached) {
        return JSON.parse(cached.data) as MealTime[]
      }
      throw new Error(`Meal time cache miss for restaurant '${restaurantId}' in read-only mode`)
    }

    syncLog.info('meal-time cache miss', { restaurantId })

    try {
      const mealTimes = await this.getClient(restaurant.vendor).getMealTimes(restaurant)
      await db
        .insert(mealTimesCache)
        .values({ restaurantId, data: JSON.stringify(mealTimes), cachedAt: this.now() })
        .onConflictDoUpdate({
          target: mealTimesCache.restaurantId,
          set: { data: JSON.stringify(mealTimes), cachedAt: this.now() }
        })
        .execute()
      syncLog.info('meal-times cached', {
        restaurantId,
        vendor: restaurant.vendor,
        mealTimeCount: mealTimes.length
      })
      return mealTimes
    } catch (error) {
      syncLog.warn('meal-time fetch failed', {
        restaurantId,
        vendor: restaurant.vendor,
        error
      })
      throw error
    }
  }

  async getMenus(restaurantId: string, date: string, mealTimeId: string): Promise<Menu[]> {
    const restaurant = await this.resolveRestaurant(restaurantId)
    const key = this.menuCacheKey(restaurantId, date, mealTimeId)
    const cached = await this.readOne(db.select().from(menusCache).where(eq(menusCache.key, key)))

    if (cached && this.isFreshCache(cached.cachedAt)) {
      const menus = JSON.parse(cached.data) as Menu[]
      if (menus.length === 0) {
        await db.delete(menusCache).where(eq(menusCache.key, key)).execute()
        syncLog.info('empty menu cache ignored', {
          restaurantId,
          date,
          mealTimeId
        })
      } else {
        const normalized = this.normalizeMenus(menus)
        syncLog.info('menu cache hit', {
          restaurantId,
          date,
          mealTimeId,
          menuCount: normalized.menus.length,
          takeOutAdjustments: normalized.takeOutAdjustments
        })
        return normalized.menus
      }
    }

    if (cached && !this.allowRemoteFetch) {
      const menus = JSON.parse(cached.data) as Menu[]
      const normalized = this.normalizeMenus(menus)
      syncLog.info('menu cache returned in read-only mode', {
        restaurantId,
        date,
        mealTimeId,
        menuCount: normalized.menus.length
      })
      return normalized.menus
    }

    if (cached) {
      syncLog.info('menu cache stale', {
        restaurantId,
        date,
        mealTimeId,
        cachedAgeMs: this.now() - cached.cachedAt,
        cacheTtlMs: this.menuCacheTtlMs()
      })
    }

    if (!this.allowRemoteFetch) {
      return []
    }

    syncLog.info('menu cache miss', { restaurantId, date, mealTimeId })

    try {
      const { menus, takeOutAdjustments } = this.normalizeMenus(
        await this.getClient(restaurant.vendor).getMenus(restaurant, date, mealTimeId)
      )

      if (menus.length > 0) {
        await db
          .insert(menusCache)
          .values({ key, data: JSON.stringify(menus), cachedAt: this.now() })
          .onConflictDoUpdate({
            target: menusCache.key,
            set: { data: JSON.stringify(menus), cachedAt: this.now() }
          })
          .execute()
      }

      syncLog.info(menus.length > 0 ? 'menus cached' : 'menus not cached because empty', {
        restaurantId,
        vendor: restaurant.vendor,
        date,
        mealTimeId,
        menuCount: menus.length,
        takeOutAdjustments
      })
      return menus
    } catch (error) {
      syncLog.warn('menu fetch failed', {
        restaurantId,
        vendor: restaurant.vendor,
        date,
        mealTimeId,
        error
      })
      throw error
    }
  }

  async getMenuDetail(
    restaurantId: string,
    date: string,
    mealTimeId: string,
    hallNo: string,
    courseType: string
  ): Promise<MenuComponent[]> {
    const key = `${restaurantId}:${date}:${mealTimeId}:${hallNo}:${courseType}`
    const cached = await this.readOne(db.select().from(menuDetailCache).where(eq(menuDetailCache.key, key)))

    if (cached && this.isFreshCache(cached.cachedAt)) {
      const detail = JSON.parse(cached.data) as MenuComponent[]
      syncLog.info('menu detail cache hit', {
        restaurantId,
        date,
        mealTimeId,
        hallNo,
        courseType,
        componentCount: detail.length
      })
      return detail
    }

    if (cached && !this.allowRemoteFetch) {
      const detail = JSON.parse(cached.data) as MenuComponent[]
      syncLog.info('menu detail returned in read-only mode', {
        restaurantId,
        date,
        mealTimeId,
        hallNo,
        courseType,
        componentCount: detail.length
      })
      return detail
    }

    if (cached) {
      syncLog.info('menu detail cache stale', {
        restaurantId,
        date,
        mealTimeId,
        hallNo,
        courseType,
        cachedAgeMs: this.now() - cached.cachedAt,
        cacheTtlMs: this.menuCacheTtlMs()
      })
    }

    if (!this.allowRemoteFetch) {
      throw new Error(`Menu detail cache miss for restaurant '${restaurantId}' in read-only mode`)
    }

    syncLog.info('menu detail cache miss', {
      restaurantId,
      date,
      mealTimeId,
      hallNo,
      courseType
    })

    const restaurant = await this.resolveRestaurant(restaurantId)
    const client = this.getClient(restaurant.vendor)
    if (!client.getMenuDetail) {
      throw new Error(`Menu detail not supported for vendor '${restaurant.vendor}'`)
    }

    try {
      const detail = await client.getMenuDetail(restaurant, date, mealTimeId, hallNo, courseType)
      await db
        .insert(menuDetailCache)
        .values({ key, data: JSON.stringify(detail), cachedAt: this.now() })
        .onConflictDoUpdate({
          target: menuDetailCache.key,
          set: { data: JSON.stringify(detail), cachedAt: this.now() }
        })
        .execute()
      syncLog.info('menu detail cached', {
        restaurantId,
        vendor: restaurant.vendor,
        date,
        mealTimeId,
        hallNo,
        courseType,
        componentCount: detail.length
      })
      return detail
    } catch (error) {
      syncLog.warn('menu detail fetch failed', {
        restaurantId,
        vendor: restaurant.vendor,
        date,
        mealTimeId,
        hallNo,
        courseType,
        error
      })
      throw error
    }
  }

  async getMenuNutrientDetail(
    restaurantId: string,
    date: string,
    mealTimeId: string,
    hallNo: string,
    courseType: string
  ): Promise<MenuComponent[]> {
    const key = `${restaurantId}:${date}:${mealTimeId}:${hallNo}:${courseType}`
    const cached = await this.readOne(
      db.select().from(menuNutrientDetailCache).where(eq(menuNutrientDetailCache.key, key))
    )

    if (cached && this.isFreshCache(cached.cachedAt)) {
      const detail = JSON.parse(cached.data) as MenuComponent[]
      syncLog.info('menu nutrient detail cache hit', {
        restaurantId,
        date,
        mealTimeId,
        hallNo,
        courseType,
        componentCount: detail.length
      })
      return detail
    }

    if (cached && !this.allowRemoteFetch) {
      const detail = JSON.parse(cached.data) as MenuComponent[]
      syncLog.info('menu nutrient detail returned in read-only mode', {
        restaurantId,
        date,
        mealTimeId,
        hallNo,
        courseType,
        componentCount: detail.length
      })
      return detail
    }

    if (cached) {
      syncLog.info('menu nutrient detail cache stale', {
        restaurantId,
        date,
        mealTimeId,
        hallNo,
        courseType,
        cachedAgeMs: this.now() - cached.cachedAt,
        cacheTtlMs: this.menuCacheTtlMs()
      })
    }

    if (!this.allowRemoteFetch) {
      throw new Error(`Menu nutrient detail cache miss for restaurant '${restaurantId}' in read-only mode`)
    }

    syncLog.info('menu nutrient detail cache miss', {
      restaurantId,
      date,
      mealTimeId,
      hallNo,
      courseType
    })

    const restaurant = await this.resolveRestaurant(restaurantId)
    const client = this.getClient(restaurant.vendor)
    if (!client.getMenuNutrientDetail) {
      throw new Error(`Menu nutrient detail not supported for vendor '${restaurant.vendor}'`)
    }

    try {
      const detail = await client.getMenuNutrientDetail(
        restaurant,
        date,
        mealTimeId,
        hallNo,
        courseType
      )
      await db
        .insert(menuNutrientDetailCache)
        .values({ key, data: JSON.stringify(detail), cachedAt: this.now() })
        .onConflictDoUpdate({
          target: menuNutrientDetailCache.key,
          set: { data: JSON.stringify(detail), cachedAt: this.now() }
        })
        .execute()
      syncLog.info('menu nutrient detail cached', {
        restaurantId,
        vendor: restaurant.vendor,
        date,
        mealTimeId,
        hallNo,
        courseType,
        componentCount: detail.length
      })
      return detail
    } catch (error) {
      syncLog.warn('menu nutrient detail fetch failed', {
        restaurantId,
        vendor: restaurant.vendor,
        date,
        mealTimeId,
        hallNo,
        courseType,
        error
      })
      throw error
    }
  }

  async getPrecomputedPage<T>(key: string): Promise<T | null> {
    await ensureDbInitialized()
    const cached = await this.readOne(
      db.select().from(precomputedPageCache).where(eq(precomputedPageCache.key, key))
    )
    if (!cached) return null

    try {
      syncLog.info('precomputed page cache hit', { key })
      return JSON.parse(cached.data) as T
    } catch {
      syncLog.warn('precomputed page cache invalid', { key })
      return null
    }
  }

  async setPrecomputedPage(key: string, data: unknown): Promise<void> {
    await ensureDbInitialized()
    const now = this.now()
    await db
      .insert(precomputedPageCache)
      .values({ key, data: JSON.stringify(data), cachedAt: now })
      .onConflictDoUpdate({
        target: precomputedPageCache.key,
        set: { data: JSON.stringify(data), cachedAt: now }
      })
      .execute()
    syncLog.info('precomputed page cached', { key })
  }

  private async count(query: { execute: () => Promise<CachedCountRow[]> }): Promise<number> {
    await ensureDbInitialized()
    const result = await query.execute()
    const value = result?.[0]?.count
    const count = Number(value ?? 0)
    return Number.isFinite(count) ? count : 0
  }

  async getCacheStatus(): Promise<Record<string, number | boolean>> {
    return {
      restaurantsLoaded: this.cacheLoaded,
      restaurants: await this.count(db.select({ count: sql<number>`count(*)` }).from(restaurantsTable)),
      mealTimes: await this.count(db.select({ count: sql<number>`count(*)` }).from(mealTimesCache)),
      menus: await this.count(db.select({ count: sql<number>`count(*)` }).from(menusCache)),
      menuDetails: await this.count(db.select({ count: sql<number>`count(*)` }).from(menuDetailCache)),
      menuNutrientDetails: await this.count(
        db.select({ count: sql<number>`count(*)` }).from(menuNutrientDetailCache)
      ),
      precomputedPages: await this.count(
        db.select({ count: sql<number>`count(*)` }).from(precomputedPageCache)
      ),
      images: await this.count(
        db.select({ count: sql<number>`count(*)` }).from(imageCache)
      )
    }
  }

  async getCachePage(table: CacheTableName, page: number, pageSize: number): Promise<CachePage> {
    const safePage = Math.max(1, Math.floor(page))
    const safePageSize = Math.min(100, Math.max(5, Math.floor(pageSize)))
    const offset = (safePage - 1) * safePageSize

    const mapRows = (rows: { key: string; data: string; cachedAt: number; contentType?: string }[]): CachePageRow[] => {
      return rows.map((row) => ({
        key: row.key,
        cachedAt: row.cachedAt,
        contentType: row.contentType,
        dataSize: row.data.length,
        dataPreview: row.contentType
          ? row.data.slice(0, 120)
          : row.data.replace(/\s+/g, ' ').slice(0, 500)
      }))
    }

    let total = 0
    let rows: CachePageRow[] = []

    switch (table) {
      case 'restaurants': {
        total = await this.count(db.select({ count: sql<number>`count(*)` }).from(restaurantsTable))
        rows = mapRows(await db
          .select({ key: restaurantsTable.id, data: restaurantsTable.data, cachedAt: restaurantsTable.cachedAt })
          .from(restaurantsTable)
          .orderBy(desc(restaurantsTable.cachedAt), restaurantsTable.id)
          .limit(safePageSize)
          .offset(offset)
          .execute())
        break
      }
      case 'mealTimes': {
        total = await this.count(db.select({ count: sql<number>`count(*)` }).from(mealTimesCache))
        rows = mapRows(await db
          .select({ key: mealTimesCache.restaurantId, data: mealTimesCache.data, cachedAt: mealTimesCache.cachedAt })
          .from(mealTimesCache)
          .orderBy(desc(mealTimesCache.cachedAt), mealTimesCache.restaurantId)
          .limit(safePageSize)
          .offset(offset)
          .execute())
        break
      }
      case 'menus': {
        total = await this.count(db.select({ count: sql<number>`count(*)` }).from(menusCache))
        rows = mapRows(await db
          .select({ key: menusCache.key, data: menusCache.data, cachedAt: menusCache.cachedAt })
          .from(menusCache)
          .orderBy(desc(menusCache.cachedAt), menusCache.key)
          .limit(safePageSize)
          .offset(offset)
          .execute())
        break
      }
      case 'menuDetails': {
        total = await this.count(db.select({ count: sql<number>`count(*)` }).from(menuDetailCache))
        rows = mapRows(await db
          .select({ key: menuDetailCache.key, data: menuDetailCache.data, cachedAt: menuDetailCache.cachedAt })
          .from(menuDetailCache)
          .orderBy(desc(menuDetailCache.cachedAt), menuDetailCache.key)
          .limit(safePageSize)
          .offset(offset)
          .execute())
        break
      }
      case 'menuNutrientDetails': {
        total = await this.count(db.select({ count: sql<number>`count(*)` }).from(menuNutrientDetailCache))
        rows = mapRows(await db
          .select({ key: menuNutrientDetailCache.key, data: menuNutrientDetailCache.data, cachedAt: menuNutrientDetailCache.cachedAt })
          .from(menuNutrientDetailCache)
          .orderBy(desc(menuNutrientDetailCache.cachedAt), menuNutrientDetailCache.key)
          .limit(safePageSize)
          .offset(offset)
          .execute())
        break
      }
      case 'precomputedPages': {
        total = await this.count(db.select({ count: sql<number>`count(*)` }).from(precomputedPageCache))
        rows = mapRows(await db
          .select({ key: precomputedPageCache.key, data: precomputedPageCache.data, cachedAt: precomputedPageCache.cachedAt })
          .from(precomputedPageCache)
          .orderBy(desc(precomputedPageCache.cachedAt), precomputedPageCache.key)
          .limit(safePageSize)
          .offset(offset)
          .execute())
        break
      }
      case 'images': {
        total = await this.count(db.select({ count: sql<number>`count(*)` }).from(imageCache))
        rows = mapRows(await db
          .select({ key: imageCache.key, data: imageCache.data, cachedAt: imageCache.cachedAt, contentType: imageCache.contentType })
          .from(imageCache)
          .orderBy(desc(imageCache.cachedAt), imageCache.key)
          .limit(safePageSize)
          .offset(offset)
          .execute())
        break
      }
    }

    return {
      table,
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
      rows
    }
  }

  private normalizeNoticeSettings(value: Partial<NoticeSettings>): NoticeSettings {
    const title = typeof value.title === 'string' ? value.title.trim().slice(0, 80) : ''
    const summary = typeof value.summary === 'string' ? value.summary.trim().slice(0, 180) : ''
    const detail = typeof value.detail === 'string' ? value.detail.trim().slice(0, 5000) : ''

    return {
      enabled: value.enabled === true && (summary.length > 0 || detail.length > 0),
      title,
      summary,
      detail,
      updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : undefined
    }
  }

  async getNoticeSettings(): Promise<NoticeSettings> {
    await ensureDbInitialized()
    const row = await this.readOne(db.select().from(appSettings).where(eq(appSettings.key, NOTICE_SETTINGS_KEY)))
    if (!row) return EMPTY_NOTICE_SETTINGS

    try {
      return this.normalizeNoticeSettings({
        ...(JSON.parse(row.data) as Partial<NoticeSettings>),
        updatedAt: row.updatedAt
      })
    } catch {
      return EMPTY_NOTICE_SETTINGS
    }
  }

  async setNoticeSettings(value: Partial<NoticeSettings>): Promise<NoticeSettings> {
    await ensureDbInitialized()
    const now = this.now()
    const notice = this.normalizeNoticeSettings({ ...value, updatedAt: now })

    await db
      .insert(appSettings)
      .values({ key: NOTICE_SETTINGS_KEY, data: JSON.stringify(notice), updatedAt: now })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { data: JSON.stringify(notice), updatedAt: now }
      })
      .execute()

    syncLog.info('notice settings updated', { enabled: notice.enabled })
    return notice
  }

  async clearCaches(): Promise<Record<string, number>> {
    await ensureDbInitialized()
    const cleared = {
      restaurants: await this.count(db.select({ count: sql<number>`count(*)` }).from(restaurantsTable)),
      mealTimes: await this.count(db.select({ count: sql<number>`count(*)` }).from(mealTimesCache)),
      menus: await this.count(db.select({ count: sql<number>`count(*)` }).from(menusCache)),
      menuDetails: await this.count(db.select({ count: sql<number>`count(*)` }).from(menuDetailCache)),
      menuNutrientDetails: await this.count(
        db.select({ count: sql<number>`count(*)` }).from(menuNutrientDetailCache)
      ),
      precomputedPages: await this.count(
        db.select({ count: sql<number>`count(*)` }).from(precomputedPageCache)
      ),
      images: await this.count(
        db.select({ count: sql<number>`count(*)` }).from(imageCache)
      )
    }

    syncLog.info('clearing caches', cleared)

    await db.delete(restaurantsTable).execute()
    await db.delete(mealTimesCache).execute()
    await db.delete(menusCache).execute()
    await db.delete(menuDetailCache).execute()
    await db.delete(menuNutrientDetailCache).execute()
    await db.delete(precomputedPageCache).execute()
    await db.delete(imageCache).execute()

    this.cacheLoaded = false
    this.cachePromise = null

    syncLog.info('caches cleared', cleared)

    return cleared
  }

  async registerRestaurant(restaurant: Restaurant): Promise<void> {
    await ensureDbInitialized()
    const existing = await this.readOne(
      db.select().from(restaurantsTable).where(eq(restaurantsTable.id, restaurant.id))
    )
    const mergedRestaurant = existing
      ? {
          ...(JSON.parse(existing.data) as Restaurant),
          ...restaurant,
          path: restaurant.path ?? (JSON.parse(existing.data) as Restaurant).path
        }
      : restaurant

    await db
      .insert(restaurantsTable)
      .values({
        id: mergedRestaurant.id,
        data: JSON.stringify(mergedRestaurant),
        cachedAt: this.now()
      })
      .onConflictDoUpdate({
        target: restaurantsTable.id,
        set: { data: JSON.stringify(mergedRestaurant), cachedAt: this.now() }
      })
      .execute()

    syncLog.info('registered restaurant', {
      restaurantId: mergedRestaurant.id,
      vendor: mergedRestaurant.vendor,
      restaurantName: mergedRestaurant.name
    })
  }

  async searchRestaurants(query: string): Promise<Restaurant[]> {
    await this.ensureCache()
    const fromCache = (await this.readRestaurants()).filter(
      (restaurant) => !this.isClosedRestaurant(restaurant)
    )
    syncLog.info('restaurant search started', { query, cachedRestaurantCount: fromCache.length })

    const fromWelstory = this.allowRemoteFetch
      ? await Promise.resolve()
        .then(() => this.getWelstoryClient().searchRestaurants(query))
        .catch((error) => {
          syncLog.warn('vendor restaurant search failed', {
            vendor: 'welstory',
            query,
            error
          })
          return []
        })
        .then((restaurants) =>
          restaurants.filter(
            (r) =>
              typeof r.id === 'string' &&
              r.id.length > 0 &&
              typeof r.name === 'string' &&
              !this.isClosedRestaurant(r) &&
              typeof r.vendor === 'string'
          )
        )
      : []

    const merged = this.mergeSearchResults(query, fromCache, fromWelstory)
    syncLog.info('restaurant search completed', {
      query,
      cachedRestaurantCount: fromCache.length,
      vendorMatchCount: fromWelstory.length,
      mergedCount: merged.length
    })
    return merged
  }
}

export function createService(options: ServiceOptions = {}): CafeteriaService {
  return new CafeteriaService(options)
}

export const service = new CafeteriaService({ allowRemoteFetch: false })
