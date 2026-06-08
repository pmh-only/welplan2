import type { RequestHandler } from './$types'
import { cacheRemoteImage } from '$lib/server/image-cache'

export const GET: RequestHandler = async ({ params, request }) => {
  const upstreamUrl = `http://samsungwelstory.com/${params.path}`
  const supportsWebP = request.headers.get('Accept')?.includes('image/webp') ?? false
  const cacheKey = `welstory:${params.path}:${supportsWebP ? 'webp' : 'orig'}`

  try {
    const cached = await cacheRemoteImage(
      cacheKey,
      upstreamUrl,
      {
        Referer: 'https://welplus.welstory.com',
        'User-Agent': 'Mozilla/5.0'
      },
      supportsWebP
    )
    if (!cached) return new Response(null, { status: 502 })

    return new Response(cached.data, {
      status: 200,
      headers: {
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        Vary: 'Accept'
      }
    })
  } catch {
    return new Response(null, { status: 502 })
  }
}
