import type { CafeteriaClient, MealTime, Menu, MenuComponent, Restaurant, Vendor } from '@welplan2/model'
import { WelstoryPlusClient } from '@welplan2/welstory-plus'
import { PlaneatChoiceClient } from '@welplan2/planeat-choice'
import { WELSTORY_USERNAME, WELSTORY_PASSWORD } from '$env/static/private'

class CafeteriaService {
  private readonly welstory: WelstoryPlusClient
  private readonly planeat: PlaneatChoiceClient
  private readonly cache = new Map<string, Restaurant>()
  private cacheLoaded = false
  private cachePromise: Promise<void> | null = null

  constructor () {
    this.welstory = new WelstoryPlusClient({ username: WELSTORY_USERNAME, password: WELSTORY_PASSWORD })
    this.planeat = new PlaneatChoiceClient()
  }

  private getClient (vendor: Vendor): CafeteriaClient {
    return vendor === 'welstory' ? this.welstory : this.planeat
  }

  private async populateCache (): Promise<void> {
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
    this.cachePromise = this.populateCache().finally(() => { this.cachePromise = null })
    return this.cachePromise
  }

  private async resolveRestaurant (id: string): Promise<Restaurant> {
    await this.ensureCache()
    const restaurant = this.cache.get(id)
    if (!restaurant) throw new Error(`Restaurant '${id}' not found`)
    return restaurant
  }

  async getAllMealTimes (): Promise<MealTime[]> {
    await this.ensureCache()
    const byVendor = new Map<string, Restaurant>()
    for (const r of this.cache.values()) {
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
      throw new Error(`Menu detail not supported for vendor '${restaurant.vendor}'`)
    }
    return client.getMenuDetail(restaurant, date, mealTimeId, hallNo, courseType)
  }

  async searchRestaurants (query: string): Promise<Restaurant[]> {
    return this.welstory.searchRestaurants(query)
  }
}

export const service = new CafeteriaService()
