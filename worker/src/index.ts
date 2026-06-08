import '../../webapp/src/lib/server/env.js'
import { createServerLogger } from '../../webapp/src/lib/server/log.js'
import { createService } from '../../webapp/src/lib/server/service.js'
import { startPoller } from './poller.js'

const logger = createServerLogger('worker')

const service = createService({ allowRemoteFetch: true })
const poller = startPoller(service)

function gracefulShutdown(signal: string): void {
  logger.info('received shutdown signal', { signal })
  poller.stop()
  process.exit(0)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

logger.info('worker started', {
  pid: process.pid,
  node: process.version
})
