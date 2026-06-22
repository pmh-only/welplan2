import type { RequestHandler } from './$types'
import { DEFAULT_RESTAURANTS } from '$lib/defaults'
import { createService } from '$lib/server/service'
import { mealTimesForRestaurant } from '$lib/server/menu-page'
import type { MealTime, Menu, Restaurant } from '$lib/types'
import { autoSelectMealTime, formatKoreanDate, todayStr } from '$lib/utils'

const MAX_WIDGET_RESTAURANTS = 4
const MAX_MENUS_PER_RESTAURANT = 4

type WidgetMenuItem = {
  name: string
  restaurantId?: string
  restaurantName?: string
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
  return menus.slice(0, MAX_MENUS_PER_RESTAURANT).map((menu) => ({
    name: menuName(menu),
    calories: menu.nutrition?.calories == null ? undefined : Math.round(menu.nutrition.calories)
  }))
}

function groupedWidgetMenus(snapshots: WidgetMenuSnapshot[]): WidgetMenuItem[] {
  return snapshots.slice(0, MAX_WIDGET_RESTAURANTS).flatMap((snapshot) =>
    snapshot.menus
      .slice(0, MAX_MENUS_PER_RESTAURANT)
      .map((menu) => ({
        name: menuName(menu),
        restaurantId: snapshot.restaurant.id,
        restaurantName: snapshot.restaurant.name,
        calories: menu.nutrition?.calories == null ? undefined : Math.round(menu.nutrition.calories)
      }))
  )
}

function requestedRestaurantIds(url: URL): string[] {
  return [...new Set(
    url.searchParams
      .getAll('restaurantId')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean)
  )]
}

function dedupeRestaurants(restaurants: Restaurant[]): Restaurant[] {
  const seen = new Set<string>()
  return restaurants.filter((restaurant) => {
    if (seen.has(restaurant.id)) return false
    seen.add(restaurant.id)
    return true
  })
}

async function selectableRestaurants(
  menuService: ReturnType<typeof createService>,
  ids: string[]
): Promise<Restaurant[]> {
  const defaults = await menuService.hydrateRestaurants(DEFAULT_RESTAURANTS).catch(() => DEFAULT_RESTAURANTS)
  if (ids.length === 0) return defaults

  const searchedRestaurants = await menuService.searchRestaurants('').catch(() => [])
  const known = dedupeRestaurants([
    ...defaults,
    ...searchedRestaurants
  ])
  const byId = new Map(known.map((restaurant) => [restaurant.id, restaurant]))
  return ids.flatMap((id) => {
    const restaurant = byId.get(id)
    return restaurant ? [restaurant] : []
  })
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
  const dateLabel = formatKoreanDate(date)
  const restaurantIds = requestedRestaurantIds(url)
  const requestedMealTimeId = url.searchParams.get('mealTimeId')

  const menuService = createService({ allowRemoteFetch: true })
  const restaurants = await selectableRestaurants(menuService, restaurantIds)
  const snapshots: WidgetMenuSnapshot[] = []

  for (const restaurant of restaurants) {
    const snapshot = await snapshotForRestaurant(menuService, restaurant, date, requestedMealTimeId)
    if (snapshot) snapshots.push(snapshot)
  }

  const visibleSnapshots = snapshots.filter((snapshot) => snapshot.menus.length > 0)
  const displaySnapshots = visibleSnapshots.length > 0 ? visibleSnapshots : snapshots

  if (displaySnapshots.length > 0) {
    const primarySnapshot = displaySnapshots[0]
    const multipleRestaurants = displaySnapshots.length > 1
    const mealTimeNames = [...new Set(displaySnapshots.map((snapshot) => snapshot.mealTime.name))]
    const openPath = `/takein/${date}/${primarySnapshot.mealTime.id}?${new URLSearchParams({ restaurant: primarySnapshot.restaurant.id })}`
    return Response.json(
      {
        title: multipleRestaurants ? `${displaySnapshots.length}개 식당 메뉴` : primarySnapshot.restaurant.name,
        subtitle: `${dateLabel} ${mealTimeNames.join(', ')}`,
        date,
        dateLabel,
        updatedAt: new Date().toISOString(),
        restaurant: primarySnapshot.restaurant,
        restaurants: displaySnapshots.map((snapshot) => snapshot.restaurant),
        mealTime: primarySnapshot.mealTime,
        mealTimes: displaySnapshots.map((snapshot) => snapshot.mealTime),
        menuCount: displaySnapshots.reduce((count, snapshot) => count + snapshot.menus.length, 0),
        menus: multipleRestaurants ? groupedWidgetMenus(displaySnapshots) : widgetMenus(primarySnapshot.menus),
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
      title: '오늘의 메뉴',
      subtitle: dateLabel,
      date,
      dateLabel,
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
