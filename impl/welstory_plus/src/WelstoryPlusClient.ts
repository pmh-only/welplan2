import { randomUUID } from 'node:crypto'
import type {
  CafeteriaClient,
  MealTime,
  Menu,
  MenuComponent,
  Restaurant
} from '@pmh-only/welplan2-model'
import { AuthManager, WelstoryAuthError, type AuthManagerOptions } from './AuthManager.js'
import { createLogger } from './log.js'
import { welstoryFetch } from './proxy.js'
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
  isValidWelstoryRestaurantId
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

class WelstoryEmptyResponseError extends WelstoryPlusError {
  constructor() {
    super('Empty response body')
    this.name = 'WelstoryEmptyResponseError'
  }
}

const trafficLog = createLogger('traffic')
const authLog = createLogger('auth')
const DEFAULT_REQUEST_MAX_ATTEMPTS = 4
const DEFAULT_REQUEST_RETRY_DELAY_MS = 250
const EMPTY_RESPONSES_BEFORE_RELOGIN = 3
const processDeviceId = process.env.WELSTORY_DEVICE_ID ?? randomUUID()

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

type SharedSession = {
  auth: AuthManager
  sem: Semaphore
}

const sharedSessions = new Map<string, SharedSession>()

function getSharedSession(options: AuthManagerOptions): SharedSession {
  const key = JSON.stringify([options.baseUrl, options.username, options.password, options.deviceId])
  const existing = sharedSessions.get(key)
  if (existing) return existing

  const session = {
    auth: new AuthManager(options),
    sem: new Semaphore(1)
  }
  sharedSessions.set(key, session)
  return session
}

function positiveIntegerEnv(name: string, fallback: number, maximum: number): number {
  const parsed = Number(process.env[name])
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback
}

function waitBeforeRetry(attempt: number): Promise<void> {
  const baseDelayMs = positiveIntegerEnv(
    'WELSTORY_REQUEST_RETRY_DELAY_MS',
    DEFAULT_REQUEST_RETRY_DELAY_MS,
    30_000
  )
  return new Promise((resolve) => setTimeout(resolve, Math.min(baseDelayMs * attempt, 30_000)))
}

function restaurantIdForRequest(restaurant: Restaurant): string {
  if (!isValidWelstoryRestaurantId(restaurant.id)) {
    throw new WelstoryPlusError(`Invalid Welstory restaurant ID '${restaurant.id}'`)
  }
  return restaurant.id.toUpperCase()
}

function mapValidRestaurants(raw: WpRestaurant[]): Restaurant[] {
  const restaurants = raw.map(mapRestaurant)
  const valid = restaurants.filter((restaurant) => isValidWelstoryRestaurantId(restaurant.id))
  if (valid.length !== restaurants.length) {
    trafficLog.warn('invalid restaurant IDs discarded', {
      restaurantCount: restaurants.length,
      discardedCount: restaurants.length - valid.length
    })
  }
  return valid
}

export class WelstoryPlusClient implements CafeteriaClient {
  private readonly baseUrl: string
  private readonly auth: AuthManager
  private readonly sem: Semaphore

  constructor(options: WelstoryPlusClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://welplus.welstory.com'

    const username = options.username ?? process.env.WELSTORY_USERNAME ?? ''
    const password = options.password ?? process.env.WELSTORY_PASSWORD ?? ''
    const deviceId = options.deviceId ?? processDeviceId

    if (!username || !password) {
      throw new WelstoryPlusError(
        'Credentials required: set WELSTORY_USERNAME / WELSTORY_PASSWORD env vars or pass options.username / password'
      )
    }

    const session = getSharedSession({ username, password, deviceId, baseUrl: this.baseUrl })
    this.auth = session.auth
    this.sem = session.sem
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
      let forceLogin = false
      let emptyResponseCount = 0
      const maxAttempts = positiveIntegerEnv(
        'WELSTORY_REQUEST_MAX_ATTEMPTS',
        DEFAULT_REQUEST_MAX_ATTEMPTS,
        10
      )

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const startedAt = Date.now()
        const method = init.method ?? 'GET'
        const attemptNo = attempt + 1
        const requestBodyBytes = typeof init.body === 'string' ? init.body.length : undefined

        try {
          const token = forceLogin ? await this.auth.forceLogin() : await this.auth.getToken()
          forceLogin = false

          trafficLog.info('outbound request started', {
            vendor: 'welstory',
            method,
            path,
            attempt: attemptNo,
            requestBodyBytes
          })

          const response = await welstoryFetch(`${this.baseUrl}${path}`, {
            ...init,
            headers: buildHeaders(token)
          })
          const text = await response.text()

          trafficLog.info('outbound request completed', {
            vendor: 'welstory',
            method,
            path,
            attempt: attemptNo,
            status: response.status,
            ok: response.ok,
            durationMs: Date.now() - startedAt,
            responseBytes: text.length
          })

          const isAuthStatus = response.status === 401 || response.status === 403
          const isHtmlSessionResponse = response.ok && looksLikeHtmlResponse(response, text)
          const shouldRelogin = isAuthStatus || isHtmlSessionResponse

          if (shouldRelogin) {
            authLog.warn('request requires new login', {
              path,
              attempt: attemptNo,
              status: response.status,
              durationMs: Date.now() - startedAt,
              reason:
                isAuthStatus
                  ? 'auth_status'
                  : 'html_session_response'
            })
            throw new WelstoryAuthError(
              isAuthStatus
                ? `Auth failed: ${response.status} ${response.statusText}`
                : 'Auth failed: session expired',
              isAuthStatus ? response.status : undefined
            )
          }

          if (!response.ok) {
            throw new WelstoryPlusError(
              `HTTP ${response.status}: ${response.statusText}`,
              response.status
            )
          }

          if (!text.trim()) throw new WelstoryEmptyResponseError()

          try {
            return JSON.parse(text) as T
          } catch {
            throw new WelstoryPlusError('Invalid JSON response')
          }
        } catch (error) {
          lastError = error
          trafficLog.warn('outbound request failed', {
            vendor: 'welstory',
            method,
            path,
            attempt: attemptNo,
            durationMs: Date.now() - startedAt,
            error
          })
          const retryable = error instanceof WelstoryAuthError || error instanceof WelstoryEmptyResponseError
          if (!retryable || attemptNo >= maxAttempts) throw error
          if (error instanceof WelstoryAuthError) {
            forceLogin = true
          } else {
            emptyResponseCount++
            forceLogin = emptyResponseCount >= EMPTY_RESPONSES_BEFORE_RELOGIN
          }
          await waitBeforeRetry(attemptNo)
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
    return mapValidRestaurants(unwrap<WpRestaurant[]>(raw))
  }

  async getMealTimes(restaurant: Restaurant): Promise<MealTime[]> {
    const restaurantId = restaurantIdForRequest(restaurant)
    const raw = await this.request<unknown>('/api/menu/getMealTimeList', {
      headers: { Cookie: `cafeteriaActiveId=${restaurantId}` }
    })
    return unwrap<WpMealTime[]>(raw).map(mapMealTime)
  }

  async getMenus(restaurant: Restaurant, date: string, mealTimeId: string): Promise<Menu[]> {
    const restaurantId = restaurantIdForRequest(restaurant)
    const raw = await this.request<unknown>(
      `/api/meal?menuDt=${encodeURIComponent(date)}&menuMealType=${encodeURIComponent(mealTimeId)}&restaurantCode=${encodeURIComponent(restaurantId)}`
    )
    const wrapper = unwrap<WpMealListWrapper>(raw)
    if (wrapper === null || typeof wrapper !== 'object' || !Array.isArray(wrapper.mealList)) {
      throw new WelstoryPlusError('Invalid menu response')
    }
    const dishes: WpDish[] = wrapper.mealList
    const menus = groupDishesToMenus(dishes, restaurantId)

    return menus
  }

  async getMenuDetail(
    restaurant: Restaurant,
    date: string,
    mealTimeId: string,
    hallNo: string,
    courseType: string
  ): Promise<MenuComponent[]> {
    const restaurantId = restaurantIdForRequest(restaurant)
    const raw = await this.request<unknown>(
      `/api/meal/detail?menuDt=${encodeURIComponent(date)}&hallNo=${encodeURIComponent(hallNo)}&menuCourseType=${encodeURIComponent(courseType)}&menuMealType=${encodeURIComponent(mealTimeId)}&restaurantCode=${encodeURIComponent(restaurantId)}`
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
    const restaurantId = restaurantIdForRequest(restaurant)
    const raw = await this.request<unknown>(
      `/api/meal/detail/nutrient?menuDt=${encodeURIComponent(date)}&hallNo=${encodeURIComponent(hallNo)}&menuCourseType=${encodeURIComponent(courseType)}&menuMealType=${encodeURIComponent(mealTimeId)}&restaurantCode=${encodeURIComponent(restaurantId)}`
    )
    const details = unwrap<WpMenuNutrient[]>(raw)
    return mapMenuNutrients(details)
  }

  // Welstory-specific methods (not in CafeteriaClient)

  async searchRestaurants(query: string): Promise<Restaurant[]> {
    const raw = await this.request<unknown>(
      `/api/mypage/rest-list?restaurantName=${encodeURIComponent(query)}`
    )
    return mapValidRestaurants(unwrap<WpRestaurant[]>(raw))
  }

  async addRestaurant(restaurantId: string): Promise<void> {
    if (!isValidWelstoryRestaurantId(restaurantId)) {
      throw new WelstoryPlusError(`Invalid Welstory restaurant ID '${restaurantId}'`)
    }
    await this.request('/api/mypage/rest-regi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          mainDiv: 'N',
          restaurantId: restaurantId.toUpperCase(),
          orderSeq: Math.floor(Math.random() * 10000)
        }
      ])
    })
  }

  async removeRestaurant(restaurantId: string): Promise<void> {
    if (!isValidWelstoryRestaurantId(restaurantId)) {
      throw new WelstoryPlusError(`Invalid Welstory restaurant ID '${restaurantId}'`)
    }
    await this.request('/api/mypage/rest-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ hcId: '', restaurantId: restaurantId.toUpperCase() }])
    })
  }
}
