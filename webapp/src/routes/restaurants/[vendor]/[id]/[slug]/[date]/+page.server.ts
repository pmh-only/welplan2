import { error, redirect } from '@sveltejs/kit'
import { restaurantDatedPath, restaurantDetailPath } from '$lib/restaurant-routes'
import { buildRestaurantPageDescription, loadGalleryMenusForRestaurantDate } from '$lib/server/menu-page'
import { resolveRestaurantForRoute } from '$lib/server/restaurant-resolver'
import { service } from '$lib/server/service'
import type { PageServerLoad } from './$types'

export const prerender = false

function isValidDateParam(date: string): boolean {
  return /^\d{8}$/.test(date)
}

export const load: PageServerLoad = async ({ params, parent, url }) => {
  const { restaurants } = await parent()
  if (!isValidDateParam(params.date)) {
    error(404, '날짜 형식이 올바르지 않습니다')
  }

  const restaurant = await resolveRestaurantForRoute(params, restaurants)

  if (!restaurant) {
    error(404, '식당을 찾을 수 없습니다')
  }

  const canonicalPath = restaurantDatedPath(restaurant, params.date)
  if (url.pathname !== canonicalPath) {
    redirect(308, canonicalPath)
  }

  const mealTimes = await service.getMealTimes(restaurant.id).catch(() => [])
  const { menus, mealTimeMenus } = await loadGalleryMenusForRestaurantDate(restaurant, mealTimes, params.date, {
    enrichNutrientDetails: restaurants.some((selected) => selected.id === restaurant.id)
  })
  const vendorLabel = restaurant.vendor === 'welstory' ? '삼성웰스토리' : '신세계푸드'

  return {
    restaurant,
    restaurants: [restaurant],
    mealTimes,
    mealTimeMenus,
    menus,
    date: params.date,
    routeMode: 'dated' as const,
    canonicalPath,
    detailPath: restaurantDetailPath(restaurant),
    pageDescription: buildRestaurantPageDescription(restaurant, vendorLabel)
  }
}
