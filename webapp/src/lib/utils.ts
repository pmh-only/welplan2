import type { MealTime, NutritionInfo, Restaurant } from './types.js'

export const ALL_MEAL_TIME_ID = 'all'

const NUTRITION_KEYS: (keyof NutritionInfo)[] = [
  'calories',
  'carbohydrates',
  'sugar',
  'fiber',
  'fat',
  'protein',
  'sodium',
  'cholesterol',
  'transFat',
  'saturatedFat',
  'calcium'
]

export const FALLBACK_MEAL_TIME_NAMES: Record<string, string> = {
  1: '아침',
  2: '점심',
  3: '저녁',
  4: '야식',
  5: '간식',
  6: '전체'
}

export function fallbackMealTime(id: string): MealTime {
  return { id, name: FALLBACK_MEAL_TIME_NAMES[id] ?? id }
}

export function hasNutritionInfo(nutrition: NutritionInfo | undefined): boolean {
  return nutrition != null && NUTRITION_KEYS.some((key) => (nutrition[key] ?? 0) !== 0)
}

export function restaurantPathTags(restaurant: Restaurant): string {
  return restaurant.path?.filter(Boolean).map((part) => `#${part}`).join(' ') ?? ''
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function todayStr(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

export function toInputDate(s: string): string {
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

export function fromInputDate(s: string): string {
  return s.replace(/-/g, '')
}

export function formatKoreanDate(s: string): string {
  const dt = new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)))
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${s.slice(0, 4)}년 ${Number(s.slice(4, 6))}월 ${Number(s.slice(6, 8))}일 (${days[dt.getDay()]})`
}

export function shiftDate(s: string, delta: number): string {
  const dt = new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)))
  dt.setDate(dt.getDate() + delta)
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}`
}

export function autoSelectMealTime(times: MealTime[]): string | null {
  if (!times.length) return null
  const h = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getHours()
  const order =
    h < 9
      ? ['breakfast', 'dawn']
      : h < 14
        ? ['lunch', 'breakfast']
        : h < 17
          ? ['dinner', 'lunch']
          : h < 19
            ? ['dinner', 'supper']
            : ['supper', 'dinner']
  for (const type of order) {
    const m = times.find((t) => t.type === type)
    if (m) return m.id
  }
  return times[0].id
}

export function proxyImg(url: string | undefined, refreshKey = ''): string | undefined {
  if (!url) return undefined
  const suffix = refreshKey ? `?v=${encodeURIComponent(refreshKey)}` : ''
  if (url.includes('samsungwelstory.com')) {
    return `${url.replace('http://samsungwelstory.com/', '/img/welstory/')}${suffix}`
  }
  if (url.includes('planeatchoice.net')) {
    return `${url.replace(/https?:\/\/[^/]*planeatchoice\.net\//, '/img/planeat/')}${suffix}`
  }
  return url
}
