import '../../webapp/src/lib/server/env.js'
import { createServerLogger } from '../../webapp/src/lib/server/log.js'
import { createService } from '../../webapp/src/lib/server/service.js'
import { createIndexNowSubmitter } from './indexnow.js'
import { startPoller } from './poller.js'

const logger = createServerLogger('worker')
const indexNow = createIndexNowSubmitter()

const service = createService({
  allowRemoteFetch: true,
  onMenuDataUpdated: (event) => indexNow.notifyMenuDataUpdated(event)
})
const poller = startPoller(service)

let shuttingDown = false

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info('received shutdown signal', { signal })
  poller.stop()
  await indexNow.flush().catch((error) => {
    logger.warn('indexnow flush during shutdown failed', { error })
  })
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
