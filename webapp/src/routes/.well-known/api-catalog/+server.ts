import type { RequestHandler } from './$types'
import { CONTENT_SIGNAL } from '$lib/agent'
import { getApiCatalog } from '$lib/server/discovery'

function responseFor(body: string | null): Response {
  return new Response(body, {
    headers: {
      'Content-Type':
        'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      Link: '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
      'Content-Signal': CONTENT_SIGNAL
    }
  })
}

export const GET: RequestHandler = ({ url }) => {
  return responseFor(JSON.stringify(getApiCatalog(url.origin), null, 2))
}

export const HEAD: RequestHandler = () => responseFor(null)
