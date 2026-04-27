import { service } from './service.js'
import { createServerLogger } from './log.js'

const POLL_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const syncLog = createServerLogger('sync')

let running = false

function kstDateStr(offsetDays = 0): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  d.setDate(d.getDate() + offsetDays)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

const yield_ = () => new Promise<void>((resolve) => setImmediate(resolve))

async function prefetch(): Promise<void> {
  if (running) {
    syncLog.debug('prefetch skipped because another run is active')
    return
  }
  running = true
  const startedAt = Date.now()

  try {
    const restaurants = service.getUserSelectedRestaurants()
    if (restaurants.length === 0) {
      syncLog.info('prefetch skipped because no restaurants are selected')
      return
    }

    const dates = [kstDateStr(0), kstDateStr(1)]
    let fetched = 0

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

      let mealTimes
      try {
        mealTimes = await service.getMealTimes(restaurant.id)
        syncLog.info('loaded meal times for prefetch', {
          restaurantId: restaurant.id,
          mealTimeCount: mealTimes.length
        })
      } catch (error) {
        syncLog.warn('prefetch meal-time load failed', {
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          error
        })
        await yield_()
        continue
      }

      for (const date of dates) {
        for (const mt of mealTimes) {
          try {
            const menus = await service.getMenus(restaurant.id, date, mt.id)
            fetched++
            syncLog.info('prefetched menu batch', {
              restaurantId: restaurant.id,
              restaurantName: restaurant.name,
              date,
              mealTimeId: mt.id,
              mealTimeName: mt.name,
              menuCount: menus.length
            })
          } catch (error) {
            syncLog.warn('prefetch menu batch failed', {
              restaurantId: restaurant.id,
              restaurantName: restaurant.name,
              date,
              mealTimeId: mt.id,
              mealTimeName: mt.name,
              error
            })
          }
          // yield between each fetch so user requests can be processed
          await yield_()
        }
      }
    }

    syncLog.info('prefetch completed', {
      fetched,
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
