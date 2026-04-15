import type { RequestHandler } from './$types'

const API_BASE = process.env.API_URL ?? 'http://localhost:3000'

const handler: RequestHandler = async ({ params, url, request }) => {
  const targetUrl = `${API_BASE}/restaurants/${params.path}${url.search}`
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: { 'Content-Type': 'application/json' },
      body: hasBody ? await request.text() : undefined
    })
    const body = await response.text()
    return new Response(body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch {
    return new Response(JSON.stringify({ error: 'API unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export const GET = handler
export const POST = handler
export const DELETE = handler
