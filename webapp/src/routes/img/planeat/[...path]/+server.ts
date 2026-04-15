import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ params }) => {
  const url = `https://m.planeatchoice.net/${params.path}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    if (!res.ok) return new Response(null, { status: res.status })
    const body = await res.arrayBuffer()
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400'
      }
    })
  } catch {
    return new Response(null, { status: 502 })
  }
}
