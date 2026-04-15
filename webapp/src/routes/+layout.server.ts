import type { LayoutServerLoad } from './$types'
import { service } from '$lib/server/service'
import { DEFAULT_RESTAURANTS } from '$lib/defaults'
import type { Restaurant } from '$lib/types'

const COOKIE = 'welplan_restaurants'

export const load: LayoutServerLoad = async ({ cookies }) => {
  let restaurants: Restaurant[] = [...DEFAULT_RESTAURANTS]
  const raw = cookies.get(COOKIE)
  if (raw) {
    try { restaurants = JSON.parse(decodeURIComponent(raw)) } catch {}
  }

  for (const r of restaurants) service.registerRestaurant(r)

  const mealTimes = await service.getAllMealTimes().catch(() => [])

  return { restaurants, mealTimes }
}
