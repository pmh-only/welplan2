import type { LayoutServerLoad } from './$types'
import { loadLayoutData } from '$lib/server/layout-data'

export const load: LayoutServerLoad = async ({ cookies }) => loadLayoutData(cookies)
