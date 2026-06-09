import { createClient, type RedisClientType } from 'redis'
import './env.js'
import { createServerLogger } from './log.js'

const redisLog = createServerLogger('sync')
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379'
const PREFIX = process.env.REDIS_CACHE_PREFIX ?? 'welplan2:'
const RETRY_AFTER_FAILURE_MS = 30_000
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

let client: RedisClientType | null = null
let connectPromise: Promise<RedisClientType | null> | null = null
let unavailableUntil = 0

function redisDisabled(): boolean {
  return TRUE_VALUES.has(process.env.REDIS_CACHE_DISABLED?.trim().toLowerCase() ?? '')
}

function namespaced(key: string): string {
  return `${PREFIX}${key}`
}

async function getClient(): Promise<RedisClientType | null> {
  if (redisDisabled()) return null
  if (Date.now() < unavailableUntil) return null

  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
      socket: {
        connectTimeout: 500,
        reconnectStrategy: false
      }
    })
    client.on('error', (error) => {
      redisLog.warn('redis cache error', { error })
    })
  }

  if (client.isOpen) return client

  connectPromise ??= client.connect()
    .then(() => {
      redisLog.info('redis cache connected')
      return client
    })
    .catch((error) => {
      unavailableUntil = Date.now() + RETRY_AFTER_FAILURE_MS
      redisLog.warn('redis cache unavailable; falling back to postgres', { error })
      client?.destroy()
      client = null
      return null
    })
    .finally(() => {
      connectPromise = null
    })

  return connectPromise
}

export async function getRedisJson<T>(key: string): Promise<T | null> {
  const redis = await getClient()
  if (!redis) return null

  try {
    const value = await redis.get(namespaced(key))
    return value ? JSON.parse(value) as T : null
  } catch (error) {
    redisLog.warn('redis cache read failed', { key, error })
    return null
  }
}

export async function setRedisJson(key: string, value: unknown, ttlMs?: number): Promise<void> {
  const redis = await getClient()
  if (!redis) return

  try {
    const serialized = JSON.stringify(value)
    if (ttlMs !== undefined && ttlMs > 0) {
      await redis.set(namespaced(key), serialized, { PX: ttlMs })
    } else {
      await redis.set(namespaced(key), serialized)
    }
  } catch (error) {
    redisLog.warn('redis cache write failed', { key, error })
  }
}

export async function deleteRedisKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return

  const redis = await getClient()
  if (!redis) return

  try {
    await redis.del(keys.map(namespaced))
  } catch (error) {
    redisLog.warn('redis cache delete failed', { keyCount: keys.length, error })
  }
}

export async function deleteRedisPrefix(prefix: string): Promise<void> {
  const redis = await getClient()
  if (!redis) return

  try {
    const keys = await redis.keys(namespaced(`${prefix}*`))
    if (keys.length > 0) await redis.del(keys)
  } catch (error) {
    redisLog.warn('redis cache prefix delete failed', { prefix, error })
  }
}
