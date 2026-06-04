import { service } from '$lib/server/service'
import { restaurantDetailPath } from '$lib/restaurant-routes'
import type { RequestHandler } from './$types'

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export const GET: RequestHandler = async ({ url }) => {
  const entries = await service.getRestaurants()
    .then((restaurants) => restaurants
      .map((restaurant) => ({
        path: restaurantDetailPath(restaurant),
        changefreq: 'weekly' as const,
        priority: '0.6'
      }))
      .sort((a, b) => a.path.localeCompare(b.path, 'ko')))
    .catch(() => [])

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
