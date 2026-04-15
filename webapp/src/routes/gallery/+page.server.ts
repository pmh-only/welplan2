import type { PageServerLoad } from './$types'
import { service } from '$lib/server/service'
import { todayStr, autoSelectMealTime } from '$lib/utils'

export const load: PageServerLoad = async ({ parent, url }) => {
  const { restaurants, mealTimes } = await parent()

  const date = url.searchParams.get('date') ?? todayStr()
  const mealTimeId =
    url.searchParams.get('time') ?? autoSelectMealTime(mealTimes) ?? mealTimes[0]?.id
  if (!mealTimeId || !restaurants.length) return { menus: [], date, time: mealTimeId ?? '' }

  const menus = await Promise.all(
    restaurants.map((r) => service.getMenus(r.id, date, mealTimeId).catch(() => []))
  ).then((results) => results.flat())

  return { menus, date, time: mealTimeId }
}
