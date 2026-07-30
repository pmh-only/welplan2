import type { RequestHandler } from './$types'
import { service } from '$lib/server/service'
import {
  deleteWebhookSubscriptionById,
  getLatestWebhookDelivery,
  getWebhookSubscription,
  updateWebhookSubscriptionById,
  WebhookValidationError
} from '$lib/server/webhook-subscriptions'

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function enrichedSubscription(id: string) {
  const subscription = await getWebhookSubscription(id)
  if (!subscription) return null
  const restaurants = (await Promise.all(
    subscription.restaurantIds.map((restaurantId) => service.getRestaurant(restaurantId).catch(() => null))
  )).filter((restaurant) => restaurant !== null)
  const lastDelivery = await getLatestWebhookDelivery(id)
  return { ...subscription, restaurants, lastDelivery }
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
  if (restaurantIds.length > 20) throw new WebhookValidationError('식당은 최대 20개까지 선택할 수 있습니다.')
  for (const id of new Set(restaurantIds)) {
    if (typeof id === 'string' && !await service.getRestaurant(id).catch(() => null)) {
      throw new WebhookValidationError('선택한 식당을 찾을 수 없습니다. 식당을 다시 선택해 주세요.')
    }
  }
}

export const GET: RequestHandler = async ({ params }) => {
  const subscription = await enrichedSubscription(params.id)
  return subscription ? json(subscription) : json({ error: '웹훅 설정을 찾을 수 없습니다.' }, 404)
}

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    if (!await getWebhookSubscription(params.id)) {
      return json({ error: '웹훅 설정을 찾을 수 없습니다.' }, 404)
    }
    const input = await requestJson(request)
    await validateRestaurants(input)
    const updated = await updateWebhookSubscriptionById(params.id, input)
    if (!updated) return json({ error: '웹훅 설정을 찾을 수 없습니다.' }, 404)
    return json(await enrichedSubscription(params.id))
  } catch (error) {
    if (error instanceof WebhookValidationError) return json({ error: error.message }, 400)
    throw error
  }
}

export const DELETE: RequestHandler = async ({ params }) => {
  const deleted = await deleteWebhookSubscriptionById(params.id)
  if (deleted) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  return json({ error: '웹훅 설정을 찾을 수 없습니다.' }, 404)
}
