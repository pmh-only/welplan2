import { pushState } from '$app/navigation'

const DIALOG_STATE_KEY = '__welplanDialog'

type DialogEntry = {
  id: string
  dismiss: () => void
}

const entries: DialogEntry[] = []
let listening = false

function dialogId(state: unknown): string | number | undefined {
  if (!state || typeof state !== 'object') return undefined
  const record = state as Record<string, unknown>
  const id = record[DIALOG_STATE_KEY]
  if (typeof id === 'string' || typeof id === 'number') return id

  const pageState = record['sveltekit:states']
  if (!pageState || typeof pageState !== 'object') return undefined
  const pageStateId = (pageState as Record<string, unknown>)[DIALOG_STATE_KEY]
  return typeof pageStateId === 'string' || typeof pageStateId === 'number' ? pageStateId : undefined
}

function removeEntry(entry: DialogEntry) {
  const index = entries.indexOf(entry)
  if (index !== -1) entries.splice(index, 1)
}

function onPopState(event: PopStateEvent) {
  const entry = entries.at(-1)
  if (!entry || dialogId(event.state) === entry.id) return

  entries.pop()
  entry.dismiss()
}

function ensureListener() {
  if (listening || typeof window === 'undefined') return
  window.addEventListener('popstate', onPopState)
  listening = true
}

export function createDialogHistory(dismiss: () => void) {
  let entry: DialogEntry | undefined
  let closing = false
  let dismissed = false
  let closePromise: Promise<void> | undefined
  let resolveClose: (() => void) | undefined

  function dismissOnce() {
    if (dismissed) return
    dismissed = true
    dismiss()
  }

  return {
    open() {
      if (entry || typeof window === 'undefined') return
      ensureListener()
      closing = false
      dismissed = false
      closePromise = new Promise<void>((resolve) => { resolveClose = resolve })
      entry = {
        id: window.crypto.randomUUID(),
        dismiss: () => {
          entry = undefined
          closing = false
          dismissOnce()
          resolveClose?.()
          resolveClose = undefined
          closePromise = undefined
        }
      }
      entries.push(entry)
      pushState('', { [DIALOG_STATE_KEY]: entry.id })
    },

    close() {
      if (!entry) {
        dismiss()
        return Promise.resolve()
      }
      if (closing) return closePromise ?? Promise.resolve()

      if (entries.at(-1) === entry && dialogId(history.state) === entry.id) {
        closing = true
        // Explicit controls should close immediately; popstate only cleans up the history entry.
        dismissOnce()
        history.back()
        return closePromise ?? Promise.resolve()
      }

      const current = entry
      entry = undefined
      removeEntry(current)
      dismissOnce()
      resolveClose?.()
      resolveClose = undefined
      closePromise = undefined
      return Promise.resolve()
    },

    destroy() {
      if (!entry) return
      removeEntry(entry)
      entry = undefined
      resolveClose?.()
      resolveClose = undefined
      closePromise = undefined
    }
  }
}
