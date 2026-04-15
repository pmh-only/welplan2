import type { PageServerLoad } from './$types'
import { service } from '$lib/server/service'
import { todayStr, autoSelectMealTime } from '$lib/utils'

export const load: PageServerLoad = async ({ parent }) => {
  const { restaurants, mealTimes } = await parent()
  const date = todayStr()
  const mealTimeId = autoSelectMealTime(mealTimes) ?? mealTimes[0]?.id

  if (!mealTimeId || !restaurants.length) return { menus: [], date, time: mealTimeId ?? '' }

  const menus = await Promise.all(
    restaurants.map((restaurant) =>
      service.getMenus(restaurant.id, date, mealTimeId).catch(() => [])
    )
  ).then((results) => results.flat())

  return { menus, date, time: mealTimeId }
}
