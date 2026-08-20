import assert from 'node:assert/strict'
import test from 'node:test'
import type { MealTime, Menu, Restaurant } from '@pmh-only/welplan2-model'
import { handleMcpRequest, MCP_PROTOCOL_VERSION, type McpService } from './mcp.js'

const restaurant: Restaurant = { id: 'REST-1', name: 'Test Hall', vendor: 'welstory', path: ['Campus'] }
const mealTime: MealTime = { id: '2', name: 'Lunch', type: 'lunch' }
const menu: Menu = {
  id: 'menu-1',
  name: 'Bibimbap',
  date: '20260820',
  mealTimeId: mealTime.id,
  restaurantId: restaurant.id,
  vendor: restaurant.vendor,
  components: [{ name: 'Rice' }],
  nutrition: { calories: 650 },
  isTakeOut: false
}

const service: McpService = {
  searchRestaurants: async () => [restaurant],
  getRestaurant: async (id) => id === restaurant.id ? restaurant : null,
  getMealTimes: async () => [mealTime],
  getMenus: async () => [menu]
}

function mcpRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://welplan.example/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers
    },
    body: JSON.stringify(body)
  })
}

test('handles initialize as stateless Streamable HTTP JSON', async () => {
  const result = await handleMcpRequest(mcpRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '1' } }
  }), service, 'https://welplan.example')
  const body = await result.json()

  assert.equal(result.status, 200)
  assert.equal(result.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.equal(result.headers.get('mcp-session-id'), null)
  assert.equal(body.result.protocolVersion, MCP_PROTOCOL_VERSION)
  assert.deepEqual(body.result.capabilities, { tools: { listChanged: false } })
})

test('lists the restaurant search and daily menu tools', async () => {
  const result = await handleMcpRequest(mcpRequest({ jsonrpc: '2.0', id: 'tools', method: 'tools/list' }, {
    'MCP-Protocol-Version': MCP_PROTOCOL_VERSION
  }), service, 'https://welplan.example')
  const body = await result.json()

  assert.deepEqual(body.result.tools.map((tool: { name: string }) => tool.name), [
    'search_restaurants',
    'get_restaurant_menu'
  ])
})

test('calls search and menu tools with structured data', async () => {
  const searchResponse = await handleMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_restaurants', arguments: { query: 'Test' } }
  }), service, 'https://welplan.example')
  const search = await searchResponse.json()
  assert.equal(search.result.structuredContent.restaurants[0].id, restaurant.id)

  const menuResponse = await handleMcpRequest(mcpRequest({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'get_restaurant_menu',
      arguments: { vendor: restaurant.vendor, restaurantId: restaurant.id, date: '2026-08-20' }
    }
  }), service, 'https://welplan.example')
  const menuResult = await menuResponse.json()
  assert.equal(menuResult.result.structuredContent.date, '20260820')
  assert.equal(menuResult.result.structuredContent.meals[0].menus[0].name, menu.name)
})

test('handles notifications, CORS, and content negotiation', async () => {
  const notification = await handleMcpRequest(mcpRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }), service, 'https://welplan.example')
  assert.equal(notification.status, 202)

  const preflight = await handleMcpRequest(new Request('https://welplan.example/mcp', { method: 'OPTIONS' }), service, 'https://welplan.example')
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /MCP-Protocol-Version/)

  const unacceptable = mcpRequest({ jsonrpc: '2.0', id: 4, method: 'ping' }, { Accept: 'application/json' })
  assert.equal((await handleMcpRequest(unacceptable, service, 'https://welplan.example')).status, 406)
})
