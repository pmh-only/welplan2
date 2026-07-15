import { error, redirect } from '@sveltejs/kit'
import { restaurantDatedPath, restaurantDetailPath } from '$lib/restaurant-routes'
import {
  buildRestaurantPageDescription,
  loadGalleryMenusForRestaurantDate,
  mealTimesForRestaurant,
  refreshGalleryMenusForRestaurantDate
} from '$lib/server/menu-page'
import { resolveRestaurantForRoute } from '$lib/server/restaurant-resolver'
import { createService, service as cachedService } from '$lib/server/service'
import { todayStr } from '$lib/utils'
import type { PageServerLoad } from './$types'

export const prerender = false

function dateFromSearch(url: URL): string {
  const date = url.searchParams.get('date')
  return date && /^\d{8}$/.test(date) ? date : todayStr()
}

export const load: PageServerLoad = async ({ params, parent, url }) => {
  const { restaurants } = await parent()
  const restaurant = await resolveRestaurantForRoute(params, restaurants)

  if (!restaurant) {
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

  const menuService = createService({ allowRemoteFetch: true })
  await menuService.registerRestaurant(restaurant).catch(() => undefined)

  const mealTimes = mealTimesForRestaurant(
    restaurant,
    await cachedService.getMealTimes(restaurant.id).catch(() => [])
  )
  const enrichNutrientDetails = restaurants.some((selected) => selected.id === restaurant.id)
  const cachedGallery = await loadGalleryMenusForRestaurantDate(restaurant, mealTimes, date, {
    enrichNutrientDetails
  })
  const refreshedGallery = refreshGalleryMenusForRestaurantDate(
    restaurant,
    mealTimes,
    date,
    { enrichNutrientDetails, service: menuService }
  )
    .catch(() => cachedGallery)
  const galleryData = cachedGallery.menus.length > 0 ? cachedGallery : refreshedGallery
  const vendorLabel = restaurant.vendor === 'welstory' ? '삼성웰스토리' : '신세계푸드'

  return {
    restaurant,
    restaurants: [restaurant],
    mealTimes: cachedGallery.mealTimes ?? mealTimes,
    mealTimeMenus: cachedGallery.mealTimeMenus,
    menus: cachedGallery.menus,
    galleryData,
    date,
    routeMode: 'plural' as const,
    canonicalPath: restaurantDatedPath(restaurant, date),
    detailPath,
    pageDescription: buildRestaurantPageDescription(restaurant, vendorLabel)
  }
}
