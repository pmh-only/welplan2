import { service } from '$lib/server/service'
import { restaurantDatedPath } from '$lib/restaurant-routes'
import { ALL_MEAL_TIME_ID, autoSelectMealTime, todayStr } from '$lib/utils'
import { menuScanDates } from '$lib/server/menu-availability'
import type { RequestHandler } from './$types'

type SitemapEntry = {
  path: string
  changefreq: 'daily' | 'hourly' | 'weekly'
  priority: string
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export const GET: RequestHandler = async ({ url }) => {
  const entries: SitemapEntry[] = [
    { path: '/', changefreq: 'hourly', priority: '1.0' }
  ]
  const date = todayStr()

  entries.push({ path: `/takein/${date}/${ALL_MEAL_TIME_ID}`, changefreq: 'daily', priority: '0.8' })

  const mealTimes = await service.getAllMealTimes().catch(() => [])
  const currentMealTimeId = autoSelectMealTime(mealTimes) ?? mealTimes[0]?.id
  if (currentMealTimeId) {
    entries.push({ path: `/takeout/${date}/${currentMealTimeId}`, changefreq: 'daily', priority: '0.8' })
  }

  const dates = menuScanDates(date)
  const restaurantEntries = await service.getRestaurants()
    .then((restaurants) => {
      const cachedMenuDates = service.getCachedMenuDates(dates)

      return restaurants
        .flatMap((restaurant) => {
          // Always include today; add any additional cached dates on top
          const entryDates = new Set([date, ...(cachedMenuDates.get(restaurant.id) ?? [])])
          return [...entryDates].map((entryDate) => ({
            path: restaurantDatedPath(restaurant, entryDate),
            changefreq: 'weekly' as const,
            priority: '0.6'
          }))
        })
        .sort((a, b) => a.path.localeCompare(b.path, 'ko'))
    })
    .catch(() => [])

  entries.push(...restaurantEntries)

  const lastmod = new Date().toISOString()
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (entry) => `  <url>
    <loc>${xmlEscape(`${url.origin}${entry.path}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
