import type { MealTime } from '$lib/types'
import { formatKoreanDate } from '$lib/utils'

const SITE_NAME = 'Welplan'
const REPO_URL = 'https://github.com/pmh-only/welplan2'
const DEFAULT_TITLE = `웰스토리 API 데모 | 웰스토리 식단 조회와 메뉴 확인 | ${SITE_NAME}`
const DEFAULT_DESCRIPTION =
  'Welplan은 웰스토리 API 데이터를 바탕으로 웰스토리 식단 조회, 웰스토리 식단표 확인, 삼성웰스토리 메뉴 비교를 시연하는 오픈소스 데모 사이트입니다. 날짜별 메뉴 이미지와 영양 정보를 빠르게 확인하세요.'
const INDEX_ROBOTS = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
const NOINDEX_ROBOTS = 'noindex,follow'
const LANDING_FAQ = [
  {
    question: '이 사이트는 무엇을 보여주는 웰스토리 API 데모인가요?',
    answer:
      'Welplan은 Welstory API 데이터를 이용해 웰스토리 식단 조회, 메뉴 이미지 확인, 영양 정보 비교가 어떻게 동작하는지 보여주는 데모 사이트입니다.'
  },
  {
    question: '웰스토리 식단 조회와 웰스토리 식단표 확인이 가능한가요?',
    answer:
      '가능합니다. 날짜와 식사 시간을 바꾸면 웰스토리 식단표와 메뉴 이미지를 함께 확인할 수 있고, 식당별 메뉴 비교도 할 수 있습니다.'
  },
  {
    question: '삼성전자 식단 조회나 삼성웰스토리 메뉴 확인에도 쓸 수 있나요?',
    answer:
      '식당 설정에 원하는 사업장 식당을 추가하면 삼성전자 식단 조회나 삼성전자 웰스토리 메뉴 확인에도 활용할 수 있습니다.'
  }
] as const
const KEYWORDS = [
  'Welplan',
  '웰플랜',
  '웰스토리 api',
  '웰스토리 식단 조회',
  '웰스토리 식단',
  '웰스토리 식단표',
  '웰 스토리 식단표',
  '웰스토리 메뉴 조회',
  '삼성웰스토리',
  '삼성웰스토리 식단 조회',
  '삼성웰스토리 메뉴',
  '삼성전자 식단 조회',
  '삼성전자 웰스토리 메뉴',
  '구내식당',
  '사내식당',
  '신세계푸드',
  '메뉴',
  '도시락',
  '영양 정보',
  'P-Score',
  '메뉴 갤러리'
].join(', ')

export type SeoMeta = {
  title: string
  heading: string
  description: string
  canonical: string
  image: string
  robots: string
  keywords: string
  ogAlt: string
}

function resolveMealTimeName(mealTimes: MealTime[], mealTimeId: string | null): string | null {
  if (!mealTimeId) return null
  return mealTimes.find((mealTime) => mealTime.id === mealTimeId)?.name ?? null
}

function formatSeoDate(rawDate: string | null): string | null {
  if (!rawDate || !/^\d{8}$/.test(rawDate)) return null
  return formatKoreanDate(rawDate)
}

function withSiteName(label: string): string {
  return `${label} | ${SITE_NAME}`
}

function joinDateAndMeal(dateLabel: string | null, mealTimeLabel: string | null): string {
  return [dateLabel, mealTimeLabel].filter(Boolean).join(' ')
}

function absolutePath(url: URL, pathname: string): string {
  return `${url.origin}${pathname}`
}

export function buildSeo(url: URL, mealTimes: MealTime[]): SeoMeta {
  const segments = url.pathname.split('/').filter(Boolean)
  const route = segments[0] ?? ''
  const image = absolutePath(url, '/og-image.svg')

  if (route === '') {
    return {
      title: DEFAULT_TITLE,
      heading: '웰스토리 API 데모와 식단 조회',
      description: DEFAULT_DESCRIPTION,
      canonical: absolutePath(url, '/'),
      image,
      robots: INDEX_ROBOTS,
      keywords: KEYWORDS,
      ogAlt: 'Welplan 웰스토리 API 데모 미리보기'
    }
  }

  if (route === 'gallery') {
    const dateLabel = formatSeoDate(url.searchParams.get('date'))
    const mealTimeLabel = resolveMealTimeName(mealTimes, url.searchParams.get('time'))
    const filterLabel = joinDateAndMeal(dateLabel, mealTimeLabel)
    const heading = filterLabel ? `${filterLabel} 메뉴 갤러리` : '구내식당 메뉴 갤러리'

    return {
      title: withSiteName(filterLabel ? `${filterLabel} 메뉴 갤러리` : '메뉴 갤러리'),
      heading,
      description: filterLabel
        ? `${filterLabel} 기준 구내식당 메뉴 이미지와 영양 정보를 갤러리로 비교하고 P-Score 순으로 빠르게 확인하세요.`
        : '삼성 웰스토리와 신세계푸드 구내식당 메뉴 이미지, 영양 정보, P-Score를 한눈에 비교할 수 있는 메뉴 갤러리입니다.',
      canonical: absolutePath(url, '/gallery'),
      image,
      robots: INDEX_ROBOTS,
      keywords: KEYWORDS,
      ogAlt: 'Welplan 메뉴 갤러리 미리보기'
    }
  }

  if (route === 'takein' || route === 'takeout') {
    const pageLabel = route === 'takeout' ? '테이크 아웃' : '테이크 인'
    const dateLabel = formatSeoDate(segments[1] ?? null)
    const mealTimeLabel = resolveMealTimeName(mealTimes, segments[2] ?? null)
    const scheduleLabel = joinDateAndMeal(dateLabel, mealTimeLabel)
    const heading = scheduleLabel ? `${scheduleLabel} ${pageLabel} 메뉴` : `${pageLabel} 메뉴`

    return {
      title: withSiteName(heading),
      heading,
      description: scheduleLabel
        ? `${scheduleLabel} 기준 ${pageLabel} 메뉴와 영양 성분을 확인하고 식당별 메뉴를 빠르게 비교하세요.`
        : `Welplan에서 ${pageLabel} 메뉴와 영양 성분을 날짜별로 확인하세요.`,
      canonical: absolutePath(url, url.pathname),
      image,
      robots: INDEX_ROBOTS,
      keywords: KEYWORDS,
      ogAlt: `Welplan ${pageLabel} 메뉴 미리보기`
    }
  }

  if (route === 'restaurants') {
    return {
      title: withSiteName('식당 설정'),
      heading: '식당 설정',
      description: 'Welplan에서 확인할 구내식당 목록을 추가하고 관리하는 설정 페이지입니다.',
      canonical: absolutePath(url, url.pathname),
      image,
      robots: NOINDEX_ROBOTS,
      keywords: KEYWORDS,
      ogAlt: 'Welplan 식당 설정 화면'
    }
  }

  if (route === 'settings') {
    return {
      title: withSiteName('앱 설정'),
      heading: '앱 설정',
      description: 'P-Score 가중치와 캐시 상태를 관리하는 Welplan 설정 페이지입니다.',
      canonical: absolutePath(url, url.pathname),
      image,
      robots: NOINDEX_ROBOTS,
      keywords: KEYWORDS,
      ogAlt: 'Welplan 설정 화면'
    }
  }

  return {
    title: DEFAULT_TITLE,
    heading: '웰스토리 API 데모와 식단 조회',
    description: DEFAULT_DESCRIPTION,
    canonical: absolutePath(url, '/'),
    image,
    robots: INDEX_ROBOTS,
    keywords: KEYWORDS,
    ogAlt: 'Welplan 웰스토리 API 데모 미리보기'
  }
}

export function buildJsonLd(url: URL, seo: SeoMeta) {
  const route = url.pathname.split('/').filter(Boolean)[0] ?? ''
  const pageType =
    route === 'gallery' || route === 'takein' || route === 'takeout' ? 'CollectionPage' : 'WebPage'
  const websiteId = `${url.origin}/#website`

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: SITE_NAME,
        url: absolutePath(url, '/'),
        inLanguage: 'ko-KR',
        description: DEFAULT_DESCRIPTION,
        sameAs: [REPO_URL]
      },
      {
        '@type': pageType,
        '@id': `${seo.canonical}#webpage`,
        url: seo.canonical,
        name: seo.title,
        headline: seo.heading,
        description: seo.description,
        inLanguage: 'ko-KR',
        isPartOf: { '@id': websiteId },
        primaryImageOfPage: {
          '@type': 'ImageObject',
          url: seo.image
        }
      },
      ...(route === ''
        ? [
            {
              '@type': 'FAQPage',
              '@id': `${seo.canonical}#faq`,
              mainEntity: LANDING_FAQ.map((item) => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: item.answer
                }
              }))
            }
          ]
        : [])
    ]
  }
}
