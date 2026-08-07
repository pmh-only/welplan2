import assert from 'node:assert/strict'
import test from 'node:test'
import type { Restaurant } from './types.js'
import { restaurantSelectionsEqual } from './restaurant-cookie.js'

function restaurant(id: string, name = id): Restaurant {
  return { id, name, vendor: 'welstory' }
}

test('matches the same restaurant selection despite hydrated metadata changes', () => {
  assert.equal(
    restaurantSelectionsEqual(
      [restaurant('restaurant-1', '저장된 이름')],
      [{ ...restaurant('restaurant-1', '검색된 이름'), path: ['사업장', '식당'] }]
    ),
    true
  )
})

test('rejects stale restaurant selections', () => {
  const current = [restaurant('restaurant-1'), restaurant('restaurant-2')]

  assert.equal(restaurantSelectionsEqual([restaurant('restaurant-1')], current), false)
  assert.equal(restaurantSelectionsEqual([...current].reverse(), current), false)
})
