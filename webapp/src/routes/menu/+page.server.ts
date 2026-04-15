import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { todayStr, autoSelectMealTime } from '$lib/utils'

export const load: PageServerLoad = async ({ parent }) => {
  const { mealTimes } = await parent()
  const date = todayStr()
  const mealTimeId = autoSelectMealTime(mealTimes) ?? mealTimes[0]?.id
  if (mealTimeId) redirect(302, `/menu/${date}/${mealTimeId}`)
  redirect(302, `/menu/${date}`)
}
