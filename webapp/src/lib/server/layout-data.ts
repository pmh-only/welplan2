import type { Cookies } from '@sveltejs/kit'
import { DEFAULT_RESTAURANTS } from '$lib/defaults'
import { service } from '$lib/server/service'
import type { Restaurant } from '$lib/types'

const COOKIE = 'welplan_restaurants'
const DEFAULT_RESTAURANTS_BY_ID = new Map(DEFAULT_RESTAURANTS.map((r) => [r.id, r]))

export async function loadLayoutData(cookies: Cookies) {
  const raw = cookies.get(COOKIE)
  const isFirstVisit = raw == null
  let restaurants: Restaurant[] = isFirstVisit ? [...DEFAULT_RESTAURANTS] : []
  if (raw) {
    try {
      restaurants = JSON.parse(decodeURIComponent(raw))
    } catch {}
  }

  restaurants = restaurants.map((restaurant) => {
    const defaultRestaurant = DEFAULT_RESTAURANTS_BY_ID.get(restaurant.id)
    return defaultRestaurant
      ? {
          ...restaurant,
          ...defaultRestaurant,
          path: restaurant.path ?? defaultRestaurant.path
        }
      : restaurant
  })

  restaurants = await service.hydrateRestaurants(restaurants).catch(() => restaurants)

  await Promise.all(restaurants.map((restaurant) => service.registerRestaurant(restaurant).catch(() => undefined)))

  const [mealTimes, notice] = await Promise.all([
    service.getMealTimesForRestaurants(restaurants).catch(() => []),
    service.getNoticeSettings().catch(() => undefined)
  ])

  return { restaurants, mealTimes, isFirstVisit, notice }
}
