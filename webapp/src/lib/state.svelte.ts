import { browser } from '$app/environment'
import type { Menu, MealTime, Restaurant, PScoreWeights } from './types'
import { todayStr, autoSelectMealTime } from './utils'

const LS_RESTAURANTS = 'welplan_restaurants'
const LS_PSCORE = 'welplan_pscore'

export const DEFAULT_WEIGHTS: PScoreWeights = {
  cal: 0.1,
  carb: 0.8,
  sugar: 2.0,
  fat: 1.5,
  protein: 0.5
}

export const DEFAULT_RESTAURANTS: Restaurant[] = [
  { id: 'REST000007', name: 'R5 B1F', vendor: 'welstory' },
  { id: 'REST000008', name: 'R5 B2F', vendor: 'welstory' },
  { id: 'REST000003', name: 'R4 레인보우(B1F)', vendor: 'welstory' },
  { id: 'REST000005', name: 'R4 오아시스(B1F)', vendor: 'welstory' },
  { id: 'REST000013', name: 'R3 하모니(B1F)', vendor: 'welstory' }
]

class AppState {
  // ─── Persisted ────────────────────────────────────────────
  restaurants = $state<Restaurant[]>([])
  pWeights = $state<PScoreWeights>({ ...DEFAULT_WEIGHTS })

  // ─── Menu state (shared between pages) ────────────────────
  date = $state(todayStr())
  selectedMealTimeId = $state<string | null>(null)
  allMealTimes = $state<MealTime[]>([])
  menus = $state<Menu[]>([])
  loadingMealTimes = $state(false)
  loadingMenus = $state(false)

  // ─── Derived ──────────────────────────────────────────────
  get myIds (): Set<string> {
    return new Set(this.restaurants.map((r) => r.id))
  }

  restaurantName (id: string): string {
    return this.restaurants.find((r) => r.id === id)?.name ?? id
  }

  // ─── localStorage ─────────────────────────────────────────
  loadFromStorage (): void {
    if (!browser) return
    try {
      const s = localStorage.getItem(LS_RESTAURANTS)
      this.restaurants = s ? JSON.parse(s) : [...DEFAULT_RESTAURANTS]
    } catch {
      this.restaurants = [...DEFAULT_RESTAURANTS]
    }
    try {
      const s = localStorage.getItem(LS_PSCORE)
      if (s) this.pWeights = { ...DEFAULT_WEIGHTS, ...JSON.parse(s) }
    } catch {}
  }

  addRestaurant (r: Restaurant): void {
    if (!this.myIds.has(r.id)) {
      this.restaurants = [...this.restaurants, r]
      this._saveRestaurants()
    }
  }

  removeRestaurant (r: Restaurant): void {
    this.restaurants = this.restaurants.filter((x) => x.id !== r.id)
    this._saveRestaurants()
  }

  private _saveRestaurants (): void {
    if (!browser) return
    try { localStorage.setItem(LS_RESTAURANTS, JSON.stringify(this.restaurants)) } catch {}
  }

  savePWeights (): void {
    if (!browser) return
    try { localStorage.setItem(LS_PSCORE, JSON.stringify(this.pWeights)) } catch {}
  }

  resetWeights (): void {
    this.pWeights = { ...DEFAULT_WEIGHTS }
    this.savePWeights()
  }

  // ─── Fetch meal times ─────────────────────────────────────
  async fetchMealTimes (): Promise<void> {
    if (!this.restaurants.length) {
      this.allMealTimes = []
      this.selectedMealTimeId = null
      return
    }
    this.loadingMealTimes = true
    try {
      const times: MealTime[] = await fetch('/api/meal-times').then((r) => r.json())
      this.allMealTimes = times
      if (!this.selectedMealTimeId || !times.some((t) => t.id === this.selectedMealTimeId)) {
        this.selectedMealTimeId = autoSelectMealTime(times)
      }
    } catch {
      this.allMealTimes = []
    } finally {
      this.loadingMealTimes = false
    }
  }

  // ─── Fetch menus ──────────────────────────────────────────
  async fetchMenus (): Promise<void> {
    if (!this.restaurants.length || !this.selectedMealTimeId) {
      this.menus = []
      return
    }
    this.loadingMenus = true
    try {
      const params = new URLSearchParams({
        date: this.date,
        mealTimeId: this.selectedMealTimeId
      })
      for (const r of this.restaurants) params.append('id', r.id)
      const all: Menu[] = await fetch(`/api/menus?${params}`).then((r) => r.json())
      this.menus = all
    } catch {
      this.menus = []
    } finally {
      this.loadingMenus = false
    }
  }
}

export const app = new AppState()
