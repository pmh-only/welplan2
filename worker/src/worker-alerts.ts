import type { CafeteriaService } from '../../webapp/src/lib/server/service.js'
import { deliverDiscordWorkerAlert, WebhookDeliveryError } from '../../webapp/src/lib/server/webhook-delivery.js'
import { createServerLogger } from '../../webapp/src/lib/server/log.js'

const alertLog = createServerLogger('worker-alert')
const MAX_ALERT_ATTEMPTS = 3

export type WorkerRestaurantProblem = {
  id: string
  name: string
  vendor: string
  mealTimeCount: number
  fetchedBatchCount: number
  expectedBatchCount: number
  errorCount: number
}

export type WorkerProblem = {
  summary: string
  totalRestaurants: number
  dates?: string[]
  restaurants?: WorkerRestaurantProblem[]
  details?: string[]
  error?: unknown
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : ''
}

export function workerProblemMessage(problem: WorkerProblem): string {
  const restaurants = problem.restaurants ?? []
  const visible = restaurants.slice(0, 20)
  const lines = [
    '🚨 **Welplan worker 데이터 수집 오류**',
    problem.summary
  ]
  if (problem.restaurants) lines.push(`영향 식당: **${restaurants.length} / ${problem.totalRestaurants}**`)
  else if (problem.totalRestaurants > 0) lines.push(`수집된 식당: **${problem.totalRestaurants}**`)
  if (problem.dates?.length) lines.push(`조회 기간: ${problem.dates[0]} ~ ${problem.dates.at(-1)}`)
  const detail = errorMessage(problem.error)
  if (detail) lines.push(`오류: ${detail.slice(0, 500)}`)
  if (problem.details?.length) lines.push(...problem.details.map((item) => `- ${item}`))
  if (visible.length) {
    lines.push('', ...visible.map((restaurant) => (
      `- **${restaurant.name}** (${restaurant.vendor}/${restaurant.id}): ` +
      `식사시간 ${restaurant.mealTimeCount}, 배치 ${restaurant.fetchedBatchCount}/${restaurant.expectedBatchCount}, 오류 ${restaurant.errorCount}`
    )))
  }
  if (restaurants.length > visible.length) lines.push(`- 그 외 ${restaurants.length - visible.length}개 식당`)
  lines.push('', `발생 시각: ${new Date().toISOString()}`)
  return lines.join('\n')
}

export async function notifyWorkerProblem(service: CafeteriaService, problem: WorkerProblem): Promise<boolean> {
  try {
    const settings = await service.getWorkerProblemAlertSettings()
    if (!settings.enabled || !settings.discordWebhookUrl) return false
    const deliveryKey = `worker-problem:${Date.now()}`
    for (let attempt = 1; attempt <= MAX_ALERT_ATTEMPTS; attempt++) {
      try {
        await deliverDiscordWorkerAlert(
          settings.discordWebhookUrl,
          workerProblemMessage(problem),
          deliveryKey,
          settings.discordRoleId
        )
        alertLog.info('worker problem alert delivered', {
          totalRestaurants: problem.totalRestaurants,
          affectedRestaurants: problem.restaurants?.length ?? 0,
          attempt
        })
        return true
      } catch (error) {
        const status = error instanceof WebhookDeliveryError ? error.responseStatus : undefined
        const retryable = status === undefined || status === 408 || status === 429 || status >= 500
        if (!retryable || attempt === MAX_ALERT_ATTEMPTS) throw error
        const retryAfterMs = error instanceof WebhookDeliveryError ? error.retryAfterMs : undefined
        await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterMs ?? attempt * 1000, 30_000)))
      }
    }
    return false
  } catch (error) {
    alertLog.error('worker problem alert delivery failed', { error })
    return false
  }
}
