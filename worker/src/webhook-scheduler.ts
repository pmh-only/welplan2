import type { CafeteriaService } from '../../webapp/src/lib/server/service.js'
import { createServerLogger } from '../../webapp/src/lib/server/log.js'
import {
  bindWebhookDeliveryPayload,
  claimWebhookDelivery,
  completeWebhookDelivery,
  deliverWebhookSubscription,
  dueWebhookSchedules,
  failWebhookDelivery,
  listRetryableWebhookSchedules,
  recordWebhookDeliveryPart,
  renewWebhookDeliveryClaim,
  webhookScheduleMealTypes,
  type DueWebhookSchedule
} from '../../webapp/src/lib/server/webhook-delivery.js'
import { listEnabledWebhookSubscriptions } from '../../webapp/src/lib/server/webhook-subscriptions.js'

const DEFAULT_CHECK_INTERVAL_MS = 30_000
const logger = createServerLogger('webhooks')

function intervalMs(): number {
  const parsed = Number(process.env.WEBHOOK_SCHEDULER_INTERVAL_MS)
  return Number.isFinite(parsed) && parsed >= 5_000 ? parsed : DEFAULT_CHECK_INTERVAL_MS
}

function isDisabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(process.env.WEBHOOK_SCHEDULER_DISABLED?.trim().toLowerCase() ?? '')
}

function publicOrigin(): string | undefined {
  const configured = process.env.ORIGIN ?? process.env.INDEXNOW_ORIGIN
  if (configured) {
    try {
      return new URL(configured).origin
    } catch {
      logger.warn('invalid webhook public origin; menu links will fail', { configuredOrigin: configured })
    }
  }
  logger.warn('webhook public origin is not configured; subscriptions with links will fail')
  return undefined
}

export function startWebhookScheduler(service: CafeteriaService): { stop: () => Promise<void> } {
  if (isDisabled()) {
    logger.info('webhook scheduler disabled')
    return { stop: async () => undefined }
  }

  const checkIntervalMs = intervalMs()
  const origin = publicOrigin()
  let stopped = false
  let running: Promise<void> | null = null

  const check = async () => {
    if (stopped || running) return
    running = (async () => {
      const subscriptions = await listEnabledWebhookSubscriptions()
      const now = new Date()
      const subscriptionsById = new Map(subscriptions.map((subscription) => [subscription.id, subscription]))
      const candidates = new Map<string, { subscriptionId: string; schedule: DueWebhookSchedule }>()
      for (const retry of await listRetryableWebhookSchedules(now.getTime())) {
        const subscription = subscriptionsById.get(retry.subscriptionId)
        if (subscription) {
          const mealTypes = webhookScheduleMealTypes(subscription, retry.scheduleId)
          if (mealTypes.length === 0) continue
          candidates.set(`${retry.subscriptionId}:${retry.scheduleDate}:${retry.scheduleId}`, {
            subscriptionId: retry.subscriptionId,
            schedule: { ...retry, mealTypes }
          })
        }
      }
      for (const subscription of subscriptions) {
        for (const schedule of dueWebhookSchedules(subscription, now)) {
          candidates.set(`${subscription.id}:${schedule.scheduleDate}:${schedule.scheduleId}`, {
            subscriptionId: subscription.id,
            schedule
          })
        }
      }

      for (const candidate of candidates.values()) {
        if (stopped) break
        const subscription = subscriptionsById.get(candidate.subscriptionId)
        if (!subscription) continue
        const schedule = candidate.schedule
        const claim = await claimWebhookDelivery(subscription.id, schedule)
        if (!claim) continue

        logger.info('webhook delivery started', {
          subscriptionId: subscription.id,
          platform: subscription.platform,
          scheduleId: schedule.scheduleId,
          scheduleDate: schedule.scheduleDate,
          menuDate: schedule.menuDate,
          attempt: claim.attempts
        })
        try {
          const result = await deliverWebhookSubscription(
            service,
            { ...subscription, mealTypes: schedule.mealTypes },
            claim.menuDate,
            origin,
            claim.key,
            {
              heartbeat: () => renewWebhookDeliveryClaim(claim),
              bindParts: (payloadHash) => bindWebhookDeliveryPayload(claim, payloadHash),
              onPartDelivered: (completedParts, responseStatus) =>
                recordWebhookDeliveryPart(claim, completedParts, responseStatus)
            }
          )
          await completeWebhookDelivery(claim, result)
          logger.info('webhook delivery completed', {
            subscriptionId: subscription.id,
            platform: subscription.platform,
            messageCount: result.messageCount,
            skipped: result.skipped,
            responseStatus: result.responseStatus
          })
        } catch (error) {
          await failWebhookDelivery(claim, error)
          logger.warn('webhook delivery failed', {
            subscriptionId: subscription.id,
            platform: subscription.platform,
            attempt: claim.attempts,
            error
          })
        }
      }
    })().catch((error) => {
      logger.error('webhook schedule check failed', { error })
    }).finally(() => {
      running = null
    })
    await running
  }

  check().catch((error) => logger.error('initial webhook schedule check failed', { error }))
  const timer = setInterval(() => {
    check().catch((error) => logger.error('webhook schedule check failed', { error }))
  }, checkIntervalMs)
  logger.info('webhook scheduler started', { checkIntervalMs, origin: origin ?? 'not-configured' })

  return {
    async stop() {
      stopped = true
      clearInterval(timer)
      await running
      logger.info('webhook scheduler stopped')
    }
  }
}
