import type { RequestHandler } from './$types'
import { CONTENT_SIGNAL } from '$lib/agent'

export const GET: RequestHandler = ({ url }) => {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /proxy/',
    `Content-Signal: ${CONTENT_SIGNAL}`,
    `Sitemap: ${url.origin}/sitemap.xml`
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Signal': CONTENT_SIGNAL
    }
  })
}
