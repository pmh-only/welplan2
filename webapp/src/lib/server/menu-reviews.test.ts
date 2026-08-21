import assert from 'node:assert/strict'
import test from 'node:test'
import { menuReviewKey, menuReviewNormalizedName } from '../menu-reviews.js'
import {
  MenuReviewError,
  normalizeMenuReview
} from './menu-reviews.js'

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
