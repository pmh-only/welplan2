import type { Menu, Restaurant } from '@pmh-only/welplan2-model'
import { createService, CafeteriaService } from '../../webapp/src/lib/server/service.js'
import { createServerLogger } from '../../webapp/src/lib/server/log.js'
import {
  computeGalleryMenusForRestaurants,
  computeGalleryMenusForRestaurantDate,
  galleryRouteCacheKey,
  restaurantGalleryDateCacheKey
} from '../../webapp/src/lib/server/menu-page.js'
import { prewarmProxiedImage } from '../../webapp/src/lib/server/image-cache.js'
import { menuScanDates, scanRestaurantMealInfo } from './menu-availability.js'
import { DEFAULT_RESTAURANTS } from './defaults.js'
import { todayStr } from './utils.js'

const ACTIVE_PREFETCH_INTERVAL_MS = 10 * 60 * 1000
const FULL_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000
const ACTIVE_PREFETCH_DAYS = 2
const ALL_MEAL_TIME_ID = 'all'
const syncLog = createServerLogger('sync')

type PollerOptions = {
  activePollerIntervalMs?: number
  fullPollerIntervalMs?: number
  activePrefetchDays?: number
}

let activeRunning = false
let fullScanRunning = false

const yield_ = () => new Promise<void>((resolve) => setImmediate(resolve))

function uniqueRestaurants(restaurants: Restaurant[]): Restaurant[] {
  return [...new Map(restaurants.map((restaurant) => [restaurant.id, restaurant])).values()]
}

function sameRestaurantSet(a: Restaurant[], b: Restaurant[]): boolean {
  return restaurantSetId(a) === restaurantSetId(b)
}

function restaurantSetId(restaurants: Restaurant[]): string {
  return restaurants.map((restaurant) => restaurant.id).sort().join(',')
}

function normalizeIntervalMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeCount(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

async function prefetchMenuDetails(service: CafeteriaService, menu: Menu): Promise<boolean> {
  if (!(menu.vendor === 'welstory' && menu.hallNo && menu.courseType && menu.imageUrl)) return false

  try {
    await service.getMenuNutrientDetail(menu.restaurantId, menu.date, menu.mealTimeId, menu.hallNo, menu.courseType)
    return true
  } catch {
    return false
  }
}

async function prewarmMenuImages(menus: Menu[]): Promise<number> {
  let prewarmed = 0
  for (const menu of menus) {
    if (await prewarmProxiedImage(menu.imageUrl).catch(() => false)) prewarmed++
    await yield_()
  }
  return prewarmed
}

async function prefetchActiveRestaurants(service: CafeteriaService, activePrefetchDays: number): Promise<void> {
  if (activeRunning) {
    syncLog.debug('active prefetch skipped because another run is active')
    return
  }
  activeRunning = true
  const startedAt = Date.now()

  try {
    const restaurants = uniqueRestaurants(await service.getRestaurants())
    const defaultRestaurants = await service.hydrateRestaurants(DEFAULT_RESTAURANTS).catch(() => DEFAULT_RESTAURANTS)
    const dates = menuScanDates(todayStr(), activePrefetchDays)
    let menuBatches = 0
    let details = 0
    let errors = 0
    let precomputedPages = 0
    let prewarmedImages = 0

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
              if (await prefetchMenuDetails(service, menu)) details++
              await yield_()
            }
          } catch {
            errors++
          }
          await yield_()
        }
      }
    }

    const pageRestaurantGroups = sameRestaurantSet(defaultRestaurants, restaurants)
      ? [defaultRestaurants]
      : [defaultRestaurants, restaurants]

    for (const date of dates) {
      for (const group of pageRestaurantGroups) {
        try {
          const mealTimes = await service.getMealTimesForRestaurants(group)
          const data = await computeGalleryMenusForRestaurants(
            group,
            mealTimes,
            date,
            ALL_MEAL_TIME_ID,
            service
          )
          await service.setPrecomputedPage(galleryRouteCacheKey(group, date, ALL_MEAL_TIME_ID), data)
          prewarmedImages += await prewarmMenuImages(data.menus)
          precomputedPages++
        } catch {
          errors++
        }
        await yield_()
      }

      for (const restaurant of restaurants) {
        try {
          const mealTimes = await service.getMealTimes(restaurant.id)
          const data = await computeGalleryMenusForRestaurantDate(restaurant, mealTimes, date, {
            enrichNutrientDetails: true,
            service
          })
          await service.setPrecomputedPage(restaurantGalleryDateCacheKey(restaurant, date, true), data)
          prewarmedImages += await prewarmMenuImages(data.menus)
          precomputedPages++
        } catch {
          errors++
        }
        await yield_()
      }
    }

    syncLog.info('active prefetch completed', {
      restaurantCount: restaurants.length,
      dates,
      menuBatches,
      details,
      precomputedPages,
      prewarmedImages,
      errors,
      durationMs: Date.now() - startedAt
    })
  } finally {
    activeRunning = false
  }
}

async function prefetchAllAvailability(service: CafeteriaService): Promise<void> {
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

      const result = await scanRestaurantMealInfo(service, restaurant, dates, { afterBatch: yield_ })
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
          vendor: restaurant.vendor
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

export function startPoller(
  service: CafeteriaService = createService({ allowRemoteFetch: true }),
  options: PollerOptions = {}
): { stop: () => void } {
  const activePrefetchDays = normalizeCount(
    options.activePrefetchDays?.toString() ?? process.env.WORKER_ACTIVE_PREFETCH_DAYS,
    ACTIVE_PREFETCH_DAYS
  )
  const activeIntervalMs = normalizeIntervalMs(
    options.activePollerIntervalMs?.toString() ?? process.env.WORKER_ACTIVE_PREFETCH_INTERVAL_MS,
    ACTIVE_PREFETCH_INTERVAL_MS
  )
  const fullIntervalMs = normalizeIntervalMs(
    options.fullPollerIntervalMs?.toString() ?? process.env.WORKER_FULL_SCAN_INTERVAL_MS,
    FULL_SCAN_INTERVAL_MS
  )

  const timers: ReturnType<typeof setInterval>[] = []

  prefetchActiveRestaurants(service, activePrefetchDays).catch((error) => {
    syncLog.error('active prefetch failed', { error })
  })
  timers.push(setInterval(() => {
    prefetchActiveRestaurants(service, activePrefetchDays).catch((error) => {
      syncLog.error('active prefetch failed', { error })
    })
  }, activeIntervalMs))

  timers.push(setInterval(() => {
    prefetchAllAvailability(service).catch((error) => {
      syncLog.error('full prefetch failed', { error })
    })
  }, fullIntervalMs))

  syncLog.info('poller started', {
    activePrefetchDays,
    activePrefetchIntervalMs: activeIntervalMs,
    fullScanIntervalMs: fullIntervalMs
  })

  return {
    stop() {
      for (const timer of timers) clearInterval(timer)
      syncLog.info('poller stopped')
    }
  }
}
