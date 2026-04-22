import { service } from './service.js'

const POLL_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

let running = false

function kstDateStr(offsetDays = 0): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  d.setDate(d.getDate() + offsetDays)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

const yield_ = () => new Promise<void>((resolve) => setImmediate(resolve))

async function prefetch(): Promise<void> {
  if (running) return
  running = true

  try {
    const restaurants = service.getUserSelectedRestaurants()
    if (restaurants.length === 0) return

    const dates = [kstDateStr(0), kstDateStr(1)]
    let fetched = 0

    for (const restaurant of restaurants) {
      let mealTimes
      try {
        mealTimes = await service.getMealTimes(restaurant.id)
      } catch {
        await yield_()
        continue
      }

      for (const date of dates) {
        for (const mt of mealTimes) {
          try {
            await service.getMenus(restaurant.id, date, mt.id)
            fetched++
          } catch {
            // ignore individual failures
          }
          // yield between each fetch so user requests can be processed
          await yield_()
        }
      }
    }

    console.log(
      `[poller] prefetched ${fetched} menus across ${restaurants.length} restaurants at ${new Date().toISOString()}`
    )
  } finally {
    running = false
  }
}

export function startPoller(): void {
  prefetch()
  setInterval(prefetch, POLL_INTERVAL_MS)
}
