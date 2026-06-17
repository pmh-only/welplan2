import type { Restaurant } from '../types.js'
import {
  restaurantDatedPath,
  restaurantDatedRssPath,
  restaurantDetailPath
} from '../restaurant-routes.js'

export const DEFAULT_INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/

export type IndexNowConfig = {
  endpoint: string
  host: string
  key: string
  keyLocation: string
  origin: string
}

export type IndexNowConfigResult =
  | { enabled: true; config: IndexNowConfig }
  | { enabled: false; reason: string }

function normalizeUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

function normalizeOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

export function readIndexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim()
  return key && INDEXNOW_KEY_PATTERN.test(key) ? key : null
}

export function readIndexNowConfig(): IndexNowConfigResult {
  const key = readIndexNowKey()
  if (!key) {
    return { enabled: false, reason: 'INDEXNOW_KEY is not configured or is invalid' }
  }

  const origin = normalizeOrigin(process.env.INDEXNOW_ORIGIN ?? process.env.ORIGIN)
  if (!origin) {
    return { enabled: false, reason: 'INDEXNOW_ORIGIN or ORIGIN must be a valid public URL' }
  }

  const endpoint = normalizeUrl(process.env.INDEXNOW_ENDPOINT) ?? DEFAULT_INDEXNOW_ENDPOINT
  const host = new URL(origin).host
  const keyLocation = new URL(`${encodeURIComponent(key)}.txt`, `${origin}/`).toString()

  return {
    enabled: true,
    config: {
      endpoint,
      host,
      key,
      keyLocation,
      origin
    }
  }
}

export function buildIndexNowMenuUrls(config: IndexNowConfig, restaurant: Restaurant, date: string): string[] {
  const urls = [
    restaurantDetailPath(restaurant),
    restaurantDatedPath(restaurant, date),
    restaurantDatedRssPath(restaurant, date)
  ].map((path) => new URL(path, `${config.origin}/`).toString())

  return [...new Set(urls)]
}
