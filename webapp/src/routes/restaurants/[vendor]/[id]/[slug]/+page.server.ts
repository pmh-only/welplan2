import { error, redirect } from '@sveltejs/kit'
import { restaurantDatedPath, restaurantDetailPath } from '$lib/restaurant-routes'
import { buildRestaurantPageDescription, loadGalleryMenusForRestaurantDate } from '$lib/server/menu-page'
import { service } from '$lib/server/service'
import { todayStr } from '$lib/utils'
import type { PageServerLoad } from './$types'

export const prerender = false

function dateFromSearch(url: URL): string {
  const date = url.searchParams.get('date')
  return date && /^\d{8}$/.test(date) ? date : todayStr()
}

export const load: PageServerLoad = async ({ params, url }) => {
  const restaurant = await service.getRestaurant(params.id)

  if (!restaurant || restaurant.vendor !== params.vendor) {
    error(404, '식당을 찾을 수 없습니다')
  }

  const date = dateFromSearch(url)
  const detailPath = restaurantDetailPath(restaurant)
  if (url.pathname !== detailPath) {
    const search = url.searchParams.get('date') && /^\d{8}$/.test(url.searchParams.get('date') ?? '')
      ? `?date=${url.searchParams.get('date')}`
      : ''
    redirect(308, `${detailPath}${search}`)
  }

  const mealTimes = await service.getMealTimes(restaurant.id).catch(() => [])
  const { menus, mealTimeMenus } = await loadGalleryMenusForRestaurantDate(restaurant, mealTimes, date)
  const vendorLabel = restaurant.vendor === 'welstory' ? '삼성웰스토리' : '신세계푸드'

  return {
    restaurant,
    restaurants: [restaurant],
    mealTimes,
    mealTimeMenus,
    menus,
    date,
    routeMode: 'plural' as const,
    canonicalPath: restaurantDatedPath(restaurant, date),
    detailPath,
    pageDescription: buildRestaurantPageDescription(restaurant, vendorLabel, menus, mealTimes)
  }
}
