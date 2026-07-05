import { shiftDate, todayStr } from '$lib/utils'

const MENU_SCAN_DAYS = 7

export function menuScanDates(startDate = todayStr(), days = MENU_SCAN_DAYS): string[] {
  return Array.from({ length: days }, (_, index) => shiftDate(startDate, index))
}
