import type { Menu } from './types.js'
import { normalizeMenuOccurrenceName } from './menu-occurrences.js'

export type MenuReviewSummary = {
  average: number
  count: number
  userRating?: number
}

export function menuReviewKey(menu: Pick<Menu, 'date' | 'mealTimeId' | 'name'>): string {
  const normalizedName = menu.name.normalize('NFKC').trim().toLocaleLowerCase('ko')
  return `v1:${menu.date}:${encodeURIComponent(menu.mealTimeId)}:${encodeURIComponent(normalizedName)}`
}

export function menuReviewNormalizedName(menuKey: string): string | null {
  const match = /^v1:\d{8}:([^:]+):(.+)$/.exec(menuKey)
  if (!match) return null

  try {
    if (!decodeURIComponent(match[1]).trim()) return null
    const menuName = decodeURIComponent(match[2])
    return menuName ? normalizeMenuOccurrenceName(menuName) : null
  } catch {
    return null
  }
}
