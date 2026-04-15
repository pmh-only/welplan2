import type { PageServerLoad } from './$types'
import { loadTakeOutMenusForRoute } from '$lib/server/menu-page'

export const load: PageServerLoad = async ({ params, parent }) => {
  return loadTakeOutMenusForRoute(parent, params.date, params.time)
}
