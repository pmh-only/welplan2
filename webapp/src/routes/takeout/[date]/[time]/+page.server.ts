import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { loadTakeOutMenusForRoute } from '$lib/server/menu-page'
import { ALL_MEAL_TIME_ID, autoSelectMealTime } from '$lib/utils'

export const load: PageServerLoad = async ({ params, parent }) => {
  if (params.time === ALL_MEAL_TIME_ID) {
    const { mealTimes } = await parent()
    const mealTimeId = autoSelectMealTime(mealTimes) ?? mealTimes[0]?.id
    if (mealTimeId) redirect(302, `/takeout/${params.date}/${mealTimeId}`)
  }

  return loadTakeOutMenusForRoute(parent, params.date, params.time)
}
