const MAX_ENTRIES = 300

type CachedImage = { data: ArrayBuffer; contentType: string }

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
