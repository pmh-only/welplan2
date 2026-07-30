import type { RequestHandler } from './$types'
import {
  claimWebhookTestDelivery,
  deliverWebhookTest,
  WebhookDeliveryError
} from '$lib/server/webhook-delivery'
import { getWebhookSubscription } from '$lib/server/webhook-subscriptions'

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}

export const POST: RequestHandler = async ({ params }) => {
  const subscription = await getWebhookSubscription(params.id)
  if (!subscription) return json({ error: '웹훅 설정을 찾을 수 없습니다.' }, 404)
  const deliveryKey = await claimWebhookTestDelivery(subscription.id)
  if (!deliveryKey) return json({ error: '테스트 전송은 1분에 한 번만 실행할 수 있습니다.' }, 429)

  try {
    return json(await deliverWebhookTest(subscription, deliveryKey))
  } catch (error) {
    if (error instanceof WebhookDeliveryError) {
      return json({ error: error.message, responseStatus: error.responseStatus }, 502)
    }
    return json({ error: '테스트 메시지를 전송할 수 없습니다.' }, 502)
  }
}
