export function normalizeMenuOccurrenceName(name: string): string {
  return name
    .normalize('NFKC')
    .toLocaleLowerCase('ko')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/gu, '')
}
