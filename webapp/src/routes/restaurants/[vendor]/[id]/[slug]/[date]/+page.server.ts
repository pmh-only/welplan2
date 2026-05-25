import { error, redirect } from '@sveltejs/kit'
import { restaurantDatedPath, restaurantDetailPath } from '$lib/restaurant-routes'
import { loadGalleryMenusForRestaurantDate } from '$lib/server/menu-page'
import { service } from '$lib/server/service'
import type { PageServerLoad } from './$types'

export const prerender = false

function isValidDateParam(date: string): boolean {
  return /^\d{8}$/.test(date)
}

export const load: PageServerLoad = async ({ params, url }) => {
  if (!isValidDateParam(params.date)) {
    error(404, '날짜 형식이 올바르지 않습니다')
  }

  const restaurant = await service.getRestaurant(params.id)

  if (!restaurant || restaurant.vendor !== params.vendor) {
    error(404, '식당을 찾을 수 없습니다')
  }

  const canonicalPath = restaurantDatedPath(restaurant, params.date)
  if (url.pathname !== canonicalPath) {
    redirect(308, canonicalPath)
  }

  const mealTimes = await service.getMealTimes(restaurant.id).catch(() => [])
  const { menus, mealTimeMenus } = await loadGalleryMenusForRestaurantDate(restaurant, mealTimes, params.date)

  return {
    restaurant,
    restaurants: [restaurant],
    mealTimes,
    mealTimeMenus,
    menus,
    date: params.date,
    routeMode: 'dated' as const,
    canonicalPath,
    detailPath: restaurantDetailPath(restaurant)
  }
}
