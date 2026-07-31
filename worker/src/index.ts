import '../../webapp/src/lib/server/env.js'
import { createServerLogger } from '../../webapp/src/lib/server/log.js'
import { createService, type CafeteriaService } from '../../webapp/src/lib/server/service.js'
import { createIndexNowSubmitter } from './indexnow.js'
import { startPoller } from './poller.js'
import { startWebhookScheduler } from './webhook-scheduler.js'
import { notifyWorkerProblem } from './worker-alerts.js'

const logger = createServerLogger('worker')
const indexNow = createIndexNowSubmitter()
const alertService: CafeteriaService = createService()
const service = createService({
  allowRemoteFetch: true,
  onMenuDataUpdated: (event) => indexNow.notifyMenuDataUpdated(event),
  onRestaurantSyncProblem: async (event) => {
    await notifyWorkerProblem(alertService, {
      summary: '전체 식당 목록을 공급사에서 가져오지 못했습니다.',
      totalRestaurants: event.restaurantCount,
      details: event.sources.map(({ source, error }) => (
        `공급사 소스 ${source}: ${error instanceof Error ? error.message : String(error ?? 'empty response')}`
      ))
    })
  }
})
const poller = startPoller(service)
const webhookScheduler = startWebhookScheduler(service)

let shuttingDown = false

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info('received shutdown signal', { signal })
  poller.stop()
  await Promise.all([
    webhookScheduler.stop().catch((error) => {
      logger.warn('webhook scheduler shutdown failed', { error })
    }),
    indexNow.flush().catch((error) => {
      logger.warn('indexnow flush during shutdown failed', { error })
    })
  ])
  process.exit(0)
}

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').catch((error) => {
    logger.error('shutdown failed', { error })
    process.exit(1)
  })
})
process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').catch((error) => {
    logger.error('shutdown failed', { error })
    process.exit(1)
  })
})

logger.info('worker started', {
  pid: process.pid,
  node: process.version
})
