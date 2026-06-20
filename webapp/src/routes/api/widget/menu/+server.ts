import type { RequestHandler } from './$types'
import { DEFAULT_RESTAURANTS } from '$lib/defaults'
import { createService } from '$lib/server/service'
import { mealTimesForRestaurant } from '$lib/server/menu-page'
import type { MealTime, Menu, Restaurant } from '$lib/types'
import { autoSelectMealTime, formatKoreanDate, todayStr } from '$lib/utils'

const MAX_WIDGET_MENUS = 6

type WidgetMenuItem = {
  name: string
  calories?: number
}

type WidgetMenuSnapshot = {
  restaurant: Restaurant
  mealTime: MealTime
  menus: Menu[]
}

function isValidDate(value: string | null): value is string {
  return value != null && /^\d{8}$/.test(value)
}

function menuName(menu: Menu): string {
  return menu.parentName ? `${menu.parentName} - ${menu.name}` : menu.name
}

function widgetMenus(menus: Menu[]): WidgetMenuItem[] {
  return menus.slice(0, MAX_WIDGET_MENUS).map((menu) => ({
    name: menuName(menu),
    calories: menu.nutrition?.calories == null ? undefined : Math.round(menu.nutrition.calories)
  }))
}

async function snapshotForRestaurant(
  menuService: ReturnType<typeof createService>,
  restaurant: Restaurant,
  date: string,
  requestedMealTimeId: string | null
): Promise<WidgetMenuSnapshot | null> {
  await menuService.registerRestaurant(restaurant).catch(() => undefined)

  const mealTimes = mealTimesForRestaurant(
    restaurant,
    await menuService.getMealTimes(restaurant.id).catch(() => [])
  )
  if (mealTimes.length === 0) return null

  const requestedMealTime = requestedMealTimeId
    ? mealTimes.find((mealTime) => mealTime.id === requestedMealTimeId)
    : undefined
  const selectedMealTime = requestedMealTime ?? mealTimes.find((mealTime) => mealTime.id === autoSelectMealTime(mealTimes))
  const candidateMealTimes = [
    selectedMealTime ?? mealTimes[0],
    ...mealTimes.filter((mealTime) => mealTime.id !== (selectedMealTime ?? mealTimes[0]).id)
  ]

  for (const mealTime of candidateMealTimes) {
    const menus = await menuService.getMenus(restaurant.id, date, mealTime.id).catch(() => [])
    const takeInMenus = menus.filter((menu) => !menu.isTakeOut)
    const visibleMenus = takeInMenus.length > 0 ? takeInMenus : menus
    if (visibleMenus.length > 0 || requestedMealTime) {
      return { restaurant, mealTime, menus: visibleMenus }
    }
  }

  return { restaurant, mealTime: candidateMealTimes[0], menus: [] }
}

export const GET: RequestHandler = async ({ url }) => {
  const date = isValidDate(url.searchParams.get('date')) ? url.searchParams.get('date')! : todayStr()
  const requestedRestaurantId = url.searchParams.get('restaurantId')
  const requestedMealTimeId = url.searchParams.get('mealTimeId')

  const menuService = createService({ allowRemoteFetch: true })
  const restaurants = await menuService.hydrateRestaurants(DEFAULT_RESTAURANTS).catch(() => DEFAULT_RESTAURANTS)
  const candidates = requestedRestaurantId
    ? restaurants.filter((restaurant) => restaurant.id === requestedRestaurantId)
    : restaurants

  for (const restaurant of candidates.length > 0 ? candidates : restaurants) {
    const snapshot = await snapshotForRestaurant(menuService, restaurant, date, requestedMealTimeId)
    if (!snapshot) continue

    const openPath = `/takein/${date}/${snapshot.mealTime.id}?${new URLSearchParams({ restaurant: snapshot.restaurant.id })}`
    return Response.json(
      {
        date,
        dateLabel: formatKoreanDate(date),
        updatedAt: new Date().toISOString(),
        restaurant: snapshot.restaurant,
        mealTime: snapshot.mealTime,
        menuCount: snapshot.menus.length,
        menus: widgetMenus(snapshot.menus),
        openUrl: new URL(openPath, url.origin).toString()
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800'
        }
      }
    )
  }

  return Response.json(
    {
      date,
      dateLabel: formatKoreanDate(date),
      updatedAt: new Date().toISOString(),
      restaurant: null,
      mealTime: null,
      menuCount: 0,
      menus: [],
      openUrl: new URL('/takein', url.origin).toString()
    },
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800' } }
  )
}
