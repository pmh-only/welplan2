const API_PATH = '/api'
const PROXY_PATH = '/proxy'
const WEBHOOK_API_PATH = '/api/webhooks'

function isPathOrDescendant(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function applyGetApiCors(method: string, pathname: string, response: Response): Response {
  const isPublicApi = isPathOrDescendant(pathname, API_PATH) || isPathOrDescendant(pathname, PROXY_PATH)
  if (method !== 'GET' || !isPublicApi || isPathOrDescendant(pathname, WEBHOOK_API_PATH)) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}
