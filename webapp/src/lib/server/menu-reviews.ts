import { randomUUID } from 'node:crypto'
import { inArray, sql } from 'drizzle-orm'
import { menuReviewKey, menuReviewNormalizedName, type MenuReviewSummary } from '../menu-reviews.js'
import { db, ensureDbInitialized } from './db/index.js'
import { menuReviews } from './db/schema.js'

const MAX_MENU_KEYS = 500

export class MenuReviewError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export function normalizeMenuKeys(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_MENU_KEYS) throw new MenuReviewError('메뉴 목록이 올바르지 않습니다.')
  const keys = [...new Set(value)]
  if (keys.some((key) => typeof key !== 'string' || key.length < 8 || key.length > 500 || menuReviewNormalizedName(key) === null)) {
    throw new MenuReviewError('메뉴 목록이 올바르지 않습니다.')
  }
  return keys as string[]
}

export async function reviewSummaries(menuKeys: string[]): Promise<Record<string, MenuReviewSummary>> {
  if (menuKeys.length === 0) return {}
  await ensureDbInitialized()
  const normalizedNameByKey = new Map(menuKeys.map((menuKey) => [menuKey, menuReviewNormalizedName(menuKey)!]))
  const normalizedNames = [...new Set(normalizedNameByKey.values())]
  const normalizedName = sql<string>`normalize_menu_occurrence_name(${menuReviews.menuName})`
  const rows = await db.select({
    normalizedName,
    average: sql<number>`avg(${menuReviews.rating})::float`,
    count: sql<number>`count(*)::int`
  }).from(menuReviews).where(inArray(normalizedName, normalizedNames)).groupBy(normalizedName)
  const aggregateByName = new Map(rows.map((row) => [row.normalizedName, row]))
  const summaries: Record<string, MenuReviewSummary> = {}

  for (const menuKey of menuKeys) {
    const aggregate = aggregateByName.get(normalizedNameByKey.get(menuKey)!)
    if (!aggregate) continue
    summaries[menuKey] = {
      average: aggregate.average,
      count: aggregate.count
    }
  }
  return summaries
}

type NewMenuReview = {
  menuKey: string
  menuName: string
  menuDate: string
  mealTimeId: string
  rating: number
}

export function normalizeMenuReview(value: unknown): NewMenuReview {
  if (!value || typeof value !== 'object') throw new MenuReviewError('리뷰 요청이 올바르지 않습니다.')
  const input = value as Record<string, unknown>
  const menuKey = normalizeMenuKeys([input.menuKey])[0]
  const menuName = typeof input.menuName === 'string' ? input.menuName.normalize('NFKC').trim() : ''
  const menuDate = typeof input.menuDate === 'string' ? input.menuDate : ''
  const mealTimeId = typeof input.mealTimeId === 'string' ? input.mealTimeId.trim() : ''
  const rating = input.rating
  if (!menuName || menuName.length > 200 || !/^\d{8}$/.test(menuDate) || !mealTimeId || mealTimeId.length > 100 ||
    !Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5) {
    throw new MenuReviewError('리뷰 요청이 올바르지 않습니다.')
  }
  if (menuKey !== menuReviewKey({ name: menuName, date: menuDate, mealTimeId })) {
    throw new MenuReviewError('메뉴 식별자가 올바르지 않습니다.')
  }
  return { menuKey, menuName, menuDate, mealTimeId, rating: rating as number }
}

export async function createMenuReview(review: NewMenuReview): Promise<MenuReviewSummary> {
  await ensureDbInitialized()
  await db.insert(menuReviews).values({
    ...review,
    reviewId: randomUUID(),
    createdAt: Date.now()
  })
  return (await reviewSummaries([review.menuKey]))[review.menuKey]
}

export function reviewRequestIsSameOrigin(request: Request, expectedOrigin: string): boolean {
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const origin = request.headers.get('origin')
  return contentType === 'application/json' && (!origin || origin === expectedOrigin)
}
