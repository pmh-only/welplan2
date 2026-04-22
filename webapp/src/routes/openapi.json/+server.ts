import type { RequestHandler } from './$types'
import { CONTENT_SIGNAL } from '$lib/agent'
import { getOpenApiDocument } from '$lib/server/discovery'

export const GET: RequestHandler = ({ url }) => {
  return new Response(JSON.stringify(getOpenApiDocument(url.origin), null, 2), {
    headers: {
      'Content-Type': 'application/vnd.oai.openapi+json;version=3.1; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Signal': CONTENT_SIGNAL
    }
  })
}
