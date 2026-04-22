import type { LayoutServerLoad } from './$types'
import { service } from '$lib/server/service'
import { DEFAULT_RESTAURANTS } from '$lib/defaults'
import type { Restaurant } from '$lib/types'

const COOKIE = 'welplan_restaurants'
const DEFAULT_RESTAURANTS_BY_ID = new Map(
  DEFAULT_RESTAURANTS.map((restaurant) => [restaurant.id, restaurant])
)

export const load: LayoutServerLoad = async ({ cookies }) => {
  let restaurants: Restaurant[] = [...DEFAULT_RESTAURANTS]
  const raw = cookies.get(COOKIE)
  const isFirstVisit = raw == null
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

  for (const r of restaurants) service.registerRestaurant(r)

  const mealTimes = await service.getMealTimesForRestaurants(restaurants).catch(() => [])

  return { restaurants, mealTimes, isFirstVisit }
}
