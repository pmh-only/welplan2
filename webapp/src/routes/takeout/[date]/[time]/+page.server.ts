import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { loadTakeOutMenusForRoute } from '$lib/server/menu-page'
import { ALL_MEAL_TIME_ID, autoSelectMealTime, fallbackMealTime } from '$lib/utils'

export const load: PageServerLoad = async ({ params, parent }) => {
  if (params.time === ALL_MEAL_TIME_ID) {
    const { restaurants, mealTimes } = await parent()
    const routeMealTimes = mealTimes.length > 0
      ? mealTimes
      : restaurants.some((restaurant) => restaurant.vendor === 'shinsegae')
        ? ['6', '1', '2', '3', '4', '5'].map(fallbackMealTime)
        : mealTimes
    const mealTimeId = autoSelectMealTime(routeMealTimes) ?? routeMealTimes[0]?.id
    if (mealTimeId) redirect(302, `/takeout/${params.date}/${mealTimeId}`)
  }

  return loadTakeOutMenusForRoute(parent, params.date, params.time)
}
