import { service } from '$lib/server/service'
import type { Restaurant } from '$lib/types'
import type { RequestHandler } from './$types'

const MAX_RESTAURANTS = 50

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
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, message: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, message: 'Invalid selection' }, { status: 400 })
  }

  const selection = body as { restaurants?: unknown; selectedRestaurant?: unknown }
  if (
    !Array.isArray(selection.restaurants) ||
    selection.restaurants.length > MAX_RESTAURANTS ||
    !selection.restaurants.every(isRestaurant) ||
    (selection.selectedRestaurant !== undefined && !isRestaurant(selection.selectedRestaurant))
  ) {
    return Response.json({ ok: false, message: 'Invalid selection' }, { status: 400 })
  }

  const selectedRestaurant = selection.selectedRestaurant
  if (selectedRestaurant && !selection.restaurants.some((restaurant) =>
    restaurant.vendor === selectedRestaurant.vendor && restaurant.id === selectedRestaurant.id
  )) {
    return Response.json({ ok: false, message: 'Selected restaurant is not in selection' }, { status: 400 })
  }

  await service.recordRestaurantSelection(selection.restaurants, selectedRestaurant)
  return Response.json({ ok: true })
}
