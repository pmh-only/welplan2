import { service } from '$lib/server/service'
import { restaurantDetailPath } from '$lib/restaurant-routes'
import type { RequestHandler } from './$types'

const STATIC_ENTRIES = [
  { path: '/', changefreq: 'daily' as const, priority: '1.0' },
  { path: '/docs/api', changefreq: 'weekly' as const, priority: '0.7' },
  { path: '/notice', changefreq: 'weekly' as const, priority: '0.4' },
  { path: '/terms', changefreq: 'yearly' as const, priority: '0.3' },
  { path: '/privacy', changefreq: 'yearly' as const, priority: '0.3' },
  { path: '/data-deletion', changefreq: 'yearly' as const, priority: '0.3' }
]

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export const GET: RequestHandler = async ({ url }) => {
  const restaurantEntries = await service.getRestaurants()
    .then((restaurants) => restaurants
      .map((restaurant) => ({
        path: restaurantDetailPath(restaurant),
        changefreq: 'weekly' as const,
        priority: '0.6'
      }))
      .sort((a, b) => a.path.localeCompare(b.path, 'ko')))
    .catch(() => [])
  const entries = [...STATIC_ENTRIES, ...restaurantEntries]

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
