import { Readable } from 'node:stream'
import { request as undiciRequest, ProxyAgent } from 'undici'
import { createLogger } from './log.js'

type WebshareProxy = {
  username: string
  password: string
  proxy_address: string
  port: number
  valid?: boolean
}

type WebshareProxyList = {
  results?: WebshareProxy[]
}

type ProxyEntry = {
  id: string
  uri: string
  agent: ProxyAgent
  unavailableUntil: number
}

const proxyLog = createLogger('proxy')
const DEFAULT_PROXY_COOLDOWN_MS = 10 * 60 * 1000
const DEFAULT_PROXY_LIST_TTL_MS = 10 * 60 * 1000
const DEFAULT_WEBSHARE_MODE = 'direct'
const WEBSHARE_PROXY_LIST_URL = 'https://proxy.webshare.io/api/v2/proxy/list/'

let proxies: ProxyEntry[] = []
let nextProxyIndex = 0
let loadedAt = 0
let loadPromise: Promise<void> | null = null

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function splitProxyUrls(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function redactProxyUri(uri: string): string {
  try {
    const url = new URL(uri)
    url.username = url.username ? '***' : ''
    url.password = url.password ? '***' : ''
    return url.toString()
  } catch {
    return '<invalid-proxy-url>'
  }
}

function proxyId(uri: string): string {
  try {
    const url = new URL(uri)
    return `${url.hostname}:${url.port}`
  } catch {
    return uri
  }
}

function normalizeProxyUri(uri: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) return uri
  return `http://${uri}`
}

function createProxyEntries(urls: string[]): ProxyEntry[] {
  return urls.map((raw) => {
    const uri = normalizeProxyUri(raw)
    return {
      id: proxyId(uri),
      uri,
      agent: new ProxyAgent({ uri, proxyTunnel: true }),
      unavailableUntil: 0
    }
  })
}

function webshareApiToken(): string {
  return process.env.WEBSHARE_API_TOKEN ?? process.env.WELSTORY_WEBSHARE_API_TOKEN ?? ''
}

async function loadWebshareProxyUrls(): Promise<string[]> {
  const token = webshareApiToken()
  if (!token) return []

  const params = new URLSearchParams({
    mode: process.env.WEBSHARE_PROXY_MODE ?? DEFAULT_WEBSHARE_MODE,
    page: '1',
    page_size: process.env.WEBSHARE_PROXY_PAGE_SIZE ?? '100'
  })
  const countryCodes = process.env.WEBSHARE_PROXY_COUNTRY_CODES
  if (countryCodes) params.set('country_code__in', countryCodes)
  const planId = process.env.WEBSHARE_PROXY_PLAN_ID
  if (planId) params.set('plan_id', planId)

  const response = await fetch(`${WEBSHARE_PROXY_LIST_URL}?${params}`, {
    headers: { Authorization: `Token ${token}` }
  })
  if (!response.ok) {
    throw new Error(`Webshare proxy list failed: ${response.status} ${response.statusText}`)
  }

  const body = await response.json() as WebshareProxyList
  return (body.results ?? [])
    .filter((proxy) => proxy.valid !== false)
    .map((proxy) => {
      const username = encodeURIComponent(proxy.username)
      const password = encodeURIComponent(proxy.password)
      return `http://${username}:${password}@${proxy.proxy_address}:${proxy.port}`
    })
}

async function loadProxies(): Promise<void> {
  const explicitUrls = splitProxyUrls(process.env.WELSTORY_PROXY_URLS)
  const webshareUrls = explicitUrls.length > 0 ? [] : await loadWebshareProxyUrls()
  const urls = explicitUrls.length > 0 ? explicitUrls : webshareUrls

  proxies = createProxyEntries(urls)
  loadedAt = Date.now()
  nextProxyIndex = 0
  if (proxies.length > 0) {
    proxyLog.info('welstory proxies loaded', {
      proxyCount: proxies.length,
      source: explicitUrls.length > 0 ? 'env' : 'webshare_api',
      proxies: proxies.map((proxy) => redactProxyUri(proxy.uri))
    })
  }
}

async function ensureProxiesLoaded(): Promise<void> {
  const hasStaticProxies = splitProxyUrls(process.env.WELSTORY_PROXY_URLS).length > 0
  const ttlMs = hasStaticProxies ? Number.MAX_SAFE_INTEGER : numberEnv('WEBSHARE_PROXY_LIST_TTL_MS', DEFAULT_PROXY_LIST_TTL_MS)
  if (loadedAt && Date.now() - loadedAt < ttlMs) return

  loadPromise ??= loadProxies().catch((error) => {
    proxyLog.warn('welstory proxy load failed', { error })
  }).finally(() => {
    loadPromise = null
  })
  await loadPromise
}

function nextProxy(): ProxyEntry | null {
  if (proxies.length === 0) return null

  const now = Date.now()
  for (let i = 0; i < proxies.length; i++) {
    const index = (nextProxyIndex + i) % proxies.length
    const proxy = proxies[index]
    if (proxy.unavailableUntil > now) continue
    nextProxyIndex = (index + 1) % proxies.length
    return proxy
  }

  const proxy = proxies[nextProxyIndex]
  nextProxyIndex = (nextProxyIndex + 1) % proxies.length
  return proxy
}

function markProxyBlocked(proxy: ProxyEntry, reason: unknown): void {
  proxy.unavailableUntil = Date.now() + numberEnv('WELSTORY_PROXY_BLOCK_COOLDOWN_MS', DEFAULT_PROXY_COOLDOWN_MS)
  proxyLog.warn('welstory proxy marked unavailable', {
    proxy: proxy.id,
    unavailableUntil: proxy.unavailableUntil,
    reason
  })
}

function isBlockedResponse(response: { status: number }): boolean {
  return response.status === 403 || response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504
}

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const cause = (error as Error & { cause?: { code?: string } }).cause
  const code = cause?.code ?? (error as Error & { code?: string }).code
  return error.name === 'TypeError' || ['ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT'].includes(code ?? '')
}

function appendHeaders(headers: Headers, values: Record<string, string | string[] | undefined>): void {
  for (const [name, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry)
    } else if (value !== undefined) {
      headers.append(name, value)
    }
  }
}

async function proxyFetch(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1], proxy: ProxyEntry): Promise<Response> {
  const request = input instanceof Request ? input : null
  const requestInput = request ? request.url : input as string | URL
  const response = await undiciRequest(requestInput, {
    method: init?.method ?? request?.method,
    headers: init?.headers ?? request?.headers,
    body: init?.body as undefined,
    dispatcher: proxy.agent,
    signal: init?.signal ?? request?.signal
  } as unknown as Parameters<typeof undiciRequest>[1])
  const headers = new Headers()
  appendHeaders(headers, response.headers)

  return new Response(Readable.toWeb(response.body) as unknown as BodyInit, {
    status: response.statusCode,
    headers
  })
}

export async function welstoryFetch(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1] = {}): Promise<Response> {
  await ensureProxiesLoaded()

  if (proxies.length === 0) return fetch(input, init)

  const maxAttempts = Math.min(
    proxies.length,
    Math.max(1, Math.floor(numberEnv('WELSTORY_PROXY_MAX_ATTEMPTS', proxies.length)))
  )
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const proxy = nextProxy()
    if (!proxy) break

    try {
      proxyLog.info('welstory proxy request started', {
        proxy: proxy.id,
        attempt,
        maxAttempts
      })
      const response = await proxyFetch(input, init, proxy)

      if (isBlockedResponse(response) && attempt < maxAttempts) {
        markProxyBlocked(proxy, `HTTP ${response.status}`)
        await response.arrayBuffer().catch(() => undefined)
        continue
      }

      return response
    } catch (error) {
      lastError = error
      if (isNetworkFailure(error) && attempt < maxAttempts) {
        markProxyBlocked(proxy, error)
        continue
      }
      throw error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Welstory proxy request failed')
}
