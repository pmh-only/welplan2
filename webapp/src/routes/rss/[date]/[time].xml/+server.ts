import { error } from '@sveltejs/kit'
import { service } from '$lib/server/service'
import { buildDateTimeFeedItems, isValidFeedDate, rssResponse } from '$lib/server/rss-feed'
import { formatKoreanDate } from '$lib/utils'
import type { RequestHandler } from './$types'

export const prerender = false

export const GET: RequestHandler = async ({ params, url }) => {
  if (!isValidFeedDate(params.date)) {
    error(404, '날짜 형식이 올바르지 않습니다')
  }

  const [restaurants, mealTimes] = await Promise.all([
    service.getRestaurants().catch(() => []),
    service.getAllMealTimes().catch(() => [])
  ])
  const mealTime = mealTimes.find((time) => time.id === params.time)
  if (!mealTime) {
    error(404, '식사 시간을 찾을 수 없습니다')
  }

  const mealTimeIndex = mealTimes.findIndex((time) => time.id === mealTime.id)
  const items = await buildDateTimeFeedItems(
    url.origin,
    restaurants,
    params.date,
    mealTime,
    mealTimeIndex
  )

  return rssResponse({
    title: `Welplan ${formatKoreanDate(params.date)} ${mealTime.name} 메뉴 RSS`,
    link: `${url.origin}/rss/${encodeURIComponent(params.date)}/${encodeURIComponent(params.time)}.xml`,
    description: 'Welplan 식당 메뉴를 날짜와 식사 시간 기준으로 제공하는 RSS 피드입니다.',
    items
  })
}
