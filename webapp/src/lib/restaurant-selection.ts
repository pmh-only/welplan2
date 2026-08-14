import type { Restaurant } from './types'

export async function recordRestaurantSelection(
  restaurants: Restaurant[],
  selectedRestaurant?: Restaurant
): Promise<void> {
  const response = await fetch('/proxy/restaurants/select', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ restaurants, selectedRestaurant })
  })

  if (!response.ok) throw new Error('Failed to record restaurant selection')
}
