import type { RequestHandler } from './$types'
import { service } from '$lib/server/service'
import { todayStr } from '$lib/utils'

type SitemapEntry = {
  path: string
  changefreq: 'hourly' | 'daily' | 'weekly'
  priority: string
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export const GET: RequestHandler = async ({ url }) => {
  const today = todayStr()
  const mealTimes = await service.getAllMealTimes().catch(() => [])
  const entries: SitemapEntry[] = [
    { path: '/', changefreq: 'hourly', priority: '1.0' },
    { path: '/gallery', changefreq: 'hourly', priority: '0.9' },
    ...mealTimes.flatMap((mealTime) => [
      { path: `/takein/${today}/${mealTime.id}`, changefreq: 'daily' as const, priority: '0.9' },
      { path: `/takeout/${today}/${mealTime.id}`, changefreq: 'daily' as const, priority: '0.8' }
    ])
  ]

  const lastmod = new Date().toISOString()
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(`${url.origin}${entry.path}`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`
    )
    .join('\n')}\n</urlset>\n`

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600'
    }
  })
}
