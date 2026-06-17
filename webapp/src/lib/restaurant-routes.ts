import type { Restaurant } from './types.js'

const FALLBACK_SLUG = 'restaurant'

export function restaurantSlug(restaurant: Restaurant): string {
  const slug = restaurant.name
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  return slug || FALLBACK_SLUG
}

export function encodeRestaurantId(id: string): string {
  return encodeURIComponent(id)
}

export function restaurantDetailPath(restaurant: Restaurant): string {
  const vendor = encodeURIComponent(restaurant.vendor)
  const id = encodeRestaurantId(restaurant.id)
  const slug = encodeURIComponent(restaurantSlug(restaurant))

  return `/restaurants/${vendor}/${id}/${slug}`
}

export function restaurantDatedPath(restaurant: Restaurant, date: string): string {
  const vendor = encodeURIComponent(restaurant.vendor)
  const id = encodeRestaurantId(restaurant.id)
  const slug = encodeURIComponent(restaurantSlug(restaurant))

  return `/restaurants/${vendor}/${id}/${slug}/${encodeURIComponent(date)}`
}

export function restaurantDatedRssPath(restaurant: Restaurant, date: string): string {
  return `${restaurantDatedPath(restaurant, date)}/rss.xml`
}
