import type { Restaurant } from '../types.js'

type CompactRestaurant = Pick<Restaurant, 'id' | 'name' | 'vendor'>

export function canonicalRestaurantCombination(restaurants: Restaurant[]): {
  key: string
  data: string
  restaurants: CompactRestaurant[]
} {
  const unique = new Map<string, CompactRestaurant>()

  for (const restaurant of restaurants) {
    const key = JSON.stringify([restaurant.vendor, restaurant.id])
    if (!unique.has(key)) {
      unique.set(key, {
        id: restaurant.id,
        name: restaurant.name,
        vendor: restaurant.vendor
      })
    }
  }

  const canonical = [...unique.values()].sort((a, b) =>
    a.vendor.localeCompare(b.vendor) || a.id.localeCompare(b.id)
  )

  return {
    key: JSON.stringify(canonical.map((restaurant) => [restaurant.vendor, restaurant.id])),
    data: JSON.stringify(canonical),
    restaurants: canonical
  }
}
