import { service } from '$lib/server/service'
import type { Restaurant } from '$lib/types'
import type { RequestHandler } from './$types'

function isRestaurant(value: unknown): value is Restaurant {
  if (!value || typeof value !== 'object') return false
  const restaurant = value as Partial<Restaurant>
  return typeof restaurant.id === 'string' &&
    restaurant.id.length > 0 &&
    typeof restaurant.name === 'string' &&
    restaurant.name.length > 0 &&
    (restaurant.vendor === 'welstory' || restaurant.vendor === 'shinsegae') &&
    (restaurant.path === undefined || (Array.isArray(restaurant.path) && restaurant.path.every((part) => typeof part === 'string')))
}

export const POST: RequestHandler = async ({ request }) => {
  let restaurant: unknown
  try {
    restaurant = await request.json()
  } catch {
    return Response.json({ ok: false, message: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isRestaurant(restaurant)) {
    return Response.json({ ok: false, message: 'Invalid restaurant' }, { status: 400 })
  }

  await service.recordRestaurantSelection(restaurant)
  return Response.json({ ok: true })
}
