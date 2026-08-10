import assert from 'node:assert/strict'
import test from 'node:test'
import { menuReviewKey, menuReviewNormalizedName } from '../menu-reviews.js'
import {
  existingReviewIdentity,
  issueReviewToken,
  MenuReviewError,
  normalizeMenuReview,
  verifyReviewToken
} from './menu-reviews.js'

const originalSecret = process.env.REVIEW_JWT_SECRET
process.env.REVIEW_JWT_SECRET = 'test-review-secret-that-is-at-least-32-characters-long'

test.after(() => {
  if (originalSecret === undefined) delete process.env.REVIEW_JWT_SECRET
  else process.env.REVIEW_JWT_SECRET = originalSecret
})

test('issues and verifies a bounded review identity token', () => {
  const now = Date.parse('2026-08-10T00:00:00Z')
  const sessionId = '3f153a7f-32f0-44f2-8ca7-69ba38c86adb'
  const token = issueReviewToken(sessionId, now)

  assert.equal(verifyReviewToken(token, now)?.sub, sessionId)
  assert.equal(verifyReviewToken(`${token.slice(0, -1)}x`, now), null)
  assert.equal(verifyReviewToken(token, now + 366 * 24 * 60 * 60 * 1000), null)
})

test('does not issue an identity while reading public review summaries', () => {
  const cookies = {
    get: () => undefined,
    set: () => assert.fail('summary reads must not set a review cookie')
  } as unknown as Parameters<typeof existingReviewIdentity>[1]

  assert.equal(existingReviewIdentity(new Request('https://welplan.example/gallery'), cookies, true), null)
})

test('normalizes a review only when its menu key matches its metadata', () => {
  const menu = { name: '  비빔밥  ', date: '20260810', mealTimeId: '2' }
  const menuKey = menuReviewKey(menu)

  assert.deepEqual(normalizeMenuReview({ ...menu, menuKey, menuName: menu.name, menuDate: menu.date, rating: 5 }), {
    menuKey,
    menuName: '비빔밥',
    menuDate: menu.date,
    mealTimeId: menu.mealTimeId,
    rating: 5
  })
  assert.throws(
    () => normalizeMenuReview({ ...menu, menuKey: `${menuKey}x`, menuName: menu.name, menuDate: menu.date, rating: 5 }),
    MenuReviewError
  )
})

test('maps date-specific review keys to the same occurrence-normalized menu name', () => {
  const menuKey = menuReviewKey({
    name: ' 김치 찌개（돈육: 국내산） ',
    date: '20260810',
    mealTimeId: 'lunch:2'
  })
  const previousMenuKey = menuReviewKey({
    name: '김치찌개',
    date: '20250701',
    mealTimeId: '1'
  })

  assert.notEqual(menuKey, previousMenuKey)
  assert.equal(menuReviewNormalizedName(menuKey), '김치찌개')
  assert.equal(menuReviewNormalizedName(previousMenuKey), '김치찌개')
  assert.equal(menuReviewNormalizedName('v1:invalid'), null)
})
