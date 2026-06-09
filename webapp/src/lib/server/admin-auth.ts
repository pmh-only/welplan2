import { randomBytes } from 'node:crypto'
import type { Cookies } from '@sveltejs/kit'
import './env.js'

const SESSION_COOKIE = 'welplan_admin_session'
const STATE_COOKIE = 'welplan_admin_oidc_state'
const DEFAULT_SCOPES = 'openid profile email'
const DEFAULT_RESPONSE_MODE = 'query'
const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const STATE_TTL_MS = 10 * 60 * 1000

type OidcDiscovery = {
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint?: string
  issuer?: string
}

type OidcTokenResponse = {
  access_token?: string
  id_token?: string
  token_type?: string
  error?: string
  error_description?: string
}

type OidcState = {
  state: string
  nonce: string
  returnTo: string
  createdAt: number
}

type Session = {
  user: NonNullable<App.Locals['adminUser']>
  expiresAt: number
}

let discoveryPromise: Promise<OidcDiscovery> | undefined
const sessions = new Map<string, Session>()

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for admin OIDC authentication`)
  return value
}

function cookieOptions(maxAge: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge
  }
}

function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decodeJson<T>(value: string): T | undefined {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T
  } catch {
    return undefined
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const [, payload] = token.split('.')
  return payload ? decodeJson<Record<string, unknown>>(payload) : undefined
}

function stringClaim(claims: Record<string, unknown>, name: string): string | undefined {
  const value = claims[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function userFromClaims(claims: Record<string, unknown>): NonNullable<App.Locals['adminUser']> {
  const id = stringClaim(claims, 'sub') ?? stringClaim(claims, 'email') ?? 'admin'
  return {
    id,
    name: stringClaim(claims, 'name') ?? stringClaim(claims, 'preferred_username'),
    email: stringClaim(claims, 'email')
  }
}

function normalizeReturnTo(returnTo: string | null): string {
  if (!returnTo?.startsWith('/admin')) return '/admin'
  if (returnTo.startsWith('/admin/login') || returnTo.startsWith('/admin/callback')) return '/admin'
  return returnTo
}

export function adminOidcConfigured(): boolean {
  return Boolean(
    (process.env.ADMIN_OIDC_DISCOVERY_URL?.trim() || process.env.ADMIN_OIDC_ISSUER_URL?.trim()) &&
      process.env.ADMIN_OIDC_CLIENT_ID?.trim()
  )
}

export function adminRedirectUri(origin: string): string {
  return process.env.ADMIN_OIDC_REDIRECT_URI?.trim() || `${origin}/admin/callback`
}

export function redirectResponse(url: string | URL): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString() }
  })
}

async function discoverOidc(): Promise<OidcDiscovery> {
  const discoveryUrl = process.env.ADMIN_OIDC_DISCOVERY_URL?.trim()
  const issuerUrl = process.env.ADMIN_OIDC_ISSUER_URL?.trim().replace(/\/+$/, '')
  const configurationUrl = discoveryUrl || `${issuerUrl ?? requiredEnv('ADMIN_OIDC_ISSUER_URL')}/.well-known/openid-configuration`
  discoveryPromise ??= fetch(configurationUrl).then(async (response) => {
    if (!response.ok) throw new Error(`OIDC discovery failed with status ${response.status}`)
    const discovery = await response.json() as Partial<OidcDiscovery>
    if (!discovery.authorization_endpoint || !discovery.token_endpoint) {
      throw new Error('OIDC discovery is missing required endpoints')
    }
    return discovery as OidcDiscovery
  })
  return discoveryPromise
}

export async function createAdminLoginRedirect(cookies: Cookies, url: URL): Promise<Response> {
  const discovery = await discoverOidc()
  const clientId = requiredEnv('ADMIN_OIDC_CLIENT_ID')
  const state: OidcState = {
    state: randomToken(),
    nonce: randomToken(),
    returnTo: normalizeReturnTo(url.searchParams.get('returnTo')),
    createdAt: Date.now()
  }

  cookies.set(STATE_COOKIE, encodeJson(state), cookieOptions(Math.floor(STATE_TTL_MS / 1000)))

  const authorizeUrl = new URL(discovery.authorization_endpoint)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', adminRedirectUri(url.origin))
  authorizeUrl.searchParams.set('scope', process.env.ADMIN_OIDC_SCOPES?.trim() || DEFAULT_SCOPES)
  authorizeUrl.searchParams.set('response_mode', process.env.ADMIN_OIDC_RESPONSE_MODE?.trim() || DEFAULT_RESPONSE_MODE)
  authorizeUrl.searchParams.set('state', state.state)
  authorizeUrl.searchParams.set('nonce', state.nonce)

  return redirectResponse(authorizeUrl)
}

async function exchangeCode(code: string, origin: string): Promise<OidcTokenResponse> {
  const discovery = await discoverOidc()
  const clientId = requiredEnv('ADMIN_OIDC_CLIENT_ID')
  const clientSecret = process.env.ADMIN_OIDC_CLIENT_SECRET?.trim()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: adminRedirectUri(origin)
  })
  const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' })

  if (clientSecret) {
    headers.set('Authorization', `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`)
  } else {
    body.set('client_id', clientId)
  }

  const response = await fetch(discovery.token_endpoint, { method: 'POST', headers, body })
  const tokenResponse = await response.json() as OidcTokenResponse
  if (!response.ok || tokenResponse.error) {
    throw new Error(tokenResponse.error_description || tokenResponse.error || `OIDC token exchange failed with status ${response.status}`)
  }
  return tokenResponse
}

async function loadUser(tokenResponse: OidcTokenResponse, nonce: string): Promise<NonNullable<App.Locals['adminUser']>> {
  const discovery = await discoverOidc()

  if (tokenResponse.access_token && discovery.userinfo_endpoint) {
    const response = await fetch(discovery.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
    })
    if (response.ok) return userFromClaims(await response.json() as Record<string, unknown>)
  }

  if (!tokenResponse.id_token) throw new Error('OIDC response did not include a usable user identity')
  const claims = decodeJwtPayload(tokenResponse.id_token)
  if (!claims) throw new Error('OIDC id_token payload could not be decoded')
  const tokenNonce = stringClaim(claims, 'nonce')
  if (tokenNonce && tokenNonce !== nonce) throw new Error('OIDC nonce mismatch')
  return userFromClaims(claims)
}

export async function completeAdminLogin(cookies: Cookies, url: URL): Promise<string> {
  const expected = decodeJson<OidcState>(cookies.get(STATE_COOKIE) ?? '')
  cookies.delete(STATE_COOKIE, { path: '/' })

  if (!expected || Date.now() - expected.createdAt > STATE_TTL_MS) throw new Error('OIDC login state expired')
  if (url.searchParams.get('state') !== expected.state) throw new Error('OIDC login state mismatch')

  const code = url.searchParams.get('code')
  if (!code) throw new Error(url.searchParams.get('error_description') || url.searchParams.get('error') || 'OIDC callback missing code')

  const user = await loadUser(await exchangeCode(code, url.origin), expected.nonce)
  const sessionId = randomToken()
  sessions.set(sessionId, { user, expiresAt: Date.now() + SESSION_TTL_MS })
  cookies.set(SESSION_COOKIE, sessionId, cookieOptions(Math.floor(SESSION_TTL_MS / 1000)))
  return expected.returnTo
}

export function getAdminUser(cookies: Cookies): NonNullable<App.Locals['adminUser']> | undefined {
  const sessionId = cookies.get(SESSION_COOKIE)
  if (!sessionId) return undefined
  const session = sessions.get(sessionId)
  if (!session) return undefined
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId)
    cookies.delete(SESSION_COOKIE, { path: '/' })
    return undefined
  }
  return session.user
}

export function clearAdminSession(cookies: Cookies): void {
  const sessionId = cookies.get(SESSION_COOKIE)
  if (sessionId) sessions.delete(sessionId)
  cookies.delete(SESSION_COOKIE, { path: '/' })
}
