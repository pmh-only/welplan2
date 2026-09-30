import assert from 'node:assert/strict'
import test from 'node:test'
import { applyGetApiCors } from './api-cors.js'

test('allows cross-origin access to GET API and proxy responses', () => {
  const original = Response.json({ error: 'Not found' }, {
    status: 404,
    headers: { 'Cache-Control': 'no-store' }
  })
  const response = applyGetApiCors('GET', '/api/menu/live', original)
  const proxy = applyGetApiCors('GET', '/proxy/search', Response.json({}))

  assert.equal(response.status, 404)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(proxy.headers.get('access-control-allow-origin'), '*')
})

test('does not add CORS to webhook or non-GET API responses', () => {
  const webhook = applyGetApiCors('GET', '/api/webhooks/subscriptions/123', Response.json({}))
  const post = applyGetApiCors('POST', '/api/menu-reviews', Response.json({}))
  const proxyPost = applyGetApiCors('POST', '/proxy/restaurants/select', Response.json({}))

  assert.equal(webhook.headers.get('access-control-allow-origin'), null)
  assert.equal(post.headers.get('access-control-allow-origin'), null)
  assert.equal(proxyPost.headers.get('access-control-allow-origin'), null)
})
