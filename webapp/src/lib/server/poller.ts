import { service } from './service.js'
import { createServerLogger } from './log.js'
import { menuScanDates, scanRestaurantMealInfo } from './menu-availability.js'

const POLL_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const syncLog = createServerLogger('sync')

let running = false

const yield_ = () => new Promise<void>((resolve) => setImmediate(resolve))

async function prefetch(): Promise<void> {
  if (running) {
    syncLog.debug('prefetch skipped because another run is active')
    return
  }
  running = true
  const startedAt = Date.now()

  try {
    const restaurants = await service.getRestaurants()
    if (restaurants.length === 0) {
      syncLog.info('prefetch skipped because no restaurants are cached')
      return
    }

    const dates = menuScanDates()
    let fetched = 0
    let skipped = 0
    let errors = 0

    syncLog.info('prefetch started', {
      restaurantCount: restaurants.length,
      dates
    })

    for (const restaurant of restaurants) {
      syncLog.info('prefetching restaurant', {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        vendor: restaurant.vendor
      })

      const result = await scanRestaurantMealInfo(restaurant, dates, { afterBatch: yield_ })
      fetched += result.fetchedBatchCount
      errors += result.errorCount

      syncLog.info('prefetched restaurant meal scan', {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        vendor: restaurant.vendor,
        mealTimeCount: result.mealTimeCount,
        fetchedBatchCount: result.fetchedBatchCount,
        datesWithMenus: result.datesWithMenus,
        errorCount: result.errorCount
      })

      if (result.datesWithMenus.length === 0) {
        skipped++
        syncLog.info('prefetch skipped restaurant without meal info', {
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          vendor: restaurant.vendor,
          dates
        })
      }
    }

    syncLog.info('prefetch completed', {
      fetched,
      skipped,
      errors,
      restaurantCount: restaurants.length,
      durationMs: Date.now() - startedAt
    })
  } finally {
    running = false
  }
}

export function startPoller(): void {
  prefetch()
  setInterval(prefetch, POLL_INTERVAL_MS)
}
