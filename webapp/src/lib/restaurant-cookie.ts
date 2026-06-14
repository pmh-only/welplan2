import type { Restaurant } from './types'

export const RESTAURANT_COOKIE = 'welplan_restaurants'
export const RESTAURANT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
export const RESTAURANT_STORAGE_KEY = 'welplan_restaurants'

function compactRestaurant(restaurant: Restaurant): Restaurant {
  return {
    id: restaurant.id,
    name: restaurant.name,
    vendor: restaurant.vendor
  }
}

function parseRestaurants(value: string): Restaurant[] {
  const parsed = JSON.parse(value) as unknown
  if (!Array.isArray(parsed)) return []

  return parsed.filter((restaurant): restaurant is Restaurant => {
    if (!restaurant || typeof restaurant !== 'object') return false
    const candidate = restaurant as Partial<Restaurant>
    return typeof candidate.id === 'string' &&
      candidate.id.length > 0 &&
      typeof candidate.name === 'string' &&
      candidate.name.length > 0 &&
      (candidate.vendor === 'welstory' || candidate.vendor === 'shinsegae') &&
      (candidate.path === undefined || (Array.isArray(candidate.path) && candidate.path.every((part) => typeof part === 'string')))
  })
}

export function encodeRestaurantCookie(restaurants: Restaurant[]): string {
  return encodeURIComponent(JSON.stringify(restaurants.map(compactRestaurant)))
}

export function decodeRestaurantCookie(raw: string | undefined): Restaurant[] {
  if (!raw) return []

  try {
    return parseRestaurants(raw)
  } catch {}

  try {
    return parseRestaurants(decodeURIComponent(raw))
  } catch {}

  return []
}

export function restaurantCookieString(restaurants: Restaurant[]): string {
  return `${RESTAURANT_COOKIE}=${encodeRestaurantCookie(restaurants)}; path=/; max-age=${RESTAURANT_COOKIE_MAX_AGE}; SameSite=Lax`
}

export function saveRestaurantSelection(restaurants: Restaurant[]): void {
  const encoded = encodeRestaurantCookie(restaurants)
  document.cookie = `${RESTAURANT_COOKIE}=${encoded}; path=/; max-age=${RESTAURANT_COOKIE_MAX_AGE}; SameSite=Lax`

  try {
    localStorage.setItem(RESTAURANT_STORAGE_KEY, encoded)
  } catch {}
}

export function readRestaurantSelectionFromClient(): Restaurant[] {
  const rawCookie = document.cookie.split('; ').find((cookie) => cookie.startsWith(`${RESTAURANT_COOKIE}=`))?.slice(RESTAURANT_COOKIE.length + 1)
  const cookieRestaurants = decodeRestaurantCookie(rawCookie)
  if (cookieRestaurants.length > 0) return cookieRestaurants

  try {
    return decodeRestaurantCookie(localStorage.getItem(RESTAURANT_STORAGE_KEY) ?? undefined)
  } catch {
    return []
  }
}

export function restoreRestaurantCookieFromStorage(): Restaurant[] {
  let storedRestaurants: Restaurant[] = []
  try {
    storedRestaurants = decodeRestaurantCookie(localStorage.getItem(RESTAURANT_STORAGE_KEY) ?? undefined)
  } catch {}

  if (storedRestaurants.length > 0) {
    document.cookie = restaurantCookieString(storedRestaurants)
  }

  return storedRestaurants
}
