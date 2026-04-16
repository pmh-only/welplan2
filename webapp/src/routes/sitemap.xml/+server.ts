import { service } from '$lib/server/service'
import { autoSelectMealTime, todayStr } from '$lib/utils'
import type { RequestHandler } from './$types'

type SitemapEntry = {
  path: string
  changefreq: 'daily' | 'hourly'
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
  const entries: SitemapEntry[] = [{ path: '/', changefreq: 'hourly', priority: '1.0' }]

  const mealTimes = await service.getAllMealTimes().catch(() => [])
  const currentMealTimeId = autoSelectMealTime(mealTimes) ?? mealTimes[0]?.id

  if (currentMealTimeId) {
    const date = todayStr()
    entries.push(
      { path: `/takein/${date}/${currentMealTimeId}`, changefreq: 'daily', priority: '0.8' },
      { path: `/takeout/${date}/${currentMealTimeId}`, changefreq: 'daily', priority: '0.8' }
    )
  }

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
