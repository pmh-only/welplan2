import assert from 'node:assert/strict'
import test from 'node:test'
import type { Restaurant } from './types.js'
import { isIndexableRestaurant, normalizeRestaurantRouteId } from './restaurant-indexing.js'

function restaurant(id: string, name: string, vendor: Restaurant['vendor'] = 'welstory'): Restaurant {
  return { id, name, vendor }
}

test('normalizes Welstory route aliases to the canonical uppercase ID', () => {
  assert.equal(normalizeRestaurantRouteId('welstory', 'rest000077'), 'REST000077')
  assert.equal(normalizeRestaurantRouteId('welstory', 'REST000077'), 'REST000077')
  assert.equal(normalizeRestaurantRouteId('shinsegae', 'caf04'), 'caf04')
})

test('allows canonical active restaurant records', () => {
  assert.equal(isIndexableRestaurant(restaurant('REST000016', '삼성미래기술캠퍼스')), true)
  assert.equal(isIndexableRestaurant(restaurant('CAF10, CAF44', '상생협력아카데미', 'shinsegae')), true)
  assert.equal(isIndexableRestaurant(restaurant('VIP01', 'R3 외빈', 'shinsegae')), true)
})

test('rejects closed, test, placeholder, alias, and sentinel records', () => {
  assert.equal(isIndexableRestaurant(restaurant('REST000009', '스마트(운영종료)')), false)
  assert.equal(isIndexableRestaurant(restaurant('REST000380', '테스트')), false)
  assert.equal(isIndexableRestaurant(restaurant('RESTNOTUSE', '식당없음')), false)
  assert.equal(isIndexableRestaurant(restaurant('rest000077', '중공업거제b식당')), false)
  assert.equal(isIndexableRestaurant(restaurant('REST999999', '코리아벤쳐타운')), false)
})
