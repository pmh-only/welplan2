import type { PageServerLoad } from './$types'
import { redirectToCurrentMenuRoute } from '$lib/server/menu-page'

export const load: PageServerLoad = async ({ parent }) => {
  await redirectToCurrentMenuRoute(parent, '/takein')
}
