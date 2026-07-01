import type { RequestHandler } from './$types'
import { loadLayoutData } from '$lib/server/layout-data'
import {
  computeGalleryMenusForRestaurants,
  loadTakeInMenusForRoute,
  loadTakeOutMenusForRoute
} from '$lib/server/menu-page'
import { createService } from '$lib/server/service'
import { ALL_MEAL_TIME_ID, todayStr } from '$lib/utils'

type MenuKind = 'gallery' | 'takein' | 'takeout'

function isMenuKind(value: string | null): value is MenuKind {
  return value === 'gallery' || value === 'takein' || value === 'takeout'
}

function isValidDate(value: string): boolean {
  return /^\d{8}$/.test(value)
}

export const GET: RequestHandler = async ({ cookies, url }) => {
  const kind = url.searchParams.get('kind')
  if (!isMenuKind(kind)) {
    return Response.json({ error: 'Invalid menu kind' }, { status: 400 })
  }

  const date = url.searchParams.get('date') ?? todayStr()
  if (!isValidDate(date)) {
    return Response.json({ error: 'Invalid date' }, { status: 400 })
  }

  const time = url.searchParams.get('time') ?? ALL_MEAL_TIME_ID
  if (!time) {
    return Response.json({ error: 'Invalid meal time' }, { status: 400 })
  }

  const layoutData = await loadLayoutData(cookies)
  const menuService = createService({ allowRemoteFetch: true })

  await Promise.all(layoutData.restaurants.map((restaurant) => menuService.registerRestaurant(restaurant).catch(() => undefined)))

  const mealTimes = await menuService
    .getMealTimesForRestaurants(layoutData.restaurants)
    .catch(() => layoutData.mealTimes)
  const parentData = { ...layoutData, mealTimes }
  const parent = async () => parentData

  const data = kind === 'gallery'
    ? await computeGalleryMenusForRestaurants(layoutData.restaurants, mealTimes, date, time, menuService)
    : kind === 'takeout'
      ? await loadTakeOutMenusForRoute(parent, date, time, { service: menuService })
      : await loadTakeInMenusForRoute(parent, date, time, { service: menuService })

  return Response.json(
    { ...parentData, ...data },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
