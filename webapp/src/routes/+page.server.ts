import type { PageServerLoad } from './$types'
import { loadGalleryMenusForRoute } from '$lib/server/menu-page'

export const load: PageServerLoad = async ({ parent, url }) => loadGalleryMenusForRoute(parent, url)
