import type { PageServerLoad } from './$types'
import { loadMenusForRoute } from '$lib/server/menu-page'

export const load: PageServerLoad = async ({ params, parent }) => {
  return loadMenusForRoute(parent, params.date, params.time)
}
