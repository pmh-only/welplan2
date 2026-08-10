import type { Menu } from './types.js'

export type MenuReviewSummary = {
  average: number
  count: number
  userRating?: number
}

export function menuReviewKey(menu: Pick<Menu, 'date' | 'mealTimeId' | 'name'>): string {
  const normalizedName = menu.name.normalize('NFKC').trim().toLocaleLowerCase('ko')
  return `v1:${menu.date}:${encodeURIComponent(menu.mealTimeId)}:${encodeURIComponent(normalizedName)}`
}
