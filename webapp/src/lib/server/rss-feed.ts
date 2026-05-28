import type { MealTime, Menu, Restaurant } from '$lib/types'
import { restaurantDatedPath, restaurantDetailPath } from '$lib/restaurant-routes'
import { service } from '$lib/server/service'
import { formatKoreanDate } from '$lib/utils'

export type RssFeedItem = {
  title: string
  link: string
  guid: string
  description: string
  pubDate: Date
  date: string
  mealTimeIndex: number
  restaurantName: string
}

export type RssFeed = {
  title: string
  link: string
  description: string
  items: RssFeedItem[]
}

export function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function isValidFeedDate(date: string): boolean {
  return /^\d{8}$/.test(date)
}

export function rssResponse(feed: RssFeed): Response {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(feed.title)}</title>
    <link>${xmlEscape(feed.link)}</link>
    <description>${xmlEscape(feed.description)}</description>
    <language>ko-KR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${feed.items.map(renderItem).join('\n')}
  </channel>
</rss>`

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800'
    }
  })
}

export async function buildDateTimeFeedItems(
  origin: string,
  restaurants: Restaurant[],
  date: string,
  mealTime: MealTime,
  mealTimeIndex = 0
): Promise<RssFeedItem[]> {
  const items = await Promise.all(
    restaurants.map((restaurant) => buildRestaurantMealTimeItem(origin, restaurant, date, mealTime, mealTimeIndex))
  )

  return sortFeedItems(items.filter((item): item is RssFeedItem => item !== null))
}

export async function buildRestaurantDateFeedItems(
  origin: string,
  restaurant: Restaurant,
  date: string,
  mealTimes: MealTime[]
): Promise<RssFeedItem[]> {
  const items = await Promise.all(
    mealTimes.map((mealTime, index) => buildRestaurantMealTimeItem(origin, restaurant, date, mealTime, index))
  )

  return sortFeedItems(items.filter((item): item is RssFeedItem => item !== null))
}

export function buildCachedDateRangeFeedItems(
  origin: string,
  restaurants: Restaurant[],
  dates: string[],
  mealTimes: MealTime[],
  linkMode: 'dated' | 'restaurant' = 'dated'
): RssFeedItem[] {
  const items: RssFeedItem[] = []

  for (const restaurant of restaurants) {
    for (const date of dates) {
      for (const [index, mealTime] of mealTimes.entries()) {
        const menus = service.getCachedMenus(restaurant.id, date, mealTime.id)
        if (menus && menus.length > 0) {
          items.push(buildRestaurantMealTimeItemFromMenus(origin, restaurant, date, mealTime, index, menus, linkMode))
        }
      }
    }
  }

  return sortFeedItems(items)
}

export function sortFeedItems(items: RssFeedItem[]): RssFeedItem[] {
  return [...items].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.mealTimeIndex - b.mealTimeIndex ||
      a.restaurantName.localeCompare(b.restaurantName, 'ko')
  )
}

async function buildRestaurantMealTimeItem(
  origin: string,
  restaurant: Restaurant,
  date: string,
  mealTime: MealTime,
  mealTimeIndex: number
): Promise<RssFeedItem | null> {
  const menus = await service.getMenus(restaurant.id, date, mealTime.id).catch(() => [])
  if (menus.length === 0) return null

  return buildRestaurantMealTimeItemFromMenus(origin, restaurant, date, mealTime, mealTimeIndex, menus)
}

function buildRestaurantMealTimeItemFromMenus(
  origin: string,
  restaurant: Restaurant,
  date: string,
  mealTime: MealTime,
  mealTimeIndex: number,
  menus: Menu[],
  linkMode: 'dated' | 'restaurant' = 'dated'
): RssFeedItem {
  const path = linkMode === 'restaurant' ? restaurantDetailPath(restaurant) : restaurantDatedPath(restaurant, date)
  const title = `${restaurant.name} ${formatKoreanDate(date)} ${mealTime.name} 메뉴`

  return {
    title,
    link: `${origin}${path}`,
    guid: `${restaurant.vendor}:${restaurant.id}:${date}:${mealTime.id}`,
    description: menuDescription(menus),
    pubDate: feedDate(date, mealTimeIndex),
    date,
    mealTimeIndex,
    restaurantName: restaurant.name
  }
}

function menuDescription(menus: Menu[]): string {
  const items = menus
    .map((menu) => [menu.parentName, menu.name].filter(Boolean).join(' - '))
    .filter(Boolean)
    .map((line) => `<li>${xmlEscape(line)}</li>`)
    .join('')
  return `<ul>${items}</ul>`
}

function feedDate(date: string, mealTimeIndex: number): Date {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(4, 6)) - 1
  const day = Number(date.slice(6, 8))
  return new Date(Date.UTC(year, month, day, mealTimeIndex, 0, 0))
}

function renderItem(item: RssFeedItem): string {
  return `    <item>
      <title>${xmlEscape(item.title)}</title>
      <link>${xmlEscape(item.link)}</link>
      <guid isPermaLink="false">${xmlEscape(item.guid)}</guid>
      <description><![CDATA[${item.description}]]></description>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
    </item>`
}
