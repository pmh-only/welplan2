import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalRestaurantCombination } from './restaurant-combination.js'

test('canonicalizes restaurant combinations independent of order and duplicates', () => {
  const welstory = { id: 'REST000007', name: 'R5 B1F', vendor: 'welstory' as const }
  const shinsegae = { id: 'CAF04', name: '패밀리홀', vendor: 'shinsegae' as const }

  const first = canonicalRestaurantCombination([welstory, shinsegae, welstory])
  const second = canonicalRestaurantCombination([shinsegae, welstory])

  assert.equal(first.key, second.key)
  assert.equal(first.data, second.data)
  assert.equal(first.restaurants.length, 2)
})

test('does not include restaurant paths or arbitrary metadata', () => {
  const combination = canonicalRestaurantCombination([{
    id: 'REST000007',
    name: 'R5 B1F',
    vendor: 'welstory',
    path: ['수원', 'R5']
  }])

  assert.deepEqual(JSON.parse(combination.data), [{
    id: 'REST000007',
    name: 'R5 B1F',
    vendor: 'welstory'
  }])
})
