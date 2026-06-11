import type { Cookies } from '@sveltejs/kit'
import { service } from '$lib/server/service'
import type { Restaurant } from '$lib/types'
import { fallbackMealTime, todayStr } from '$lib/utils'

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

async function hasTakeOutMenus(restaurants: Restaurant[]): Promise<boolean> {
  if (restaurants.length === 0) return false

  const date = todayStr()
  for (const restaurant of restaurants) {
    const fetchedMealTimes = await service.getMealTimes(restaurant.id).catch(() => [])
    const mealTimes = fetchedMealTimes.length > 0 ? fetchedMealTimes : ['6', '1', '2', '3', '4', '5'].map(fallbackMealTime)
    for (const mealTime of mealTimes) {
      const menus = await service.getMenus(restaurant.id, date, mealTime.id).catch(() => [])
      if (menus.some((menu) => menu.isTakeOut)) return true
    }
  }

  return false
}

async function hasAnyGalleryMenuPictures(restaurants: Restaurant[]): Promise<boolean> {
  if (restaurants.length === 0) return false

  const date = todayStr()
  for (const restaurant of restaurants) {
    const fetchedMealTimes = await service.getMealTimes(restaurant.id).catch(() => [])
    const mealTimes = fetchedMealTimes.length > 0 ? fetchedMealTimes : ['6', '1', '2', '3', '4', '5'].map(fallbackMealTime)
    for (const mealTime of mealTimes) {
      const menus = await service.getMenus(restaurant.id, date, mealTime.id).catch(() => [])
      if (menus.some((menu) => menu.imageUrl)) return true
    }
  }

  return false
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

  const [mealTimes, notice, hasTakeOutMenu, hasGalleryMenuPictures] = await Promise.all([
    service.getMealTimesForRestaurants(restaurants).catch(() => []),
    service.getNoticeSettings().catch(() => undefined),
    hasTakeOutMenus(restaurants).catch(() => false),
    hasAnyGalleryMenuPictures(restaurants).catch(() => false)
  ])

  return { restaurants, mealTimes, isFirstVisit, notice, hasTakeOutMenu, hasGalleryMenuPictures }
}
