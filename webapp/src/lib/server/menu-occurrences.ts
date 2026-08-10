import { and, between, inArray, sql } from 'drizzle-orm'
import { normalizeMenuOccurrenceName } from '../menu-occurrences.js'
import { shiftDate, todayStr } from '../utils.js'
import { db, ensureDbInitialized } from './db/index.js'
import { menuOccurrences } from './db/schema.js'

const RECENT_MENU_DAYS = 30

export async function recentMenuOccurrenceCounts(
  menuNames: string[],
  restaurantIds: string[],
  endDate = todayStr()
): Promise<Record<string, number>> {
  const normalizedNames = [...new Set(menuNames.map(normalizeMenuOccurrenceName).filter(Boolean))]
  const selectedRestaurantIds = [...new Set(restaurantIds.filter(Boolean))]
  const counts = Object.fromEntries(normalizedNames.map((name) => [name, 0]))
  if (normalizedNames.length === 0 || selectedRestaurantIds.length === 0) return counts

  await ensureDbInitialized()
  const startDate = shiftDate(endDate, -(RECENT_MENU_DAYS - 1))
  const rows = await db.select({
    normalizedName: menuOccurrences.normalizedName,
    count: sql<number>`count(*)::int`
  }).from(menuOccurrences).where(and(
    inArray(menuOccurrences.normalizedName, normalizedNames),
    inArray(menuOccurrences.restaurantId, selectedRestaurantIds),
    between(menuOccurrences.menuDate, startDate, endDate)
  )).groupBy(menuOccurrences.normalizedName)

  for (const row of rows) counts[row.normalizedName] = row.count
  return counts
}
