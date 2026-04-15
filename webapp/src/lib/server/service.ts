import type {
  CafeteriaClient,
  MealTime,
  Menu,
  MenuComponent,
  Restaurant,
  Vendor
} from '@welplan2/model'
import { WelstoryPlusClient } from '@welplan2/welstory-plus'
import { PlaneatChoiceClient } from '@welplan2/planeat-choice'
import { WELSTORY_USERNAME, WELSTORY_PASSWORD } from '$env/static/private'

class CafeteriaService {
  private readonly welstory: WelstoryPlusClient
  private readonly planeat: PlaneatChoiceClient
  private readonly cache = new Map<string, Restaurant>()
  private cacheLoaded = false
  private cachePromise: Promise<void> | null = null
  private readonly mealTimesCache = new Map<string, MealTime[]>()
  private readonly menusCache = new Map<string, Menu[]>()
  private readonly menuDetailCache = new Map<string, MenuComponent[]>()
  private readonly menuNutrientDetailCache = new Map<string, MenuComponent[]>()

  constructor() {
    this.welstory = new WelstoryPlusClient({
      username: WELSTORY_USERNAME,
      password: WELSTORY_PASSWORD
    })
    this.planeat = new PlaneatChoiceClient()
  }

  private getClient(vendor: Vendor): CafeteriaClient {
    return vendor === 'welstory' ? this.welstory : this.planeat
  }

  private async populateCache(): Promise<void> {
    const [welstoryResult, planeatResult] = await Promise.allSettled([
      this.welstory.getRestaurants(),
      this.planeat.getRestaurants()
    ])
    if (welstoryResult.status === 'fulfilled') {
      for (const r of welstoryResult.value) this.cache.set(r.id, r)
    }
    if (planeatResult.status === 'fulfilled') {
      for (const r of planeatResult.value) this.cache.set(r.id, r)
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
    const restaurant = this.cache.get(id)
    if (!restaurant) throw new Error(`Restaurant '${id}' not found`)
    return restaurant
  }

  private clone<T>(value: T): T {
    return structuredClone(value)
  }

  async getAllMealTimes(): Promise<MealTime[]> {
    await this.ensureCache()
    const byVendor = new Map<string, Restaurant>()
    for (const r of this.cache.values()) {
      if (!byVendor.has(r.vendor)) byVendor.set(r.vendor, r)
    }
    const results = await Promise.allSettled(
      [...byVendor.values()].map((r) => this.getMealTimes(r.id))
    )
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

  async getMealTimes(restaurantId: string): Promise<MealTime[]> {
    const key = `meal-times:${restaurantId}`
    const cached = this.mealTimesCache.get(key)
    if (cached) return this.clone(cached)

    const restaurant = await this.resolveRestaurant(restaurantId)
    const mealTimes = await this.getClient(restaurant.vendor).getMealTimes(restaurant)
    this.mealTimesCache.set(key, this.clone(mealTimes))
    return mealTimes
  }

  async getMenus(restaurantId: string, date: string, mealTimeId: string): Promise<Menu[]> {
    const key = `menus:${restaurantId}:${date}:${mealTimeId}`
    const cached = this.menusCache.get(key)
    if (cached) return this.clone(cached)

    const restaurant = await this.resolveRestaurant(restaurantId)
    const menus = await this.getClient(restaurant.vendor).getMenus(restaurant, date, mealTimeId)
    for (const menu of menus) {
      if (!menu.isTakeOut && (menu.nutrition?.calories ?? 0) > 2000) {
        menu.isTakeOut = true
      }
    }
    this.menusCache.set(key, this.clone(menus))
    return menus
  }

  async getMenuDetail(
    restaurantId: string,
    date: string,
    mealTimeId: string,
    hallNo: string,
    courseType: string
  ): Promise<MenuComponent[]> {
    const key = `detail:${restaurantId}:${date}:${mealTimeId}:${hallNo}:${courseType}`
    const cached = this.menuDetailCache.get(key)
    if (cached) return this.clone(cached)

    const restaurant = await this.resolveRestaurant(restaurantId)
    const client = this.getClient(restaurant.vendor)
    if (!client.getMenuDetail) {
      throw new Error(`Menu detail not supported for vendor '${restaurant.vendor}'`)
    }
    const detail = await client.getMenuDetail(restaurant, date, mealTimeId, hallNo, courseType)
    this.menuDetailCache.set(key, this.clone(detail))
    return detail
  }

  async getMenuNutrientDetail(
    restaurantId: string,
    date: string,
    mealTimeId: string,
    hallNo: string,
    courseType: string
  ): Promise<MenuComponent[]> {
    const key = `nutrient:${restaurantId}:${date}:${mealTimeId}:${hallNo}:${courseType}`
    const cached = this.menuNutrientDetailCache.get(key)
    if (cached) return this.clone(cached)

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
    this.menuNutrientDetailCache.set(key, this.clone(detail))
    return detail
  }

  getCacheStatus(): Record<string, number | boolean> {
    return {
      restaurantsLoaded: this.cacheLoaded,
      restaurants: this.cache.size,
      mealTimes: this.mealTimesCache.size,
      menus: this.menusCache.size,
      menuDetails: this.menuDetailCache.size,
      menuNutrientDetails: this.menuNutrientDetailCache.size
    }
  }

  clearCaches(): Record<string, number> {
    const cleared = {
      restaurants: this.cache.size,
      mealTimes: this.mealTimesCache.size,
      menus: this.menusCache.size,
      menuDetails: this.menuDetailCache.size,
      menuNutrientDetails: this.menuNutrientDetailCache.size
    }

    this.cache.clear()
    this.cacheLoaded = false
    this.cachePromise = null
    this.mealTimesCache.clear()
    this.menusCache.clear()
    this.menuDetailCache.clear()
    this.menuNutrientDetailCache.clear()

    return cleared
  }

  registerRestaurant(restaurant: Restaurant): void {
    if (!this.cache.has(restaurant.id)) {
      this.cache.set(restaurant.id, restaurant)
    }
  }

  async searchRestaurants(query: string): Promise<Restaurant[]> {
    await this.ensureCache()
    const q = query.toLowerCase()
    const fromCache = [...this.cache.values()].filter(
      (r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
    )
    const fromWelstory = await this.welstory.searchRestaurants(query).catch(() => [])
    const seen = new Set(fromCache.map((r) => r.id))
    return [...fromCache, ...fromWelstory.filter((r) => !seen.has(r.id))]
  }
}

export const service = new CafeteriaService()
