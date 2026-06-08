import { formatKoreanDate, todayStr } from '$lib/utils'
import { service } from '$lib/server/service'
import { buildCachedDateRangeFeedItems, rssResponse } from '$lib/server/rss-feed'
import { menuScanDates } from '$lib/server/menu-availability'
import type { RequestHandler } from './$types'

export const prerender = false

export const GET: RequestHandler = async ({ url }) => {
  const date = todayStr()
  const dates = menuScanDates(date)
  const [restaurants, mealTimes] = await Promise.all([
    service.getRestaurants().catch(() => []),
    service.getAllMealTimes().catch(() => [])
  ])
  const items = await buildCachedDateRangeFeedItems(url.origin, restaurants, dates, mealTimes, 'restaurant')

  return rssResponse({
    title: `Welplan ${formatKoreanDate(date)}부터 7일 메뉴 RSS`,
    link: `${url.origin}/rss.xml`,
    description: 'Welplan 식당 메뉴를 향후 7일 날짜와 식사 시간 기준으로 제공하는 RSS 피드입니다.',
    items
  })
}
