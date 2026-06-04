import { browser } from '$app/environment'

const LS_START_PAGE = 'welplan_start_page'

export const START_PAGE_OPTIONS = [
  { path: '/', label: '갤러리' },
  { path: '/takein', label: '테이크 인' },
  { path: '/takeout', label: '테이크 아웃' },
  { path: '/restaurants', label: '식당 선택' }
] as const

export type StartPagePath = typeof START_PAGE_OPTIONS[number]['path']

class AppState {
  startPage = $state<StartPagePath>('/')

  loadFromStorage(): void {
    if (!browser) return
    try {
      const startPage = localStorage.getItem(LS_START_PAGE)
      if (START_PAGE_OPTIONS.some((option) => option.path === startPage)) {
        this.startPage = startPage as StartPagePath
      }
    } catch {}
  }

  saveStartPage(): void {
    if (!browser) return
    try {
      localStorage.setItem(LS_START_PAGE, this.startPage)
    } catch {}
  }
}

export const app = new AppState()
