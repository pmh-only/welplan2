import { redirect } from '@sveltejs/kit'
import { service } from '$lib/server/service'
import type { MealTime, Menu, MenuComponent, NutritionInfo, Restaurant } from '$lib/types'
import { ALL_MEAL_TIME_ID, autoSelectMealTime, todayStr } from '$lib/utils'

type ParentData = {
  restaurants: Restaurant[]
  mealTimes: MealTime[]
}

type ParentLoad = () => Promise<ParentData>

export type GalleryMealTimeResult = MealTime & {
  menuCount: number
  failed: boolean
  errorMessage?: string
}

function selectedMealTimes(mealTimes: MealTime[], time: string): MealTime[] {
  if (time === ALL_MEAL_TIME_ID) return mealTimes
  return mealTimes.filter((mealTime) => mealTime.id === time)
}

async function selectedRestaurantMealTimes(
  restaurant: Restaurant,
  fallbackMealTimes: MealTime[],
  time: string
): Promise<MealTime[]> {
  if (restaurant.vendor === 'shinsegae' && time === ALL_MEAL_TIME_ID) {
    return [{ id: '6', name: '전체' }]
  }

  const mealTimes = await service.getMealTimes(restaurant.id).catch(() => fallbackMealTimes)
  return selectedMealTimes(mealTimes, time)
}

function displayMealTimeId(mealTimes: MealTime[], mealTime: MealTime): string {
  if (!mealTime.type) return mealTime.id
  return mealTimes.find((candidate) => candidate.type === mealTime.type)?.id ?? mealTime.id
}

function tagMenusWithDisplayMealTime(
  menus: Menu[],
  mealTimes: MealTime[],
  restaurant: Restaurant,
  mealTime: MealTime
): Menu[] {
  if (restaurant.vendor === 'welstory') return menus
  const mealTimeId = displayMealTimeId(mealTimes, mealTime)
  if (mealTimeId === mealTime.id) return menus
  return menus.map((menu) => ({ ...menu, mealTimeId }))
}

export async function loadMenusForRoute(parent: ParentLoad, date: string, time: string) {
  const { restaurants, mealTimes } = await parent()
  const menus = await Promise.all(
    restaurants.map(async (restaurant) => {
      const targetMealTimes = await selectedRestaurantMealTimes(restaurant, mealTimes, time)
      return Promise.all(
        targetMealTimes.map((mealTime) =>
          service
            .getMenus(restaurant.id, date, mealTime.id)
            .then((menus) => tagMenusWithDisplayMealTime(menus, mealTimes, restaurant, mealTime))
            .catch(() => [])
        )
      ).then((results) => results.flat())
    })
  ).then((results) => results.flat())

  return { menus, date, time }
}

export async function loadGalleryMenusForRoute(parent: ParentLoad, url: URL) {
  const { restaurants, mealTimes } = await parent()

  const date = url.searchParams.get('date') ?? todayStr()
  const mealTimeId = url.searchParams.get('time') ?? ALL_MEAL_TIME_ID
  if (!mealTimeId || !restaurants.length) return { menus: [], date, time: mealTimeId ?? '' }

  const rawMenus = await Promise.all(
    restaurants.map(async (restaurant) => {
      const targetMealTimes = await selectedRestaurantMealTimes(restaurant, mealTimes, mealTimeId)
      return Promise.all(
        targetMealTimes.map((mealTime) =>
          service
            .getMenus(restaurant.id, date, mealTime.id)
            .then((menus) => tagMenusWithDisplayMealTime(menus, mealTimes, restaurant, mealTime))
            .catch(() => [])
        )
      ).then((results) => results.flat())
    })
  ).then((results) => results.flat())

  const menus = await enrichGalleryMenus(rawMenus, date)

  return { menus, date, time: mealTimeId }
}

export async function loadGalleryMenusForRestaurant(
  restaurant: Restaurant,
  mealTimes: MealTime[],
  url: URL
) {
  const date = url.searchParams.get('date') ?? todayStr()
  const mealTimeId = url.searchParams.get('time') ?? ALL_MEAL_TIME_ID
  if (!mealTimeId) return { menus: [], date, time: '' }
  const targetMealTimes = selectedMealTimes(mealTimes, mealTimeId)
  if (!targetMealTimes.length) return { menus: [], date, time: mealTimeId }

  const rawMenus = await Promise.all(
    targetMealTimes.map((mealTime) =>
      service.getMenus(restaurant.id, date, mealTime.id).catch(() => [])
    )
  ).then((results) => results.flat())
  const menus = await enrichGalleryMenus(rawMenus, date)

  return { menus, date, time: mealTimeId }
}

export async function loadGalleryMenusForRestaurantDate(
  restaurant: Restaurant,
  mealTimes: MealTime[],
  date: string,
  options: { enrichNutrientDetails?: boolean } = {}
) {
  const mealTimeResults = await Promise.all(
    mealTimes.map(async (mealTime): Promise<{ menus: Menu[], mealTime: GalleryMealTimeResult }> => {
      try {
        const rawMenus = await service.getMenus(restaurant.id, date, mealTime.id)
        const enrichedMenus = options.enrichNutrientDetails === false
          ? rawMenus
          : await enrichGalleryMenus(rawMenus, date)
        const menus = await flattenTakeOutMenus(enrichedMenus.map(normalizeHighCalorieTakeOut), date)

        return {
          menus,
          mealTime: {
            ...mealTime,
            menuCount: menus.length,
            failed: false
          }
        }
      } catch (error) {
        return {
          menus: [],
          mealTime: {
            ...mealTime,
            menuCount: 0,
            failed: true,
            errorMessage: error instanceof Error ? error.message : 'Unknown menu loading error'
          }
        }
      }
    })
  )

  return {
    menus: mealTimeResults.flatMap((result) => result.menus),
    date,
    mealTimeMenus: mealTimeResults.map((result) => result.mealTime)
  }
}

async function enrichGalleryMenus(menus: Menu[], date: string): Promise<Menu[]> {
  return Promise.all(
    menus.map(async (menu) => {
      if (
        !(
          menu.vendor === 'welstory' &&
          !menu.isTakeOut &&
          menu.hallNo &&
          menu.courseType &&
          menu.imageUrl
        )
      ) {
        return menu
      }
      try {
        const detail = await service.getMenuNutrientDetail(
          menu.restaurantId,
          date,
          menu.mealTimeId,
          menu.hallNo,
          menu.courseType
        )
        return { ...menu, components: detail }
      } catch {
        return menu
      }
    })
  )
}

function sumNutrition(components: MenuComponent[]): NutritionInfo | undefined {
  const withNutrition = components.filter((component) => component.nutrition)
  if (withNutrition.length === 0) return undefined

  return withNutrition.reduce<NutritionInfo>(
    (totals, component) => ({
      calories: (totals.calories ?? 0) + (component.nutrition?.calories ?? 0),
      carbohydrates: (totals.carbohydrates ?? 0) + (component.nutrition?.carbohydrates ?? 0),
      sugar: (totals.sugar ?? 0) + (component.nutrition?.sugar ?? 0),
      fiber: (totals.fiber ?? 0) + (component.nutrition?.fiber ?? 0),
      fat: (totals.fat ?? 0) + (component.nutrition?.fat ?? 0),
      protein: (totals.protein ?? 0) + (component.nutrition?.protein ?? 0),
      sodium: (totals.sodium ?? 0) + (component.nutrition?.sodium ?? 0),
      cholesterol: (totals.cholesterol ?? 0) + (component.nutrition?.cholesterol ?? 0),
      transFat: (totals.transFat ?? 0) + (component.nutrition?.transFat ?? 0),
      saturatedFat: (totals.saturatedFat ?? 0) + (component.nutrition?.saturatedFat ?? 0),
      calcium: (totals.calcium ?? 0) + (component.nutrition?.calcium ?? 0)
    }),
    {}
  )
}

function normalizeMenuName(name: string): string {
  return name.replace(/\s*포장$/, '').trim()
}

function normalizeHighCalorieTakeOut(menu: Menu): Menu {
  if (menu.isTakeOut || (menu.nutrition?.calories ?? 0) <= 3000) return menu
  return { ...menu, isTakeOut: true }
}

function hasZeroNutrition(nutrition?: NutritionInfo): boolean {
  if (!nutrition) return true
  return (
    (nutrition.calories ?? 0) === 0 &&
    (nutrition.carbohydrates ?? 0) === 0 &&
    (nutrition.sugar ?? 0) === 0 &&
    (nutrition.fiber ?? 0) === 0 &&
    (nutrition.fat ?? 0) === 0 &&
    (nutrition.protein ?? 0) === 0 &&
    (nutrition.sodium ?? 0) === 0 &&
    (nutrition.cholesterol ?? 0) === 0 &&
    (nutrition.transFat ?? 0) === 0 &&
    (nutrition.saturatedFat ?? 0) === 0 &&
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
    parentName: menu.name,
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
  const menus = await flattenTakeOutMenus(data.menus, date)

  return { ...data, menus }
}

async function flattenTakeOutMenus(menus: Menu[], date: string): Promise<Menu[]> {
  return Promise.all(
    menus.map(async (menu) => {
      if (!(menu.vendor === 'welstory' && menu.isTakeOut && menu.hallNo && menu.courseType)) {
        return [menu]
      }

      try {
        const detail = await service.getMenuNutrientDetail(
          menu.restaurantId,
          date,
          menu.mealTimeId,
          menu.hallNo,
          menu.courseType
        )
        return flattenTakeOutMenuItems(menu, detail)
      } catch {
        return [menu]
      }
    })
  ).then((results) => results.flat())
}

export async function loadTakeInMenusForRoute(parent: ParentLoad, date: string, time: string) {
  const data = await loadMenusForRoute(parent, date, time)

  const menus = await Promise.all(
    data.menus.map(async (menu) => {
      if (!(menu.vendor === 'welstory' && !menu.isTakeOut && menu.hallNo && menu.courseType)) {
        return menu
      }

      try {
        const detail = await service.getMenuNutrientDetail(
          menu.restaurantId,
          date,
          menu.mealTimeId,
          menu.hallNo,
          menu.courseType
        )
        return {
          ...menu,
          components: detail,
          nutrition: sumNutrition(detail) ?? menu.nutrition
        }
      } catch {
        return menu
      }
    })
  )

  return { ...data, menus }
}

export async function redirectToCurrentMenuRoute(
  parent: ParentLoad,
  basePath: '/takein' | '/takeout'
) {
  const { mealTimes } = await parent()
  const date = todayStr()
  const mealTimeId =
    basePath === '/takeout'
      ? autoSelectMealTime(mealTimes) ?? mealTimes[0]?.id
      : ALL_MEAL_TIME_ID

  if (mealTimeId) redirect(302, `${basePath}/${date}/${mealTimeId}`)
  redirect(302, '/restaurants')
}

export function buildRestaurantPageDescription(
  restaurant: Restaurant,
  vendorLabel: string
): string {
  if (restaurant.vendor === 'welstory') {
    return `${vendorLabel} ${restaurant.name} 식단표를 Welplan에서 조회하세요. 웰스토리 식단 조회, 메뉴 사진, 날짜별 식단표, 칼로리와 영양정보를 한눈에 확인할 수 있습니다.`
  }

  return `${vendorLabel} ${restaurant.name} 식단표를 Welplan에서 조회하세요. 신세계푸드 메뉴 조회, 날짜별 식단표, 메뉴 사진과 영양정보를 한눈에 확인할 수 있습니다.`
}
