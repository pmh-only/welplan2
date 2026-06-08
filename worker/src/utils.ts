function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function todayStr(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

export function shiftDate(s: string, delta: number): string {
  const dt = new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)))
  dt.setDate(dt.getDate() + delta)
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}`
}
