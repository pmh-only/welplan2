import type { RequestHandler } from './$types'
import sharp from 'sharp'
import { getCachedImage, setCachedImage } from '$lib/server/image-cache'

export const GET: RequestHandler = async ({ params, request }) => {
  const upstreamUrl = `http://samsungwelstory.com/${params.path}`
  const supportsWebP = request.headers.get('Accept')?.includes('image/webp') ?? false
  const cacheKey = `welstory:${params.path}:${supportsWebP ? 'webp' : 'orig'}`

  const cached = getCachedImage(cacheKey)
  if (cached) {
    return new Response(cached.data, {
      status: 200,
      headers: {
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Vary': 'Accept'
      }
    })
  }

  try {
    const res = await fetch(upstreamUrl, {
      headers: {
        Referer: 'https://welplus.welstory.com',
        'User-Agent': 'Mozilla/5.0'
      }
    })
    if (!res.ok) return new Response(null, { status: res.status })

    const body = await res.arrayBuffer()
    const contentType = res.headers.get('Content-Type') ?? 'image/jpeg'

    if (supportsWebP && contentType.startsWith('image/') && !contentType.includes('svg')) {
      const webpBuffer = await sharp(new Uint8Array(body)).webp({ quality: 82 }).toBuffer()
      const webpData = webpBuffer.buffer.slice(webpBuffer.byteOffset, webpBuffer.byteOffset + webpBuffer.byteLength) as ArrayBuffer
      setCachedImage(cacheKey, webpData, 'image/webp')
      return new Response(webpData, {
        status: 200,
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Vary': 'Accept'
        }
      })
    }

    setCachedImage(cacheKey, body, contentType)
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Vary': 'Accept'
      }
    })
  } catch {
    return new Response(null, { status: 502 })
  }
}
