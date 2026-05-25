import { error, redirect } from '@sveltejs/kit'
import { restaurantDatedRssPath } from '$lib/restaurant-routes'
import { service } from '$lib/server/service'
import { buildRestaurantDateFeedItems, isValidFeedDate, rssResponse } from '$lib/server/rss-feed'
import { formatKoreanDate } from '$lib/utils'
import type { RequestHandler } from './$types'

export const prerender = false

export const GET: RequestHandler = async ({ params, url }) => {
  if (!isValidFeedDate(params.date)) {
    error(404, '날짜 형식이 올바르지 않습니다')
  }

  const restaurant = await service.getRestaurant(params.id)
  if (!restaurant || restaurant.vendor !== params.vendor) {
    error(404, '식당을 찾을 수 없습니다')
  }

  const canonicalPath = restaurantDatedRssPath(restaurant, params.date)
  if (url.pathname !== canonicalPath) {
    redirect(308, canonicalPath)
  }

  const mealTimes = await service.getMealTimes(restaurant.id).catch(() => [])
  const items = await buildRestaurantDateFeedItems(url.origin, restaurant, params.date, mealTimes)

  return rssResponse({
    title: `${restaurant.name} ${formatKoreanDate(params.date)} 메뉴 RSS`,
    link: `${url.origin}${canonicalPath}`,
    description: `${restaurant.name} 메뉴를 날짜와 식사 시간 기준으로 제공하는 RSS 피드입니다.`,
    items
  })
}
