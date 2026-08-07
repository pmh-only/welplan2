import assert from 'node:assert/strict'
import test from 'node:test'
import type { CafeteriaService } from './service.js'
import type { MealTime, Restaurant } from '../types.js'
import { computeGalleryMenusForRestaurants } from './menu-page.js'

const restaurants: Restaurant[] = [
  {
    id: 'REST000007',
    name: 'R5 B1F',
    vendor: 'welstory'
  },
  {
    id: 'CAF04',
    name: '패밀리홀',
    vendor: 'shinsegae'
  }
]

const mealTimesByRestaurant: Record<string, MealTime[]> = {
  REST000007: [
    { id: '1', name: '아침' },
    { id: '2', name: '점심' },
    { id: '3', name: '저녁' },
    { id: '4', name: '야식' },
    { id: '5', name: '간식' },
    { id: '6', name: '새벽식' }
  ],
  CAF04: [
    { id: '1', name: '조식' },
    { id: '2', name: '중식' },
    { id: '3', name: '석식' }
  ]
}

async function requestedMenus(time: string): Promise<string[]> {
  const requests: string[] = []
  const cafeteriaService = {
    getMealTimes: async (restaurantId: string) => mealTimesByRestaurant[restaurantId],
    getMenus: async (restaurantId: string, _date: string, mealTimeId: string) => {
      requests.push(`${restaurantId}:${mealTimeId}`)
      return []
    }
  } as unknown as CafeteriaService

  await computeGalleryMenusForRestaurants(
    restaurants,
    mealTimesByRestaurant.REST000007,
    '20260807',
    time,
    cafeteriaService
  )

  return requests.sort()
}

test('loads each restaurant own meal times for a mixed-vendor all-day gallery', async () => {
  assert.deepEqual(await requestedMenus('all'), [
    'CAF04:1',
    'CAF04:2',
    'CAF04:3',
    'REST000007:1',
    'REST000007:2',
    'REST000007:3',
    'REST000007:4',
    'REST000007:5',
    'REST000007:6'
  ])
})

test('loads the selected meal time from both vendors', async () => {
  assert.deepEqual(await requestedMenus('2'), ['CAF04:2', 'REST000007:2'])
})
