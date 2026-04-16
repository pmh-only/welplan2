import { randomUUID } from 'node:crypto'
import type {
  CafeteriaClient,
  MealTime,
  Menu,
  MenuComponent,
  Restaurant
} from '@pmh-only/welplan2-model'
import { AuthManager, WelstoryAuthError } from './AuthManager.js'
import type {
  WpApiResponse,
  WpDish,
  WpMealListWrapper,
  WpMealTime,
  WpMenuDetail,
  WpMenuNutrient,
  WpRestaurant
} from './types.js'
import {
  groupDishesToMenus,
  mapMealTime,
  mapMenuDetails,
  mapMenuNutrients,
  mapRestaurant,
  parseNum
} from './mapper.js'

export class WelstoryPlusError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'WelstoryPlusError'
  }
}

export interface WelstoryPlusClientOptions {
  username?: string
  password?: string
  deviceId?: string
  baseUrl?: string
}

// Unwraps { code, data: T } response envelope; falls through if data is the response itself
function unwrap<T>(raw: unknown): T {
  if (raw !== null && typeof raw === 'object' && 'data' in (raw as object)) {
    return (raw as WpApiResponse<T>).data
  }
  return raw as T
}

function looksLikeHtmlResponse(response: Response, text: string): boolean {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  return contentType.includes('text/html') || /^\s*(<!doctype html|<html[\s>])/i.test(text)
}

// Simple semaphore to serialize requests — Welstory returns empty body under concurrent load
class Semaphore {
  private queue: (() => void)[] = []
  private active = 0

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++
      return
    }
    return new Promise<void>((resolve) => this.queue.push(resolve))
  }

  release(): void {
    this.active--
    const next = this.queue.shift()
    if (next) {
      this.active++
      next()
    }
  }
}

export class WelstoryPlusClient implements CafeteriaClient {
  private readonly baseUrl: string
  private readonly auth: AuthManager
  private readonly sem = new Semaphore(1)

  constructor(options: WelstoryPlusClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://welplus.welstory.com'

    const username = options.username ?? process.env.WELSTORY_USERNAME ?? ''
    const password = options.password ?? process.env.WELSTORY_PASSWORD ?? ''
    const deviceId = options.deviceId ?? process.env.WELSTORY_DEVICE_ID ?? randomUUID()

    if (!username || !password) {
      throw new WelstoryPlusError(
        'Credentials required: set WELSTORY_USERNAME / WELSTORY_PASSWORD env vars or pass options.username / password'
      )
    }

    this.auth = new AuthManager({ username, password, deviceId, baseUrl: this.baseUrl })
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const buildHeaders = (token: string): Record<string, string> => ({
      'User-Agent': 'Welplus',
      'X-Device-Id': this.auth.deviceId,
      Authorization: token,
      ...(init.headers as Record<string, string> | undefined)
    })

    await this.sem.acquire()
    try {
      let lastError: unknown

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const token = attempt === 0 ? await this.auth.getToken() : await this.auth.forceLogin()

          const response = await fetch(`${this.baseUrl}${path}`, {
            ...init,
            headers: buildHeaders(token)
          })
          const text = await response.text()
          const shouldRelogin =
            response.status === 401 ||
            response.status === 403 ||
            (response.ok && looksLikeHtmlResponse(response, text))

          if (shouldRelogin) {
            const error = new WelstoryAuthError(
              response.status === 401 || response.status === 403
                ? `Auth failed: ${response.status} ${response.statusText}`
                : 'Auth failed: session expired',
              response.status === 401 || response.status === 403 ? response.status : undefined
            )
            lastError = error
            if (attempt === 0) continue
            throw error
          }

          if (!response.ok) {
            throw new WelstoryPlusError(
              `HTTP ${response.status}: ${response.statusText}`,
              response.status
            )
          }

          if (!text.trim()) throw new WelstoryPlusError('Empty response body')

          try {
            return JSON.parse(text) as T
          } catch {
            throw new WelstoryPlusError('Invalid JSON response')
          }
        } catch (error) {
          lastError = error
          if (attempt === 0 && error instanceof WelstoryAuthError) continue
          throw error
        }
      }

      throw lastError instanceof Error ? lastError : new WelstoryPlusError('Request failed')
    } finally {
      this.sem.release()
    }
  }

  // CafeteriaClient: returns selected restaurants (my-list)
  async getRestaurants(): Promise<Restaurant[]> {
    const raw = await this.request<unknown>('/api/mypage/rest-my-list')
    return unwrap<WpRestaurant[]>(raw).map(mapRestaurant)
  }

  async getMealTimes(restaurant: Restaurant): Promise<MealTime[]> {
    const raw = await this.request<unknown>('/api/menu/getMealTimeList', {
      headers: { Cookie: `cafeteriaActiveId=${restaurant.id}` }
    })
    return unwrap<WpMealTime[]>(raw).map(mapMealTime)
  }

  async getMenus(restaurant: Restaurant, date: string, mealTimeId: string): Promise<Menu[]> {
    const raw = await this.request<unknown>(
      `/api/meal?menuDt=${date}&menuMealType=${mealTimeId}&restaurantCode=${restaurant.id}`
    )
    const wrapper = unwrap<WpMealListWrapper>(raw)
    const dishes: WpDish[] = wrapper.mealList ?? []
    const menus = groupDishesToMenus(dishes, restaurant.id)

    // Enrich each menu with carbs/sugar/calcium from the detail endpoint (not in list response)
    await Promise.all(
      menus.map(async (menu) => {
        if (!menu.hallNo || !menu.courseType) return
        try {
          const rawDetail = await this.request<unknown>(
            `/api/meal/detail?menuDt=${date}&hallNo=${menu.hallNo}&menuCourseType=${menu.courseType}&menuMealType=${mealTimeId}&restaurantCode=${restaurant.id}`
          )
          const details = unwrap<WpMenuDetail[]>(rawDetail)
          if (details.length > 0) {
            const d = details[0]
            menu.nutrition = {
              ...menu.nutrition,
              carbohydrates: parseNum(d.totCho),
              sugar: parseNum(d.totSugar),
              calcium: parseNum(d.totCalcium)
            }
          }
        } catch {
          // detail failure is non-fatal
        }
      })
    )

    return menus
  }

  async getMenuDetail(
    restaurant: Restaurant,
    date: string,
    mealTimeId: string,
    hallNo: string,
    courseType: string
  ): Promise<MenuComponent[]> {
    const raw = await this.request<unknown>(
      `/api/meal/detail?menuDt=${date}&hallNo=${hallNo}&menuCourseType=${courseType}&menuMealType=${mealTimeId}&restaurantCode=${restaurant.id}`
    )
    const details = unwrap<WpMenuDetail[]>(raw)
    return mapMenuDetails(details)
  }

  async getMenuNutrientDetail(
    restaurant: Restaurant,
    date: string,
    mealTimeId: string,
    hallNo: string,
    courseType: string
  ): Promise<MenuComponent[]> {
    const raw = await this.request<unknown>(
      `/api/meal/detail/nutrient?menuDt=${date}&hallNo=${hallNo}&menuCourseType=${courseType}&menuMealType=${mealTimeId}&restaurantCode=${restaurant.id}`
    )
    const details = unwrap<WpMenuNutrient[]>(raw)
    return mapMenuNutrients(details)
  }

  // Welstory-specific methods (not in CafeteriaClient)

  async searchRestaurants(query: string): Promise<Restaurant[]> {
    const raw = await this.request<unknown>(
      `/api/mypage/rest-list?restaurantName=${encodeURIComponent(query)}`
    )
    return unwrap<WpRestaurant[]>(raw).map(mapRestaurant)
  }

  async addRestaurant(restaurantId: string): Promise<void> {
    await this.request('/api/mypage/rest-regi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          mainDiv: 'N',
          restaurantId,
          orderSeq: Math.floor(Math.random() * 10000)
        }
      ])
    })
  }

  async removeRestaurant(restaurantId: string): Promise<void> {
    await this.request('/api/mypage/rest-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ hcId: '', restaurantId }])
    })
  }
}
