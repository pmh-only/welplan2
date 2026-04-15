import type { PageServerLoad } from './$types'
import { loadTakeInMenusForRoute } from '$lib/server/menu-page'

export const load: PageServerLoad = async ({ params, parent }) => {
  return loadTakeInMenusForRoute(parent, params.date, params.time)
}
