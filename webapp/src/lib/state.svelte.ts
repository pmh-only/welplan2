import { browser } from '$app/environment'
import type { PScoreWeights } from './types'

const LS_PSCORE = 'welplan_pscore'
const LS_START_PAGE = 'welplan_start_page'

export const START_PAGE_OPTIONS = [
  { path: '/', label: '갤러리' },
  { path: '/takein', label: '테이크 인' },
  { path: '/takeout', label: '테이크 아웃' },
  { path: '/restaurants', label: '식당 선택' }
] as const

export type StartPagePath = typeof START_PAGE_OPTIONS[number]['path']

export const DEFAULT_WEIGHTS: PScoreWeights = {
  cal: 0.1,
  carb: 0.8,
  sugar: 2.0,
  fat: 1.5,
  protein: 0.5
}

class AppState {
  pWeights = $state<PScoreWeights>({ ...DEFAULT_WEIGHTS })
  startPage = $state<StartPagePath>('/')

  loadFromStorage(): void {
    if (!browser) return
    try {
      const s = localStorage.getItem(LS_PSCORE)
      if (s) this.pWeights = { ...DEFAULT_WEIGHTS, ...JSON.parse(s) }
    } catch {}
    try {
      const startPage = localStorage.getItem(LS_START_PAGE)
      if (START_PAGE_OPTIONS.some((option) => option.path === startPage)) {
        this.startPage = startPage as StartPagePath
      }
    } catch {}
  }

  savePWeights(): void {
    if (!browser) return
    try {
      localStorage.setItem(LS_PSCORE, JSON.stringify(this.pWeights))
    } catch {}
  }

  resetWeights(): void {
    this.pWeights = { ...DEFAULT_WEIGHTS }
    this.savePWeights()
  }

  saveStartPage(): void {
    if (!browser) return
    try {
      localStorage.setItem(LS_START_PAGE, this.startPage)
    } catch {}
  }
}

export const app = new AppState()
