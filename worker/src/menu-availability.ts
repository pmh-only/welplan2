import type { Restaurant } from '@pmh-only/welplan2-model'
import { shiftDate, todayStr } from './utils.js'
import type { CafeteriaService } from '../../webapp/src/lib/server/service.js'

export const MENU_SCAN_DAYS = 7

export type RestaurantMealScanResult = {
  restaurant: Restaurant
  datesWithMenus: string[]
  mealTimeCount: number
  fetchedBatchCount: number
  errorCount: number
}

type ScanOptions = {
  afterBatch?: () => void | Promise<void>
}

export function menuScanDates(startDate = todayStr(), days = MENU_SCAN_DAYS): string[] {
  return Array.from({ length: days }, (_, index) => shiftDate(startDate, index))
}

export async function scanRestaurantMealInfo(
  service: CafeteriaService,
  restaurant: Restaurant,
  dates = menuScanDates(),
  options: ScanOptions = {}
): Promise<RestaurantMealScanResult> {
  const datesWithMenus = new Set<string>()
  let fetchedBatchCount = 0
  let errorCount = 0

  const mealTimes = await service.getMealTimes(restaurant.id).catch(() => {
    errorCount++
    return []
  })

  for (const date of dates) {
    for (const mealTime of mealTimes) {
      try {
        const menus = await service.getMenus(restaurant.id, date, mealTime.id)
        fetchedBatchCount++
        if (menus.length > 0) datesWithMenus.add(date)
      } catch {
        errorCount++
      }
      await options.afterBatch?.()
    }
  }

  return {
    restaurant,
    datesWithMenus: [...datesWithMenus],
    mealTimeCount: mealTimes.length,
    fetchedBatchCount,
    errorCount
  }
}
