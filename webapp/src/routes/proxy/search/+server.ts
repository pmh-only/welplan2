import type { RequestHandler } from './$types'
import { PlaneatChoiceClient } from '@pmh-only/welplan2-planeat-choice'
import { WelstoryPlusClient } from '@pmh-only/welplan2-welstory-plus'
import { createService } from '$lib/server/service'
import type { Restaurant } from '$lib/types'
import '$lib/server/env'

const searchService = createService({ allowRemoteFetch: true })

function restaurantKey(restaurant: Restaurant): string {
  return `${restaurant.vendor}:${restaurant.id}`
}

function isClosedRestaurant(restaurant: Restaurant): boolean {
  return restaurant.name.toLowerCase().normalize('NFKC').includes('(운영종료)')
}

function matchesQuery(restaurant: Restaurant, query: string): boolean {
  const normalizedQuery = query.toLowerCase().normalize('NFKC').trim()
  if (!normalizedQuery) return true

  const values = [
    restaurant.id,
    restaurant.name,
    restaurant.vendor,
    ...(restaurant.path ?? [])
  ].map((value) => value.toLowerCase().normalize('NFKC'))

  return values.some((value) => value.includes(normalizedQuery))
}

async function fallbackSearchRestaurants(query: string): Promise<Restaurant[]> {
  const [welstoryResult, shinsegaeResult] = await Promise.allSettled([
    Promise.resolve().then(() => new WelstoryPlusClient().searchRestaurants(query)),
    Promise.resolve().then(async () => {
      const restaurants = await new PlaneatChoiceClient().getRestaurants()
      return restaurants.filter((restaurant) => matchesQuery(restaurant, query))
    })
  ])

  const restaurants = [
    ...(welstoryResult.status === 'fulfilled' ? welstoryResult.value : []),
    ...(shinsegaeResult.status === 'fulfilled' ? shinsegaeResult.value : [])
  ]
  const deduped = new Map(
    restaurants
      .filter((restaurant) => !isClosedRestaurant(restaurant))
      .map((restaurant) => [restaurantKey(restaurant), restaurant])
  )
  return [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q') ?? ''
  try {
    const results = await searchService.searchRestaurants(q)
    return Response.json(results.length > 0 ? results : await fallbackSearchRestaurants(q).catch(() => []))
  } catch (error) {
    console.warn('Restaurant cache search failed; falling back to vendor search', error)
    return Response.json(await fallbackSearchRestaurants(q).catch(() => []))
  }
}
