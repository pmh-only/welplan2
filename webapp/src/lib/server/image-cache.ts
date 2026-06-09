import sharp from 'sharp'
import { eq } from 'drizzle-orm'
import { db, ensureDbInitialized } from './db/index.js'
import { imageCache } from './db/schema.js'
import { getRedisJson, setRedisJson } from './redis-cache.js'

const MAX_ENTRIES = 300

type CachedImage = { data: ArrayBuffer; contentType: string }
type PersistedCachedImage = { data: string; contentType: string }

const cache = new Map<string, CachedImage>()

export function getCachedImage(url: string): CachedImage | undefined {
  return cache.get(url)
}

export function setCachedImage(url: string, data: ArrayBuffer, contentType: string): void {
  if (cache.size >= MAX_ENTRIES) {
    cache.delete(cache.keys().next().value!)
  }
  cache.set(url, { data, contentType })
}

export async function getPersistedCachedImage(key: string): Promise<CachedImage | undefined> {
  await ensureDbInitialized()
  const redisCached = await getRedisJson<PersistedCachedImage>(`image:${key}`)
  if (redisCached) {
    const buffer = Buffer.from(redisCached.data, 'base64')
    const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    setCachedImage(key, data, redisCached.contentType)
    return { data, contentType: redisCached.contentType }
  }

  const rows = await db.select().from(imageCache).where(eq(imageCache.key, key)).execute()
  const row = rows[0]
  if (!row) return undefined

  const buffer = Buffer.from(row.data, 'base64')
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  await setRedisJson(`image:${key}`, { data: row.data, contentType: row.contentType })
  setCachedImage(key, data, row.contentType)
  return { data, contentType: row.contentType }
}

export async function setPersistedCachedImage(
  key: string,
  data: ArrayBuffer,
  contentType: string
): Promise<void> {
  await ensureDbInitialized()
  const serialized = Buffer.from(data).toString('base64')
  await db
    .insert(imageCache)
    .values({
      key,
      data: serialized,
      contentType,
      cachedAt: Date.now()
    })
    .onConflictDoUpdate({
      target: imageCache.key,
      set: {
        data: serialized,
        contentType,
        cachedAt: Date.now()
      }
    })
    .execute()
  await setRedisJson(`image:${key}`, { data: serialized, contentType })
  setCachedImage(key, data, contentType)
}

export async function cacheRemoteImage(
  key: string,
  upstreamUrl: string,
  headers: HeadersInit,
  supportsWebP: boolean
): Promise<CachedImage | undefined> {
  const memoryCached = getCachedImage(key)
  if (memoryCached) return memoryCached

  const persisted = await getPersistedCachedImage(key)
  if (persisted) return persisted

  const res = await fetch(upstreamUrl, { headers })
  if (!res.ok) return undefined

  const body = await res.arrayBuffer()
  const contentType = res.headers.get('Content-Type') ?? 'image/jpeg'
  if (supportsWebP && contentType.startsWith('image/') && !contentType.includes('svg')) {
    const webpBuffer = await sharp(new Uint8Array(body)).webp({ quality: 82 }).toBuffer()
    const webpData = webpBuffer.buffer.slice(
      webpBuffer.byteOffset,
      webpBuffer.byteOffset + webpBuffer.byteLength
    ) as ArrayBuffer
    await setPersistedCachedImage(key, webpData, 'image/webp')
    return { data: webpData, contentType: 'image/webp' }
  }

  await setPersistedCachedImage(key, body, contentType)
  return { data: body, contentType }
}

export async function prewarmProxiedImage(url: string | undefined): Promise<boolean> {
  if (!url) return false

  if (url.includes('samsungwelstory.com')) {
    const path = url.replace(/^https?:\/\/samsungwelstory\.com\//, '')
    const cached = await cacheRemoteImage(
      `welstory:${path}:webp`,
      `http://samsungwelstory.com/${path}`,
      {
        Referer: 'https://welplus.welstory.com',
        'User-Agent': 'Mozilla/5.0'
      },
      true
    )
    return Boolean(cached)
  }

  if (url.includes('planeatchoice.net')) {
    const path = url.replace(/^https?:\/\/[^/]*planeatchoice\.net\//, '')
    const cached = await cacheRemoteImage(
      `planeat:${path}:webp`,
      `https://m.planeatchoice.net/${path}`,
      { 'User-Agent': 'Mozilla/5.0' },
      true
    )
    return Boolean(cached)
  }

  return false
}
