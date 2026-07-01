import type { RequestHandler } from './$types'
import { cacheRemoteImage } from '$lib/server/image-cache'

export const GET: RequestHandler = async ({ params, request, url }) => {
  const upstreamUrl = `https://m.planeatchoice.net/${params.path}`
  const supportsWebP = request.headers.get('Accept')?.includes('image/webp') ?? false
  const cacheKey = `planeat:${params.path}:${supportsWebP ? 'webp' : 'orig'}`
  const forceRefresh = url.searchParams.has('v')

  try {
    const cached = await cacheRemoteImage(
      cacheKey,
      upstreamUrl,
      { 'User-Agent': 'Mozilla/5.0' },
      supportsWebP,
      forceRefresh
    )
    if (!cached) return new Response(null, { status: 502 })

    return new Response(cached.data, {
      status: 200,
      headers: {
        'Content-Type': cached.contentType,
        'Cache-Control': forceRefresh ? 'no-store' : 'public, max-age=31536000, immutable',
        Vary: 'Accept'
      }
    })
  } catch {
    return new Response(null, { status: 502 })
  }
}
