import type { RequestHandler } from './$types'
import sharp from 'sharp'

export const GET: RequestHandler = async ({ params, request }) => {
  const url = `https://m.planeatchoice.net/${params.path}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    if (!res.ok) return new Response(null, { status: res.status })
    const body = await res.arrayBuffer()
    const contentType = res.headers.get('Content-Type') ?? 'image/jpeg'
    const supportsWebP = request.headers.get('Accept')?.includes('image/webp') ?? false

    if (supportsWebP && contentType.startsWith('image/') && !contentType.includes('svg')) {
      const webpBuffer = await sharp(new Uint8Array(body)).webp({ quality: 82 }).toBuffer()
      return new Response(new Uint8Array(webpBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Vary': 'Accept'
        }
      })
    }

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
