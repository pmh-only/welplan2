import type { Cookies } from '@sveltejs/kit'
import { service } from '$lib/server/service'
import type { Restaurant } from '$lib/types'

const COOKIE = 'welplan_restaurants'

function restaurantPathText(restaurant: Restaurant): string {
  return restaurant.path?.filter(Boolean).join('/') ?? ''
}

function restaurantKey(restaurant: Restaurant): string {
  return `${restaurant.vendor}:${restaurant.id}:${restaurant.name}:${restaurantPathText(restaurant)}`
}

function dedupeRestaurants(restaurants: Restaurant[]): Restaurant[] {
  const seen = new Set<string>()
  return restaurants.filter((restaurant) => {
    const key = restaurantKey(restaurant)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function loadLayoutData(cookies: Cookies) {
  const raw = cookies.get(COOKIE)
  const isFirstVisit = raw == null
  let restaurants: Restaurant[] = []
  if (raw) {
    try {
      restaurants = JSON.parse(decodeURIComponent(raw))
    } catch {}
  }

  restaurants = dedupeRestaurants(await service.hydrateRestaurants(restaurants).catch(() => restaurants))

  await Promise.all(restaurants.map((restaurant) => service.registerRestaurant(restaurant).catch(() => undefined)))

  const [mealTimes, notice] = await Promise.all([
    service.getMealTimesForRestaurants(restaurants).catch(() => []),
    service.getNoticeSettings().catch(() => undefined)
  ])

  return { restaurants, mealTimes, isFirstVisit, notice }
}
