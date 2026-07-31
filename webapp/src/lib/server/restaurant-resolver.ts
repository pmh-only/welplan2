import type { Restaurant, Vendor } from '$lib/types'
import { service } from '$lib/server/service'
import { normalizeRestaurantRouteId } from '$lib/restaurant-indexing'

type RestaurantRouteParams = {
  vendor: string
  id: string
  slug: string
}

function isVendor(value: string): value is Vendor {
  return value === 'welstory' || value === 'shinsegae'
}

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function nameFromSlug(slug: string, fallback: string): string {
  const decoded = decodeParam(slug).normalize('NFKC').replace(/-+/g, ' ').trim()
  return decoded || fallback
}

export async function resolveRestaurantForRoute(
  params: RestaurantRouteParams,
  selectedRestaurants: Restaurant[] = []
): Promise<Restaurant | null> {
  if (!isVendor(params.vendor) || !params.id) return null

  const id = normalizeRestaurantRouteId(params.vendor, params.id)
  const cached = await service.getRestaurant(id).catch(() => null)
  if (cached?.vendor === params.vendor) return cached

  const selected = selectedRestaurants.find(
    (restaurant) => restaurant.id === id && restaurant.vendor === params.vendor
  )
  if (selected) return selected

  return {
    id,
    vendor: params.vendor,
    name: nameFromSlug(params.slug, id)
  }
}
