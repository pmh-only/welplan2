import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import type { Cookies } from '@sveltejs/kit'
import {
  completeSlackInstall,
  consumeSlackOAuthResult,
  createSlackInstallRedirect
} from './slack-webhook-oauth.js'

const originalClientId = process.env.SLACK_CLIENT_ID
const originalClientSecret = process.env.SLACK_CLIENT_SECRET
const originalRedirectUri = process.env.SLACK_OAUTH_REDIRECT_URI
const originalFetch = globalThis.fetch

function mockCookies(): Cookies {
  const values = new Map<string, string>()
  return {
    get: (name: string) => values.get(name),
    getAll: () => [...values].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => { values.set(name, value) },
    delete: (name: string) => { values.delete(name) },
    serialize: () => ''
  } as unknown as Cookies
}

after(() => {
  if (originalClientId === undefined) delete process.env.SLACK_CLIENT_ID
  else process.env.SLACK_CLIENT_ID = originalClientId
  if (originalClientSecret === undefined) delete process.env.SLACK_CLIENT_SECRET
  else process.env.SLACK_CLIENT_SECRET = originalClientSecret
  if (originalRedirectUri === undefined) delete process.env.SLACK_OAUTH_REDIRECT_URI
  else process.env.SLACK_OAUTH_REDIRECT_URI = originalRedirectUri
  globalThis.fetch = originalFetch
})

test('installs a Slack incoming webhook through OAuth v2', async () => {
  process.env.SLACK_CLIENT_ID = 'client-id'
  process.env.SLACK_CLIENT_SECRET = 'client-secret'
  process.env.SLACK_OAUTH_REDIRECT_URI = 'https://welplan.example.com/webhooks/slack/callback'
  const cookies = mockCookies()

  const installResponse = createSlackInstallRedirect(
    cookies,
    new URL('https://welplan.example.com/webhooks/slack/install?returnTo=%2Fwebhooks')
  )
  const authorizeUrl = new URL(installResponse.headers.get('location') ?? '')
  assert.equal(authorizeUrl.origin, 'https://slack.com')
  assert.equal(authorizeUrl.pathname, '/oauth/v2/authorize')
  assert.equal(authorizeUrl.searchParams.get('client_id'), 'client-id')
  assert.equal(authorizeUrl.searchParams.get('scope'), 'incoming-webhook')
  assert.equal(authorizeUrl.searchParams.get('redirect_uri'), process.env.SLACK_OAUTH_REDIRECT_URI)
  const state = authorizeUrl.searchParams.get('state')
  assert.ok(state)

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://slack.com/api/oauth.v2.access')
    assert.equal(init?.method, 'POST')
    const body = init?.body as URLSearchParams
    assert.equal(body.has('client_id'), false)
    assert.equal(body.has('client_secret'), false)
    assert.equal(body.get('code'), 'oauth-code')
    const headers = new Headers(init?.headers)
    assert.equal(
      Buffer.from((headers.get('authorization') ?? '').replace(/^Basic /, ''), 'base64').toString('utf8'),
      'client-id:client-secret'
    )
    return Response.json({
      ok: true,
      access_token: 'discarded-token',
      team: { name: 'Welplan Team' },
      incoming_webhook: {
        channel: '#cafeteria',
        channel_id: 'C123',
        url: 'https://hooks.slack.com/services/T123/B123/secret'
      }
    })
  }

  const callbackResponse = await completeSlackInstall(
    cookies,
    new URL(`https://welplan.example.com/webhooks/slack/callback?code=oauth-code&state=${state}`)
  )
  assert.equal(callbackResponse.headers.get('location'), '/webhooks?slack=connected')
  assert.deepEqual(
    consumeSlackOAuthResult(cookies, new URL('https://welplan.example.com/webhooks?slack=connected')),
    {
      configured: true,
      webhookUrl: 'https://hooks.slack.com/services/T123/B123/secret',
      channel: '#cafeteria',
      teamName: 'Welplan Team'
    }
  )
})
