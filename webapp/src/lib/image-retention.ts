export const IMAGE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000

const KOREA_UTC_OFFSET_MS = 9 * 60 * 60 * 1000

function parsePhotoDate(value: string): number | undefined {
  for (const match of value.matchAll(/20\d{6}/g)) {
    const date = match[0]
    const timestamp = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)))
    const parsed = new Date(timestamp)
    if (
      parsed.getUTCFullYear() === Number(date.slice(0, 4)) &&
      parsed.getUTCMonth() === Number(date.slice(4, 6)) - 1 &&
      parsed.getUTCDate() === Number(date.slice(6, 8))
    ) return timestamp
  }
}

export function isPhotoOlderThanRetention(value: string, now = Date.now()): boolean {
  const photoDate = parsePhotoDate(value)
  if (photoDate === undefined) return false

  const koreaToday = new Date(now + KOREA_UTC_OFFSET_MS)
  const cutoff = Date.UTC(koreaToday.getUTCFullYear(), koreaToday.getUTCMonth(), koreaToday.getUTCDate()) - IMAGE_RETENTION_MS
  return photoDate <= cutoff
}
