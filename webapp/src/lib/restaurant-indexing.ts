import type { Restaurant, Vendor } from './types.js'

const NON_INDEXABLE_NAME = /운영종료|테스트|식당없음/i

export function normalizeRestaurantRouteId(vendor: Vendor, id: string): string {
  if (vendor === 'welstory' && /^rest\d{6}$/i.test(id)) return id.toUpperCase()
  return id
}

export function isIndexableRestaurant(restaurant: Restaurant): boolean {
  if (NON_INDEXABLE_NAME.test(restaurant.name)) return false

  if (restaurant.vendor === 'welstory') {
    return /^REST\d{6}$/.test(restaurant.id) && restaurant.id !== 'REST999999'
  }

  return /^(?:CAF\d+(?:,\s*CAF\d+)*|VIP\d+)$/.test(restaurant.id)
}
