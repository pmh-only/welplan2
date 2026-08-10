import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Cookies } from '@sveltejs/kit'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { menuReviewKey, menuReviewNormalizedName, type MenuReviewSummary } from '../menu-reviews.js'
import { db, ensureDbInitialized } from './db/index.js'
import { menuReviewIdentityLimits, menuReviews } from './db/schema.js'

const COOKIE_NAME = 'welplan-review-session'
const TOKEN_ISSUER = 'welplan'
const TOKEN_AUDIENCE = 'menu-review'
const TOKEN_LIFETIME_SECONDS = 365 * 24 * 60 * 60
const IDENTITY_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_IDENTITIES_PER_WINDOW = 3
const MAX_MENU_KEYS = 500

type TokenPayload = {
  sub: string
  iss: typeof TOKEN_ISSUER
  aud: typeof TOKEN_AUDIENCE
  iat: number
  exp: number
}

export class MenuReviewError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

function secret(): string {
  const value = process.env.REVIEW_JWT_SECRET?.trim()
  if (!value || value.length < 32) throw new MenuReviewError('리뷰 서비스 설정이 완료되지 않았습니다.', 503)
  return value
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

function signature(input: string): Buffer {
  return createHmac('sha256', secret()).update(input).digest()
}

export function issueReviewToken(sessionId = randomUUID(), now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000)
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    sub: sessionId,
    iss: TOKEN_ISSUER,
    aud: TOKEN_AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + TOKEN_LIFETIME_SECONDS
  } satisfies TokenPayload))
  const unsigned = `${header}.${payload}`
  return `${unsigned}.${base64url(signature(unsigned))}`
}

export function verifyReviewToken(token: string | undefined, now = Date.now()): TokenPayload | null {
  if (!token || token.length > 2048) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Record<string, unknown>
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null
    const expected = signature(`${parts[0]}.${parts[1]}`)
    const actual = Buffer.from(parts[2], 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Partial<TokenPayload>
    const nowSeconds = Math.floor(now / 1000)
    if (payload.iss !== TOKEN_ISSUER || payload.aud !== TOKEN_AUDIENCE ||
      typeof payload.sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.sub) ||
      typeof payload.iat !== 'number' || typeof payload.exp !== 'number' ||
      payload.iat > nowSeconds + 60 || payload.exp <= nowSeconds) return null
    return payload as TokenPayload
  } catch {
    return null
  }
}

function storageToken(request: Request): string | undefined {
  const value = request.headers.get('x-review-session')?.trim()
  return value || undefined
}

function setSessionCookie(cookies: Cookies, token: string, secure: boolean): void {
  cookies.set(COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: TOKEN_LIFETIME_SECONDS
  })
}

async function consumeIdentityLimit(address: string, now = Date.now()): Promise<boolean> {
  await ensureDbInitialized()
  const addressHash = createHmac('sha256', secret()).update(address).digest('hex')
  const windowStartedAt = now - IDENTITY_WINDOW_MS
  const rows = await db.insert(menuReviewIdentityLimits).values({
    addressHash,
    windowStartedAt: now,
    attempts: 1
  }).onConflictDoUpdate({
    target: menuReviewIdentityLimits.addressHash,
    set: {
      windowStartedAt: sql<number>`CASE WHEN ${menuReviewIdentityLimits.windowStartedAt} < ${windowStartedAt} THEN ${now} ELSE ${menuReviewIdentityLimits.windowStartedAt} END`,
      attempts: sql<number>`CASE WHEN ${menuReviewIdentityLimits.windowStartedAt} < ${windowStartedAt} THEN 1 ELSE ${menuReviewIdentityLimits.attempts} + 1 END`
    }
  }).returning({ attempts: menuReviewIdentityLimits.attempts })
  return (rows[0]?.attempts ?? MAX_IDENTITIES_PER_WINDOW + 1) <= MAX_IDENTITIES_PER_WINDOW
}

export function existingReviewIdentity(
  request: Request,
  cookies: Cookies,
  secure: boolean
): { sessionId: string; token: string } | null {
  const cookieToken = cookies.get(COOKIE_NAME)
  const cookiePayload = verifyReviewToken(cookieToken)
  if (cookiePayload && cookieToken) return { sessionId: cookiePayload.sub, token: cookieToken }

  const localToken = storageToken(request)
  const localPayload = verifyReviewToken(localToken)
  if (localPayload && localToken) {
    setSessionCookie(cookies, localToken, secure)
    return { sessionId: localPayload.sub, token: localToken }
  }

  return null
}

export async function reviewIdentity(
  request: Request,
  cookies: Cookies,
  clientAddress: string,
  secure: boolean
): Promise<{ sessionId: string; token: string }> {
  const existingIdentity = existingReviewIdentity(request, cookies, secure)
  if (existingIdentity) return existingIdentity

  if (!await consumeIdentityLimit(clientAddress)) {
    throw new MenuReviewError('새 리뷰 세션을 너무 많이 요청했습니다. 내일 다시 시도해 주세요.', 429)
  }
  const token = issueReviewToken()
  const payload = verifyReviewToken(token)
  if (!payload) throw new MenuReviewError('리뷰 세션을 만들지 못했습니다.', 500)
  setSessionCookie(cookies, token, secure)
  return { sessionId: payload.sub, token }
}

export function normalizeMenuKeys(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_MENU_KEYS) throw new MenuReviewError('메뉴 목록이 올바르지 않습니다.')
  const keys = [...new Set(value)]
  if (keys.some((key) => typeof key !== 'string' || key.length < 8 || key.length > 500 || menuReviewNormalizedName(key) === null)) {
    throw new MenuReviewError('메뉴 목록이 올바르지 않습니다.')
  }
  return keys as string[]
}

export async function reviewSummaries(menuKeys: string[], sessionId?: string): Promise<Record<string, MenuReviewSummary>> {
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
  const userRows = sessionId
    ? await db.select({
      menuKey: menuReviews.menuKey,
      rating: menuReviews.rating
    }).from(menuReviews).where(and(
      inArray(menuReviews.menuKey, menuKeys),
      eq(menuReviews.sessionId, sessionId)
    ))
    : []
  const aggregateByName = new Map(rows.map((row) => [row.normalizedName, row]))
  const userRatingByKey = new Map(userRows.map((row) => [row.menuKey, row.rating]))
  const summaries: Record<string, MenuReviewSummary> = {}

  for (const menuKey of menuKeys) {
    const aggregate = aggregateByName.get(normalizedNameByKey.get(menuKey)!)
    if (!aggregate) continue
    const userRating = userRatingByKey.get(menuKey)
    summaries[menuKey] = {
      average: aggregate.average,
      count: aggregate.count,
      ...(userRating == null ? {} : { userRating })
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

export async function createMenuReview(review: NewMenuReview, sessionId: string): Promise<MenuReviewSummary> {
  await ensureDbInitialized()
  const inserted = await db.insert(menuReviews).values({
    ...review,
    sessionId,
    createdAt: Date.now()
  }).onConflictDoNothing().returning({ menuKey: menuReviews.menuKey })
  if (inserted.length === 0) throw new MenuReviewError('이 메뉴에는 이미 별점을 남겼습니다.', 409)
  return (await reviewSummaries([review.menuKey], sessionId))[review.menuKey]
}

export function reviewRequestIsSameOrigin(request: Request, expectedOrigin: string): boolean {
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const origin = request.headers.get('origin')
  return contentType === 'application/json' && (!origin || origin === expectedOrigin)
}
