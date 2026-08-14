import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Restaurant } from '@pmh-only/welplan2-model'
import type { CafeteriaService } from '../../webapp/src/lib/server/service.js'
import { prefetchAllAvailability } from './poller.js'

test('full prefetch scans every restaurant returned by the catalog', async () => {
  const restaurants: Restaurant[] = [
    { id: 'restaurant-1', name: '첫 번째 식당', vendor: 'welstory' },
    { id: 'restaurant-2', name: '두 번째 식당', vendor: 'shinsegae' }
  ]
  const scannedRestaurantIds: string[] = []
  const service = {
    getRestaurants: async () => restaurants,
    getMealTimes: async () => [{ id: '2', name: '점심', type: 'lunch' as const }],
    getMenus: async (restaurantId: string) => {
      scannedRestaurantIds.push(restaurantId)
      return []
    },
    getWorkerProblemAlertSettings: async () => ({ enabled: false, discordWebhookUrl: '', discordRoleId: '' })
  } as unknown as CafeteriaService

  await prefetchAllAvailability(service)

  assert.equal(scannedRestaurantIds.length, 14)
  assert.deepEqual(new Set(scannedRestaurantIds), new Set(restaurants.map((restaurant) => restaurant.id)))
})

test('full prefetch skips closed and placeholder restaurant names', async () => {
  const restaurants: Restaurant[] = [
    { id: 'active', name: 'Xylophone 식당', vendor: 'welstory' },
    { id: 'closed', name: '스마트(운영종료)', vendor: 'welstory' },
    { id: 'closed-spaced', name: '운영 종료 식당', vendor: 'welstory' },
    { id: 'test-ko', name: '신규 테스트 식당', vendor: 'welstory' },
    { id: 'test-en', name: 'Test Restaurant', vendor: 'welstory' },
    { id: 'placeholder', name: ' x ', vendor: 'welstory' }
  ]
  const scannedRestaurantIds: string[] = []
  const service = {
    getRestaurants: async () => restaurants,
    getMealTimes: async (restaurantId: string) => {
      scannedRestaurantIds.push(restaurantId)
      return []
    },
    getMenus: async () => [],
    getWorkerProblemAlertSettings: async () => ({ enabled: false, discordWebhookUrl: '', discordRoleId: '' })
  } as unknown as CafeteriaService

  await prefetchAllAvailability(service)

  assert.deepEqual(scannedRestaurantIds, ['active'])
})

test('does not alert when a restaurant successfully has no meal times', async () => {
  let settingsRead = false
  const service = {
    getRestaurants: async () => [{ id: 'restaurant-1', name: '운영 종료 식당', vendor: 'welstory' as const }],
    getMealTimes: async () => [],
    getMenus: async () => [],
    getWorkerProblemAlertSettings: async () => {
      settingsRead = true
      return { enabled: false, discordWebhookUrl: '', discordRoleId: '' }
    }
  } as unknown as CafeteriaService

  await prefetchAllAvailability(service)

  assert.equal(settingsRead, false)
})
