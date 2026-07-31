import { randomUUID } from 'node:crypto'
import type { RequestHandler } from './$types'
import { service } from '$lib/server/service'
import { deliverWebhookTest, WebhookDeliveryError } from '$lib/server/webhook-delivery'
import {
  assertWebhookRegistrationRequest,
  createWebhookSubscription,
  consumeWebhookRegistrationLimit,
  normalizeWebhookLegalAcceptance,
  normalizeWebhookSubscriptionConfig,
  WebhookValidationError
} from '$lib/server/webhook-subscriptions'

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function requestJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('content-length'))
  if (Number.isFinite(length) && length > 32_000) throw new WebhookValidationError('요청 데이터가 너무 큽니다.')
  try {
    return await request.json()
  } catch {
    throw new WebhookValidationError('JSON 요청 형식이 올바르지 않습니다.')
  }
}

async function validateRestaurants(value: unknown): Promise<void> {
  if (!value || typeof value !== 'object') return
  const restaurantIds = (value as { restaurantIds?: unknown }).restaurantIds
  if (!Array.isArray(restaurantIds)) return
  const unknownIds: string[] = []
  for (const id of restaurantIds) {
    if (typeof id !== 'string') continue
    if (!await service.getRestaurant(id).catch(() => null)) unknownIds.push(id)
  }
  if (unknownIds.length > 0) throw new WebhookValidationError('선택한 식당을 찾을 수 없습니다. 식당을 다시 선택해 주세요.')
}

export const POST: RequestHandler = async ({ request, getClientAddress, url }) => {
  try {
    assertWebhookRegistrationRequest(request, url.origin)
    if (!await consumeWebhookRegistrationLimit(getClientAddress())) {
      return json({ error: '웹훅을 너무 많이 등록했습니다. 잠시 후 다시 시도해 주세요.' }, 429)
    }
    const input = await requestJson(request)
    const legalAcceptance = normalizeWebhookLegalAcceptance(input)
    const config = normalizeWebhookSubscriptionConfig(input)
    await validateRestaurants(config)
    const testResult = await deliverWebhookTest(config, `registration:${randomUUID()}`)
    return json({ ...await createWebhookSubscription(config, legalAcceptance), testResult }, 201)
  } catch (error) {
    if (error instanceof WebhookValidationError) return json({ error: error.message }, 400)
    if (error instanceof WebhookDeliveryError) {
      return json({ error: error.message, responseStatus: error.responseStatus }, 502)
    }
    throw error
  }
}
