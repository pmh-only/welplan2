import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Restaurant } from '@pmh-only/welplan2-model'
import { WelstoryPlusClient } from '../src/WelstoryPlusClient.js'

const restaurant: Restaurant = {
  id: 'REST000001',
  name: '테스트 식당',
  vendor: 'welstory'
}

function token(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
  return `header.${payload}.signature`
}

test('retries transient empty responses without logging in again', async () => {
  const originalFetch = globalThis.fetch
  const originalMaxAttempts = process.env.WELSTORY_REQUEST_MAX_ATTEMPTS
  const originalRetryDelay = process.env.WELSTORY_REQUEST_RETRY_DELAY_MS
  const originalWebshareToken = process.env.WEBSHARE_API_TOKEN
  let loginCount = 0
  let menuRequestCount = 0

  process.env.WELSTORY_REQUEST_MAX_ATTEMPTS = '4'
  process.env.WELSTORY_REQUEST_RETRY_DELAY_MS = '1'
  delete process.env.WEBSHARE_API_TOKEN
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/login')) {
      loginCount++
      return new Response('', { status: 200, headers: { Authorization: token() } })
    }

    menuRequestCount++
    if (menuRequestCount <= 2) return new Response('', { status: 200 })
    return Response.json({ data: { mealList: [] } })
  }

  try {
    const client = new WelstoryPlusClient({
      username: 'empty-response-test',
      password: 'password',
      deviceId: 'empty-response-device',
      baseUrl: 'https://empty-response.test'
    })

    assert.deepEqual(await client.getMenus(restaurant, '20260802', '2'), [])
    assert.equal(loginCount, 1)
    assert.equal(menuRequestCount, 3)
  } finally {
    globalThis.fetch = originalFetch
    if (originalMaxAttempts === undefined) delete process.env.WELSTORY_REQUEST_MAX_ATTEMPTS
    else process.env.WELSTORY_REQUEST_MAX_ATTEMPTS = originalMaxAttempts
    if (originalRetryDelay === undefined) delete process.env.WELSTORY_REQUEST_RETRY_DELAY_MS
    else process.env.WELSTORY_REQUEST_RETRY_DELAY_MS = originalRetryDelay
    if (originalWebshareToken === undefined) delete process.env.WEBSHARE_API_TOKEN
    else process.env.WEBSHARE_API_TOKEN = originalWebshareToken
  }
})

test('shares authentication and serializes requests across clients', async () => {
  const originalFetch = globalThis.fetch
  const originalWebshareToken = process.env.WEBSHARE_API_TOKEN
  let loginCount = 0
  let activeRequests = 0
  let maxActiveRequests = 0

  delete process.env.WEBSHARE_API_TOKEN
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/login')) {
      loginCount++
      return new Response('', { status: 200, headers: { Authorization: token() } })
    }

    activeRequests++
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
    await new Promise((resolve) => setTimeout(resolve, 5))
    activeRequests--
    return Response.json({ data: { mealList: [] } })
  }

  try {
    const options = {
      username: 'shared-session-test',
      password: 'password',
      deviceId: 'shared-session-device',
      baseUrl: 'https://shared-session.test'
    }
    const first = new WelstoryPlusClient(options)
    const second = new WelstoryPlusClient(options)

    await Promise.all([
      first.getMenus(restaurant, '20260802', '1'),
      second.getMenus(restaurant, '20260802', '2')
    ])

    assert.equal(loginCount, 1)
    assert.equal(maxActiveRequests, 1)
  } finally {
    globalThis.fetch = originalFetch
    if (originalWebshareToken === undefined) delete process.env.WEBSHARE_API_TOKEN
    else process.env.WEBSHARE_API_TOKEN = originalWebshareToken
  }
})

test('logs in again after repeated empty responses', async () => {
  const originalFetch = globalThis.fetch
  const originalMaxAttempts = process.env.WELSTORY_REQUEST_MAX_ATTEMPTS
  const originalRetryDelay = process.env.WELSTORY_REQUEST_RETRY_DELAY_MS
  const originalWebshareToken = process.env.WEBSHARE_API_TOKEN
  let loginCount = 0
  let menuRequestCount = 0

  process.env.WELSTORY_REQUEST_MAX_ATTEMPTS = '4'
  process.env.WELSTORY_REQUEST_RETRY_DELAY_MS = '1'
  delete process.env.WEBSHARE_API_TOKEN
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/login')) {
      loginCount++
      return new Response('', { status: 200, headers: { Authorization: token() } })
    }

    menuRequestCount++
    if (menuRequestCount <= 3) return new Response('', { status: 200 })
    return Response.json({ data: { mealList: [] } })
  }

  try {
    const client = new WelstoryPlusClient({
      username: 'relogin-test',
      password: 'password',
      deviceId: 'relogin-device',
      baseUrl: 'https://relogin.test'
    })

    assert.deepEqual(await client.getMenus(restaurant, '20260802', '2'), [])
    assert.equal(loginCount, 2)
    assert.equal(menuRequestCount, 4)
  } finally {
    globalThis.fetch = originalFetch
    if (originalMaxAttempts === undefined) delete process.env.WELSTORY_REQUEST_MAX_ATTEMPTS
    else process.env.WELSTORY_REQUEST_MAX_ATTEMPTS = originalMaxAttempts
    if (originalRetryDelay === undefined) delete process.env.WELSTORY_REQUEST_RETRY_DELAY_MS
    else process.env.WELSTORY_REQUEST_RETRY_DELAY_MS = originalRetryDelay
    if (originalWebshareToken === undefined) delete process.env.WEBSHARE_API_TOKEN
    else process.env.WEBSHARE_API_TOKEN = originalWebshareToken
  }
})

test('rejects an invalid restaurant ID before sending a request', async () => {
  const originalFetch = globalThis.fetch
  let fetchCount = 0
  globalThis.fetch = async () => {
    fetchCount++
    return Response.json({ data: { mealList: [] } })
  }

  try {
    const client = new WelstoryPlusClient({
      username: 'invalid-id-test',
      password: 'password',
      deviceId: 'invalid-id-device',
      baseUrl: 'https://invalid-id.test'
    })
    const invalidRestaurant = {
      ...restaurant,
      id: "REST000001' OR PG_SLEEP(15)--"
    }

    await assert.rejects(() => client.getMenus(invalidRestaurant, '20260802', '2'), /Invalid Welstory restaurant ID/)
    assert.equal(fetchCount, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('filters invalid restaurant IDs returned by Welstory', async () => {
  const originalFetch = globalThis.fetch
  const originalWebshareToken = process.env.WEBSHARE_API_TOKEN
  delete process.env.WEBSHARE_API_TOKEN
  globalThis.fetch = async (input) => {
    if (String(input).endsWith('/login')) {
      return new Response('', { status: 200, headers: { Authorization: token() } })
    }
    return Response.json({
      data: [
        { restaurantId: 'rest000001', restaurantName: '정상 식당' },
        { restaurantId: "REST000001' OR PG_SLEEP(15)--", restaurantName: '오염 식당' }
      ]
    })
  }

  try {
    const client = new WelstoryPlusClient({
      username: 'catalog-filter-test',
      password: 'password',
      deviceId: 'catalog-filter-device',
      baseUrl: 'https://catalog-filter.test'
    })

    assert.deepEqual(await client.searchRestaurants(''), [{
      id: 'REST000001',
      name: '정상 식당',
      vendor: 'welstory',
      path: undefined
    }])
  } finally {
    globalThis.fetch = originalFetch
    if (originalWebshareToken === undefined) delete process.env.WEBSHARE_API_TOKEN
    else process.env.WEBSHARE_API_TOKEN = originalWebshareToken
  }
})
