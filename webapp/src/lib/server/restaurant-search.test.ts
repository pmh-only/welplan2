import assert from 'node:assert/strict'
import test from 'node:test'
import type { Restaurant } from '../types.js'
import { createService } from './service.js'

type SearchServiceInternals = {
  ensureCache: () => Promise<void>
  readRestaurants: () => Promise<Restaurant[]>
  readRestaurantAdditionalPathsSettings: () => Promise<Record<string, string[][]>>
  readRestaurantSelectionRecency: () => Promise<Map<string, number>>
}

function searchService(restaurants: Restaurant[], recency: Map<string, number>) {
  const service = createService({ allowRemoteFetch: false })
  const internals = service as unknown as SearchServiceInternals
  let recencyReads = 0

  internals.ensureCache = async () => undefined
  internals.readRestaurants = async () => restaurants
  internals.readRestaurantAdditionalPathsSettings = async () => ({})
  internals.readRestaurantSelectionRecency = async () => {
    recencyReads++
    return recency
  }

  return { service, recencyReads: () => recencyReads }
}

const restaurants: Restaurant[] = [
  { id: 'REST000005', name: 'R4 오아시스(B1F)', vendor: 'welstory', path: ['수원', 'R4'] },
  { id: 'ALIAS001', name: '모바일 연구소', vendor: 'welstory', path: ['수원', 'R5'] },
  { id: 'REST000008', name: 'R5 B2F', vendor: 'welstory', path: ['수원'] },
  { id: 'REST000007', name: 'R5 B1F', vendor: 'welstory', path: ['수원'] },
  { id: 'rest000007', name: 'r5 b1f', vendor: 'welstory', path: ['수원'] },
  { id: 'REST000101', name: 'R5 (운영종료)', vendor: 'welstory', path: ['수원'] },
  { id: 'REST000102', name: 'R5 운영 종료', vendor: 'welstory', path: ['수원'] },
  { id: 'REST000103', name: 'R5 테스트', vendor: 'welstory', path: ['수원'] },
  { id: 'REST000104', name: 'R5 Test', vendor: 'welstory', path: ['수원'] },
  { id: 'REST000105', name: ' x ', vendor: 'welstory', path: ['수원'] },
  { id: 'CAF01', name: 'R5', vendor: 'shinsegae', path: ['수원'] }
]

test('uses relevance instead of recent selections when a search query is present', async () => {
  process.env.REDIS_CACHE_DISABLED = 'true'
  const { service, recencyReads } = searchService(restaurants, new Map([
    ['REST000005', 500],
    ['ALIAS001', 400],
    ['REST000008', 300],
    ['REST000007', 200]
  ]))

  const results = await service.searchRestaurants('R5')

  assert.deepEqual(results.map((restaurant) => restaurant.name), [
    'R5 B1F',
    'R5 B2F',
    '모바일 연구소',
    'R5'
  ])
  assert.equal(recencyReads(), 0)
})

test('keeps recent selection order and hides excluded names when the search query is empty', async () => {
  process.env.REDIS_CACHE_DISABLED = 'true'
  const { service, recencyReads } = searchService(restaurants.filter((restaurant) => restaurant.id !== 'rest000007'), new Map([
    ['REST000005', 100],
    ['ALIAS001', 300],
    ['REST000008', 200],
    ['CAF01', 1_000]
  ]))

  const results = await service.searchRestaurants('')

  assert.deepEqual(results.map((restaurant) => restaurant.id), [
    'ALIAS001',
    'REST000008',
    'REST000005',
    'REST000007',
    'CAF01'
  ])
  assert.equal(recencyReads(), 1)
})
