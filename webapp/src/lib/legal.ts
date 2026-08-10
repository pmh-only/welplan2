export const TERMS_2026_07_30_VERSION = '2026-07-30'
export const TERMS_2026_07_30_VERSION_LABEL = '2026년 7월 30일'
export const TERMS_2026_08_31_VERSION = '2026-08-31'
export const TERMS_2026_08_31_VERSION_LABEL = '2026년 8월 31일'
export const TERMS_PRIOR_VERSION = TERMS_2026_07_30_VERSION
export const TERMS_PRIOR_VERSION_LABEL = TERMS_2026_07_30_VERSION_LABEL
export const TERMS_VERSION = TERMS_2026_08_31_VERSION
export const TERMS_VERSION_LABEL = TERMS_2026_08_31_VERSION_LABEL
export const TERMS_NOTICE_DATE_LABEL = '2026년 7월 31일'
export const TERMS_EFFECTIVE_AT = Date.parse('2026-08-31T00:00:00+09:00')
export const PRIVACY_VERSION = '2026-08-10'
export const PRIVACY_VERSION_LABEL = '2026년 8월 10일'

export type TermsVersion = typeof TERMS_2026_07_30_VERSION | typeof TERMS_2026_08_31_VERSION

export function activeTermsVersion(now = Date.now()): TermsVersion {
  return now >= TERMS_EFFECTIVE_AT ? TERMS_VERSION : TERMS_PRIOR_VERSION
}

export function termsVersionLabel(version: TermsVersion): string {
  return version === TERMS_VERSION ? TERMS_VERSION_LABEL : TERMS_PRIOR_VERSION_LABEL
}
