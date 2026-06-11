import type { PageServerLoad } from './$types'
import { loadGalleryMenusForRoute, loadTakeInMenusForRoute } from '$lib/server/menu-page'
import { ALL_MEAL_TIME_ID, todayStr } from '$lib/utils'

export const load: PageServerLoad = async ({ parent, url }) => {
  const layoutData = await parent()
  const parentFromLayout = async () => layoutData

  if (layoutData.hasGalleryMenuPictures !== true) {
    const date = url.searchParams.get('date') ?? todayStr()
    const time = url.searchParams.get('time') ?? ALL_MEAL_TIME_ID
    return { ...await loadTakeInMenusForRoute(parentFromLayout, date, time), rootMode: 'takein' as const }
  }

  return { ...await loadGalleryMenusForRoute(parentFromLayout, url), rootMode: 'gallery' as const }
}
