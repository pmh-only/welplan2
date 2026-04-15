import { redirect } from '@sveltejs/kit'
import { service } from '$lib/server/service'
import type { MealTime, Menu, MenuComponent, NutritionInfo, Restaurant } from '$lib/types'
import { todayStr, autoSelectMealTime } from '$lib/utils'

type ParentData = {
  restaurants: Restaurant[]
  mealTimes: MealTime[]
}

type ParentLoad = () => Promise<ParentData>

export async function loadMenusForRoute(parent: ParentLoad, date: string, time: string) {
  const { restaurants } = await parent()

  const menus = await Promise.all(
    restaurants.map((restaurant) => service.getMenus(restaurant.id, date, time).catch(() => []))
  ).then((results) => results.flat())

  return { menus, date, time }
}

function normalizeMenuName(name: string): string {
  return name.replace(/\s*포장$/, '').trim()
}

function hasZeroNutrition(nutrition?: NutritionInfo): boolean {
  if (!nutrition) return true
  return (
    (nutrition.calories ?? 0) === 0 &&
    (nutrition.carbohydrates ?? 0) === 0 &&
    (nutrition.sugar ?? 0) === 0 &&
    (nutrition.fat ?? 0) === 0 &&
    (nutrition.protein ?? 0) === 0 &&
    (nutrition.sodium ?? 0) === 0 &&
    (nutrition.calcium ?? 0) === 0
  )
}

function flattenTakeOutMenuItems(menu: Menu, detail: MenuComponent[]): Menu[] {
  const normalizedMenuName = normalizeMenuName(menu.name)
  const items = detail.filter(
    (item) =>
      normalizeMenuName(item.name) !== normalizedMenuName || !hasZeroNutrition(item.nutrition)
  )
  const rows = items.length > 0 ? items : detail

  return rows.map((item, index) => ({
    id: `${menu.id}:${index}`,
    name: item.name,
    date: menu.date,
    mealTimeId: menu.mealTimeId,
    restaurantId: menu.restaurantId,
    vendor: menu.vendor,
    components: [],
    nutrition: item.nutrition,
    isTakeOut: menu.isTakeOut
  }))
}

export async function loadTakeOutMenusForRoute(parent: ParentLoad, date: string, time: string) {
  const data = await loadMenusForRoute(parent, date, time)

  const menus = await Promise.all(
    data.menus.map(async (menu) => {
      if (!(menu.vendor === 'welstory' && menu.isTakeOut && menu.hallNo && menu.courseType))
        return [menu]

      try {
        const detail = await service.getMenuNutrientDetail(
          menu.restaurantId,
          date,
          time,
          menu.hallNo,
          menu.courseType
        )
        return flattenTakeOutMenuItems(menu, detail)
      } catch {
        return [menu]
      }
    })
  ).then((results) => results.flat())

  return { ...data, menus }
}

export async function redirectToCurrentMenuRoute(
  parent: ParentLoad,
  basePath: '/takein' | '/takeout'
) {
  const { mealTimes } = await parent()
  const date = todayStr()
  const mealTimeId = autoSelectMealTime(mealTimes) ?? mealTimes[0]?.id

  if (mealTimeId) redirect(302, `${basePath}/${date}/${mealTimeId}`)
  redirect(302, '/restaurants')
}
