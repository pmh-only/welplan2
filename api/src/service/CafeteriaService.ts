import type { CafeteriaClient, MealTime, Menu, MenuComponent, Restaurant, Vendor } from '@welplan2/model'
import { WelstoryPlusClient } from '@welplan2/welstory-plus'
import { PlaneatChoiceClient } from '@welplan2/planeat-choice'

export class CafeteriaServiceError extends Error {
  constructor (
    message: string,
    public readonly statusCode: number = 500
  ) {
    super(message)
    this.name = 'CafeteriaServiceError'
  }
}

export class CafeteriaService {
  private readonly welstory: WelstoryPlusClient
  private readonly planeat: PlaneatChoiceClient

  // Restaurant cache: id → full Restaurant object (may be PcRestaurant under the hood)
  private readonly cache = new Map<string, Restaurant>()
  private cacheLoaded = false
  private cachePromise: Promise<void> | null = null

  constructor () {
    this.welstory = new WelstoryPlusClient()
    this.planeat = new PlaneatChoiceClient()
  }

  private getClient (vendor: Vendor): CafeteriaClient {
    return vendor === 'welstory' ? this.welstory : this.planeat
  }

  private async populateCache (): Promise<void> {
    // Fetch from both sources in parallel; a partial failure is tolerated
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

  private async ensureCache (): Promise<void> {
    if (this.cacheLoaded) return
    if (this.cachePromise) return this.cachePromise

    this.cachePromise = this.populateCache().finally(() => {
      this.cachePromise = null
    })
    return this.cachePromise
  }

  private async resolveRestaurant (id: string): Promise<Restaurant> {
    await this.ensureCache()
    const restaurant = this.cache.get(id)
    if (!restaurant) {
      throw new CafeteriaServiceError(`Restaurant '${id}' not found`, 404)
    }
    return restaurant
  }

  async getRestaurants (): Promise<Restaurant[]> {
    await this.ensureCache()
    return [...this.cache.values()]
  }

  // Returns unique meal times — calls one representative restaurant per vendor
  // (all restaurants of the same vendor return identical meal time sets)
  async getAllMealTimes (): Promise<MealTime[]> {
    await this.ensureCache()
    const restaurants = [...this.cache.values()]

    // Pick one representative per vendor to avoid hammering the same endpoint
    const byVendor = new Map<string, Restaurant>()
    for (const r of restaurants) {
      if (!byVendor.has(r.vendor)) byVendor.set(r.vendor, r)
    }

    const results = await Promise.allSettled(
      [...byVendor.values()].map((r) => this.getClient(r.vendor).getMealTimes(r))
    )

    const seen = new Set<string>()
    const merged: MealTime[] = []
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      for (const t of result.value) {
        if (!seen.has(t.id)) { seen.add(t.id); merged.push(t) }
      }
    }
    return merged
  }

  // Returns all menus across all registered restaurants for a given date + meal time
  async getAllMenus (date: string, mealTimeId: string): Promise<Menu[]> {
    await this.ensureCache()
    const restaurants = [...this.cache.values()]

    const results = await Promise.allSettled(
      restaurants.map((r) => this.getClient(r.vendor).getMenus(r, date, mealTimeId))
    )

    const menus: Menu[] = []
    for (const result of results) {
      if (result.status === 'fulfilled') menus.push(...result.value)
    }
    return menus
  }

  async getMealTimes (restaurantId: string): Promise<MealTime[]> {
    const restaurant = await this.resolveRestaurant(restaurantId)
    return this.getClient(restaurant.vendor).getMealTimes(restaurant)
  }

  async getMenus (restaurantId: string, date: string, mealTimeId: string): Promise<Menu[]> {
    const restaurant = await this.resolveRestaurant(restaurantId)
    return this.getClient(restaurant.vendor).getMenus(restaurant, date, mealTimeId)
  }

  async getMenuDetail (
    restaurantId: string,
    date: string,
    mealTimeId: string,
    hallNo: string,
    courseType: string
  ): Promise<MenuComponent[]> {
    const restaurant = await this.resolveRestaurant(restaurantId)
    const client = this.getClient(restaurant.vendor)

    if (!client.getMenuDetail) {
      throw new CafeteriaServiceError(
        `Menu detail is not supported for vendor '${restaurant.vendor}'`,
        501
      )
    }

    return client.getMenuDetail(restaurant, date, mealTimeId, hallNo, courseType)
  }

  // Search restaurants by name across all cached vendors
  async searchRestaurants (query: string): Promise<Restaurant[]> {
    await this.ensureCache()
    const q = query.toLowerCase()
    return [...this.cache.values()].filter((r) =>
      r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
    )
  }

  // Add a restaurant to the user's my-list then refresh cache
  async addRestaurant (restaurantId: string): Promise<void> {
    await this.welstory.addRestaurant(restaurantId)
    this.invalidateCache()
  }

  // Remove a restaurant from the user's my-list then refresh cache
  async removeRestaurant (restaurantId: string): Promise<void> {
    await this.welstory.removeRestaurant(restaurantId)
    this.invalidateCache()
  }

  // Invalidate the restaurant cache (e.g. after add/remove)
  invalidateCache (): void {
    this.cache.clear()
    this.cacheLoaded = false
  }
}
