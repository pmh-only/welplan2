import { service } from './service.js'
import { createServerLogger } from './log.js'
import { menuScanDates, scanRestaurantMealInfo } from './menu-availability.js'
import { DEFAULT_RESTAURANTS } from '$lib/defaults'
import type { Menu, Restaurant } from '$lib/types'
import { todayStr } from '$lib/utils'

const ACTIVE_PREFETCH_INTERVAL_MS = 10 * 60 * 1000
const FULL_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000
const ACTIVE_PREFETCH_DAYS = 2
const syncLog = createServerLogger('sync')

let activeRunning = false
let fullScanRunning = false

const yield_ = () => new Promise<void>((resolve) => setImmediate(resolve))

function uniqueRestaurants(restaurants: Restaurant[]): Restaurant[] {
  return [...new Map(restaurants.map((restaurant) => [restaurant.id, restaurant])).values()]
}

async function prefetchMenuDetails(menu: Menu): Promise<boolean> {
  if (!(menu.vendor === 'welstory' && menu.hallNo && menu.courseType && menu.imageUrl)) return false

  try {
    await service.getMenuNutrientDetail(
      menu.restaurantId,
      menu.date,
      menu.mealTimeId,
      menu.hallNo,
      menu.courseType
    )
    return true
  } catch {
    return false
  }
}

async function prefetchActiveRestaurants(): Promise<void> {
  if (activeRunning) {
    syncLog.debug('active prefetch skipped because another run is active')
    return
  }
  activeRunning = true
  const startedAt = Date.now()

  try {
    await service.getRestaurants()
    const defaultRestaurants = await service.hydrateRestaurants(DEFAULT_RESTAURANTS).catch(() => DEFAULT_RESTAURANTS)
    const restaurants = uniqueRestaurants([
      ...service.getUserSelectedRestaurants(),
      ...defaultRestaurants
    ])
    const dates = menuScanDates(todayStr(), ACTIVE_PREFETCH_DAYS)
    let menuBatches = 0
    let details = 0
    let errors = 0

    syncLog.info('active prefetch started', {
      restaurantCount: restaurants.length,
      dates
    })

    for (const restaurant of restaurants) {
      const mealTimes = await service.getMealTimes(restaurant.id).catch(() => {
        errors++
        return []
      })

      for (const date of dates) {
        for (const mealTime of mealTimes) {
          try {
            const menus = await service.getMenus(restaurant.id, date, mealTime.id)
            menuBatches++
            for (const menu of menus) {
              if (await prefetchMenuDetails(menu)) details++
              await yield_()
            }
          } catch {
            errors++
          }
          await yield_()
        }
      }
    }

    syncLog.info('active prefetch completed', {
      restaurantCount: restaurants.length,
      dates,
      menuBatches,
      details,
      errors,
      durationMs: Date.now() - startedAt
    })
  } finally {
    activeRunning = false
  }
}

async function prefetchAllAvailability(): Promise<void> {
  if (fullScanRunning) {
    syncLog.debug('full prefetch skipped because another run is active')
    return
  }
  fullScanRunning = true
  const startedAt = Date.now()

  try {
    const restaurants = await service.getRestaurants()
    if (restaurants.length === 0) {
      syncLog.info('full prefetch skipped because no restaurants are cached')
      return
    }

    const dates = menuScanDates()
    let fetched = 0
    let skipped = 0
    let errors = 0

    syncLog.info('full prefetch started', {
      restaurantCount: restaurants.length,
      dates
    })

    for (const restaurant of restaurants) {
      syncLog.info('full prefetching restaurant', {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        vendor: restaurant.vendor
      })

      const result = await scanRestaurantMealInfo(restaurant, dates, { afterBatch: yield_ })
      fetched += result.fetchedBatchCount
      errors += result.errorCount

      syncLog.info('full prefetched restaurant meal scan', {
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
        syncLog.info('full prefetch skipped restaurant without meal info', {
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          vendor: restaurant.vendor,
          dates
        })
      }
    }

    syncLog.info('full prefetch completed', {
      fetched,
      skipped,
      errors,
      restaurantCount: restaurants.length,
      durationMs: Date.now() - startedAt
    })
  } finally {
    fullScanRunning = false
  }
}

export function startPoller(): void {
  prefetchActiveRestaurants()
  setInterval(prefetchActiveRestaurants, ACTIVE_PREFETCH_INTERVAL_MS)
  setInterval(prefetchAllAvailability, FULL_SCAN_INTERVAL_MS)
}
