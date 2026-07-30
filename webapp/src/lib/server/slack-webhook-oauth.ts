import { randomBytes } from 'node:crypto'
import type { Cookies } from '@sveltejs/kit'
import './env.js'

const STATE_COOKIE = 'welplan_slack_oauth_state'
const RESULT_COOKIE = 'welplan_slack_oauth_result'
const STATE_TTL_MS = 10 * 60 * 1000
const RESULT_TTL_SECONDS = 5 * 60

type SlackOAuthState = {
  state: string
  returnTo: string
  createdAt: number
}

type SlackOAuthResponse = {
  ok?: boolean
  error?: string
  team?: { id?: string; name?: string }
  incoming_webhook?: {
    channel?: string
    channel_id?: string
    url?: string
  }
}

export type SlackOAuthPageResult = {
  configured: boolean
  webhookUrl?: string
  channel?: string
  teamName?: string
  error?: string
}

function cookieOptions(path: string, maxAge: number) {
  return {
    path,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge
  }
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

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for Slack OAuth`)
  return value
}

function redirectResponse(location: string | URL): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location.toString(), 'Cache-Control': 'no-store' }
  })
}

function redirectUri(origin: string): string {
  return process.env.SLACK_OAUTH_REDIRECT_URI?.trim() || `${origin}/webhooks/slack/callback`
}

function normalizeReturnTo(value: string | null): string {
  if (!value) return '/webhooks'
  return /^\/webhooks\/[0-9a-f-]{36}$/i.test(value) ? value : '/webhooks'
}

function resultLocation(returnTo: string, status: 'connected' | 'failed'): string {
  const separator = returnTo.includes('?') ? '&' : '?'
  return `${returnTo}${separator}slack=${status}`
}

function setResult(cookies: Cookies, result: Omit<SlackOAuthPageResult, 'configured'>): void {
  cookies.set(RESULT_COOKIE, encodeJson(result), cookieOptions('/webhooks', RESULT_TTL_SECONDS))
}

export function slackOAuthConfigured(): boolean {
  return Boolean(process.env.SLACK_CLIENT_ID?.trim() && process.env.SLACK_CLIENT_SECRET?.trim())
}

export function createSlackInstallRedirect(cookies: Cookies, url: URL): Response {
  if (!slackOAuthConfigured()) {
    setResult(cookies, { error: 'Slack OAuth 앱 설정이 완료되지 않았습니다.' })
    return redirectResponse(resultLocation(normalizeReturnTo(url.searchParams.get('returnTo')), 'failed'))
  }

  const oauthState: SlackOAuthState = {
    state: randomBytes(32).toString('base64url'),
    returnTo: normalizeReturnTo(url.searchParams.get('returnTo')),
    createdAt: Date.now()
  }
  cookies.set(STATE_COOKIE, encodeJson(oauthState), cookieOptions('/webhooks/slack', Math.floor(STATE_TTL_MS / 1000)))

  const authorizeUrl = new URL('https://slack.com/oauth/v2/authorize')
  authorizeUrl.searchParams.set('client_id', requiredEnv('SLACK_CLIENT_ID'))
  authorizeUrl.searchParams.set('scope', 'incoming-webhook')
  authorizeUrl.searchParams.set('redirect_uri', redirectUri(url.origin))
  authorizeUrl.searchParams.set('state', oauthState.state)
  return redirectResponse(authorizeUrl)
}

async function exchangeCode(code: string, origin: string): Promise<SlackOAuthResponse> {
  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${requiredEnv('SLACK_CLIENT_ID')}:${requiredEnv('SLACK_CLIENT_SECRET')}`).toString('base64')}`
    },
    body: new URLSearchParams({
      code,
      redirect_uri: redirectUri(origin)
    })
  })
  const result = await response.json() as SlackOAuthResponse
  if (!response.ok || !result.ok) throw new Error(result.error || `Slack OAuth HTTP ${response.status}`)
  return result
}

export async function completeSlackInstall(cookies: Cookies, url: URL): Promise<Response> {
  const expected = decodeJson<SlackOAuthState>(cookies.get(STATE_COOKIE) ?? '')
  cookies.delete(STATE_COOKIE, { path: '/webhooks/slack' })
  const returnTo = expected?.returnTo ?? '/webhooks'

  try {
    if (!expected || Date.now() - expected.createdAt > STATE_TTL_MS) throw new Error('Slack 연결 요청이 만료되었습니다.')
    if (url.searchParams.get('state') !== expected.state) throw new Error('Slack 연결 요청을 확인할 수 없습니다.')
    const code = url.searchParams.get('code')
    if (!code) throw new Error(url.searchParams.get('error') === 'access_denied' ? 'Slack 연결을 취소했습니다.' : 'Slack 인증 코드가 없습니다.')

    const result = await exchangeCode(code, url.origin)
    const webhookUrl = result.incoming_webhook?.url
    if (!webhookUrl) throw new Error('Slack이 Incoming Webhook URL을 반환하지 않았습니다.')
    const parsedUrl = new URL(webhookUrl)
    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'hooks.slack.com') {
      throw new Error('Slack이 올바르지 않은 Webhook URL을 반환했습니다.')
    }

    setResult(cookies, {
      webhookUrl,
      channel: result.incoming_webhook?.channel,
      teamName: result.team?.name
    })
    return redirectResponse(resultLocation(returnTo, 'connected'))
  } catch (error) {
    setResult(cookies, { error: error instanceof Error ? error.message : 'Slack 연결에 실패했습니다.' })
    return redirectResponse(resultLocation(returnTo, 'failed'))
  }
}

export function consumeSlackOAuthResult(cookies: Cookies, url: URL): SlackOAuthPageResult {
  const configured = slackOAuthConfigured()
  if (!url.searchParams.has('slack')) return { configured }
  const result = decodeJson<Omit<SlackOAuthPageResult, 'configured'>>(cookies.get(RESULT_COOKIE) ?? '')
  cookies.delete(RESULT_COOKIE, { path: '/webhooks' })
  return { configured, ...result }
}
