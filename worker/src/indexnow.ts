import type { MenuDataUpdatedEvent } from '../../webapp/src/lib/server/service.js'
import {
  buildIndexNowMenuUrls,
  readIndexNowConfig
} from '../../webapp/src/lib/server/indexnow.js'
import { createServerLogger } from '../../webapp/src/lib/server/log.js'

const DEFAULT_DEBOUNCE_MS = 5000
const MAX_INDEXNOW_URLS = 10000

const syncLog = createServerLogger('sync')

type SubmitPayload = {
  host: string
  key: string
  keyLocation: string
  urlList: string[]
}

function normalizeDebounceMs(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DEBOUNCE_MS
}

function chunkUrls(urls: string[]): string[][] {
  const chunks: string[][] = []
  for (let index = 0; index < urls.length; index += MAX_INDEXNOW_URLS) {
    chunks.push(urls.slice(index, index + MAX_INDEXNOW_URLS))
  }
  return chunks
}

export function createIndexNowSubmitter() {
  const pendingUrls = new Set<string>()
  const debounceMs = normalizeDebounceMs(process.env.INDEXNOW_DEBOUNCE_MS)
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<void> | null = null
  let disabledReasonLogged: string | null = null

  function logDisabled(reason: string): void {
    if (disabledReasonLogged === reason) return
    disabledReasonLogged = reason
    syncLog.info('indexnow disabled', { reason })
  }

  async function submitChunk(payload: SubmitPayload, endpoint: string): Promise<void> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    })

    if (response.ok) {
      syncLog.info('indexnow submitted urls', {
        urlCount: payload.urlList.length,
        status: response.status
      })
      return
    }

    const body = await response.text().catch(() => '')
    syncLog.warn('indexnow submission failed', {
      urlCount: payload.urlList.length,
      status: response.status,
      body: body.slice(0, 500)
    })
  }

  async function submitUrls(urls: string[]): Promise<void> {
    const state = readIndexNowConfig()
    if (!state.enabled) {
      logDisabled(state.reason)
      return
    }

    for (const urlList of chunkUrls(urls)) {
      await submitChunk({
        host: state.config.host,
        key: state.config.key,
        keyLocation: state.config.keyLocation,
        urlList
      }, state.config.endpoint)
    }
  }

  function scheduleFlush(): void {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      flush().catch((error) => {
        syncLog.warn('indexnow flush failed', { error })
      })
    }, debounceMs)
  }

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }

    if (inFlight) {
      await inFlight
    }

    if (pendingUrls.size === 0) return

    const urls = [...pendingUrls]
    pendingUrls.clear()
    inFlight = submitUrls(urls).finally(() => {
      inFlight = null
    })
    await inFlight

    if (pendingUrls.size > 0) scheduleFlush()
  }

  function notifyMenuDataUpdated(event: MenuDataUpdatedEvent): void {
    const state = readIndexNowConfig()
    if (!state.enabled) {
      logDisabled(state.reason)
      return
    }

    for (const url of buildIndexNowMenuUrls(state.config, event.restaurant, event.date)) {
      pendingUrls.add(url)
    }

    syncLog.info('indexnow queued menu update urls', {
      kind: event.kind,
      restaurantId: event.restaurant.id,
      date: event.date,
      mealTimeId: event.mealTimeId,
      pendingUrlCount: pendingUrls.size
    })
    scheduleFlush()
  }

  return {
    flush,
    notifyMenuDataUpdated
  }
}
