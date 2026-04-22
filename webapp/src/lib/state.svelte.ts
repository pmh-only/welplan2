import { browser } from '$app/environment'
import type { PScoreWeights } from './types'

const LS_PSCORE = 'welplan_pscore'

export const DEFAULT_WEIGHTS: PScoreWeights = {
  cal: 0.1,
  carb: 0.8,
  sugar: 2.0,
  fat: 1.5,
  protein: 0.5
}

class AppState {
  pWeights = $state<PScoreWeights>({ ...DEFAULT_WEIGHTS })

  loadFromStorage(): void {
    if (!browser) return
    try {
      const s = localStorage.getItem(LS_PSCORE)
      if (s) this.pWeights = { ...DEFAULT_WEIGHTS, ...JSON.parse(s) }
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
}

export const app = new AppState()
