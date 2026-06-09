import type { Cookies } from '@sveltejs/kit'
import { service } from '$lib/server/service'
import type { Restaurant } from '$lib/types'

const COOKIE = 'welplan_restaurants'

export async function loadLayoutData(cookies: Cookies) {
  const raw = cookies.get(COOKIE)
  const isFirstVisit = raw == null
  let restaurants: Restaurant[] = []
  if (raw) {
    try {
      restaurants = JSON.parse(decodeURIComponent(raw))
    } catch {}
  }

  restaurants = await service.hydrateRestaurants(restaurants).catch(() => restaurants)

  await Promise.all(restaurants.map((restaurant) => service.registerRestaurant(restaurant).catch(() => undefined)))

  const [mealTimes, notice] = await Promise.all([
    service.getMealTimesForRestaurants(restaurants).catch(() => []),
    service.getNoticeSettings().catch(() => undefined)
  ])

  return { restaurants, mealTimes, isFirstVisit, notice }
}
