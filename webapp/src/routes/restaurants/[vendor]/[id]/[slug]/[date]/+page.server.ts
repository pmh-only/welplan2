import { error, redirect } from '@sveltejs/kit'
import { restaurantDatedPath, restaurantDetailPath } from '$lib/restaurant-routes'
import {
  buildRestaurantPageDescription,
  loadGalleryMenusForRestaurantDate,
  mealTimesForRestaurant,
  refreshGalleryMenusForRestaurantDate
} from '$lib/server/menu-page'
import { resolveRestaurantForRoute } from '$lib/server/restaurant-resolver'
import { isIndexableRestaurant } from '$lib/restaurant-indexing'
import { createService, service as cachedService } from '$lib/server/service'
import type { PageServerLoad } from './$types'

export const prerender = false

function isValidDateParam(date: string): boolean {
  return /^\d{8}$/.test(date)
}

function isBrowserHtmlRequest(request: Request): boolean {
  const accept = request.headers.get('accept') ?? ''
  return accept.includes('text/html') && !accept.includes('application/json')
}

export const load: PageServerLoad = async ({ params, parent, request, url }) => {
  const { restaurants } = await parent()
  if (!isValidDateParam(params.date)) {
    error(404, '날짜 형식이 올바르지 않습니다')
  }

  const restaurant = await resolveRestaurantForRoute(params, restaurants)

  if (!restaurant) {
    error(404, '식당을 찾을 수 없습니다')
  }

  if (isBrowserHtmlRequest(request)) {
    redirect(302, restaurantDetailPath(restaurant))
  }

  const canonicalPath = restaurantDatedPath(restaurant, params.date)
  if (url.pathname !== canonicalPath) {
    redirect(308, canonicalPath)
  }

  const menuService = createService({ allowRemoteFetch: true })
  await menuService.registerRestaurant(restaurant).catch(() => undefined)

  const mealTimes = mealTimesForRestaurant(
    restaurant,
    await cachedService.getMealTimes(restaurant.id).catch(() => [])
  )
  const enrichNutrientDetails = restaurants.some((selected) => selected.id === restaurant.id)
  const cachedGallery = await loadGalleryMenusForRestaurantDate(restaurant, mealTimes, params.date, {
    enrichNutrientDetails
  })
  const refreshedGallery = refreshGalleryMenusForRestaurantDate(
    restaurant,
    mealTimes,
    params.date,
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
    date: params.date,
    routeMode: 'dated' as const,
    canonicalPath,
    detailPath: restaurantDetailPath(restaurant),
    indexable: isIndexableRestaurant(restaurant),
    pageDescription: buildRestaurantPageDescription(restaurant, vendorLabel, params.date)
  }
}
