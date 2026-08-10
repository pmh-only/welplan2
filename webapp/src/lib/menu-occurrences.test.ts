import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeMenuOccurrenceName } from './menu-occurrences.js'

test('normalizes menu names for occurrence counting', () => {
  assert.equal(normalizeMenuOccurrenceName(' 김치 찌개 (돈육: 국내산) '), '김치찌개')
  assert.equal(normalizeMenuOccurrenceName('Take Out（웰핏）'), 'takeout')
  assert.equal(normalizeMenuOccurrenceName('닭가슴살(1) + 단백질 음료(1)'), '닭가슴살+단백질음료')
})
