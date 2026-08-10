<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { browser } from '$app/environment'
  import '@fontsource/noto-sans-kr/400.css'
  import '@fontsource/noto-sans-kr/500.css'
  import '@fontsource/noto-sans-kr/600.css'
  import '@fontsource/noto-sans-kr/700.css'
  import '../app.css'
  import type { Snippet } from 'svelte'
  import { onMount, untrack } from 'svelte'
  import { navigating, page } from '$app/state'
  import { trackEvent } from '$lib/analytics'
  import { readRestaurantSelectionFromClient, restaurantSelectionsEqual, restoreRestaurantCookieFromStorage, saveRestaurantSelection } from '$lib/restaurant-cookie'
  import { restaurantDatedPath, restaurantDetailPath } from '$lib/restaurant-routes'
  import { recordRestaurantSelection } from '$lib/restaurant-selection'
  import { BellRing, Braces, Camera, Check, FileText, Megaphone, Moon, Package, Search, Store, Sun, Utensils, X } from '@lucide/svelte'
  import {
    AGENT_SKILLS_INDEX_PATH,
    API_CATALOG_PATH,
    API_DOC_PATH,
    OPENAPI_PATH,
    WEB_MCP_TOOLS
  } from '$lib/agent'
  import type { MealTime, Menu, Restaurant } from '$lib/types'
  import { ALL_MEAL_TIME_ID, fallbackMealTime, formatKoreanDate, proxyImg, restaurantPathTags, restaurantPathTexts } from '$lib/utils'

  type RouteMeta = {
    title: string
    ogTitle: string
    description: string
    robots: string
  }

  type JsonLdValue = Record<string, unknown>

  type LayoutData = {
    restaurants?: Restaurant[]
    mealTimes?: MealTime[]
    isFirstVisit: boolean
    notice?: NoticeSettings
    hasTakeOutMenu?: boolean
    hasGalleryMenuPictures?: boolean
  }

  type NoticeSettings = {
    enabled: boolean
    title: string
    summary: string
    detail: string
    contentHtml: string
    updatedAt?: number
  }

  type PageStructuredData = {
    restaurants?: Restaurant[]
    menus?: Menu[]
    mealTimes?: MealTime[]
    date?: string
    time?: string
    detailPath?: string
    notice?: NoticeSettings
  }

  const INDEXABLE_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
  const NOINDEX_ROBOTS = 'noindex, follow'
  const SITE_NAME = 'Welplan'
  const SITE_ALTERNATE_NAMES = ['웰플랜']
  const SITE_DESCRIPTION = '웰스토리·신세계푸드 사내 식당 메뉴 조회 서비스'
  const GITHUB_URL = 'https://github.com/pmh-only/welplan2'
  const CONTACT_EMAIL = 'pmh_only@pmh.codes'
  const THEME_STORAGE_KEY = 'welplan-theme'
  const MAX_JSON_LD_MENUS = 24
  const MAX_JSON_LD_RESTAURANTS = 30
  const MAX_WEB_MCP_SEARCH_RESULTS = 10
  const MAX_WEB_MCP_RESOLVED_RESTAURANTS = 100
  const MAX_WEB_MCP_PAGE_HEADINGS = 12
  const MAX_WEB_MCP_PAGE_TEXT = 1000
  const APP_FEATURES = [
    '웰스토리 식단 조회',
    '삼성웰스토리 식단표 조회',
    '신세계푸드 메뉴 조회',
    '날짜별 사내 식당 메뉴 조회',
    '메뉴 사진 갤러리',
    '칼로리 및 영양정보 조회',
    '테이크인·테이크아웃 메뉴 분류',
    'RSS 메뉴 피드',
    '협업 도구 메뉴 웹훅',
    'OpenAPI 및 Markdown 메뉴 응답'
  ]
  const SITE_NAVIGATION_LINKS = [
    { path: '/', name: '메뉴 갤러리' },
    { path: '/takein', name: '테이크 인 메뉴' },
    { path: '/takeout', name: '테이크 아웃 메뉴' },
    { path: '/restaurants', name: '식당 선택' },
    { path: '/webhooks', name: '메뉴 웹훅' },
    { path: '/docs/api', name: 'API 문서' },
    { path: '/notice', name: '공지사항' }
  ]
  function mealTimeName (mealTimes: MealTime[], id: string): string {
    if (id === ALL_MEAL_TIME_ID) return '전체'
    return mealTimes.find((mealTime) => mealTime.id === id)?.name ?? fallbackMealTime(id).name
  }

  function isRestaurant (value: unknown): value is Restaurant {
    if (!value || typeof value !== 'object') return false
    const restaurant = value as Partial<Restaurant>
    return typeof restaurant.id === 'string' &&
      restaurant.id.trim().length > 0 &&
      typeof restaurant.name === 'string' &&
      restaurant.name.trim().length > 0 &&
      (restaurant.vendor === 'welstory' || restaurant.vendor === 'shinsegae') &&
      (restaurant.path === undefined || (
        Array.isArray(restaurant.path) && restaurant.path.every((part) => typeof part === 'string')
      ))
  }

  function restaurantFromPageData (value: unknown): Restaurant | undefined {
    if (!value || typeof value !== 'object') return undefined
    const pageData = value as { restaurant?: unknown }
    return isRestaurant(pageData.restaurant) ? pageData.restaurant : undefined
  }

  function canonicalPathFromPageData (value: unknown): string | undefined {
    if (!value || typeof value !== 'object') return undefined
    const pageData = value as { canonicalPath?: unknown }
    return typeof pageData.canonicalPath === 'string' ? pageData.canonicalPath : undefined
  }

  function vendorName (vendor: string): string {
    return vendor === 'welstory' ? '삼성웰스토리' : '신세계푸드'
  }

  function restaurantPathText (restaurant: Restaurant): string {
    return restaurantPathTags(restaurant)
  }

  function pageStructuredData (value: unknown): PageStructuredData | undefined {
    return value && typeof value === 'object' ? value as PageStructuredData : undefined
  }

  function absoluteUrl (value: string | undefined, origin: string): string | undefined {
    return value ? new URL(value, origin).toString() : undefined
  }

  function menuImageUrl (menu: Menu, origin: string): string | undefined {
    return absoluteUrl(proxyImg(menu.imageUrl, '', menu.date), origin)
  }

  function firstMenuImageUrl (menus: Menu[] | undefined, origin: string): string | undefined {
    const menu = menus?.find((item) => item.imageUrl)
    return menu ? menuImageUrl(menu, origin) : undefined
  }

  function siteAlternateNames (origin: string): string[] {
    const hostname = new URL(origin).hostname.toLowerCase()
    return [...new Set([...SITE_ALTERNATE_NAMES, hostname].filter(Boolean))]
  }

  function compactDateToIso (date: string | undefined): string | undefined {
    if (!date || !/^\d{8}$/.test(date)) return undefined
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
  }

  function fragmentPart (value: string): string {
    return encodeURIComponent(value)
      .replace(/[^a-zA-Z0-9-]/g, '')
      .slice(0, 96) || 'item'
  }

  function jsonLdNodeId (canonicalUrl: string, prefix: string, value: string): string {
    return `${canonicalUrl}#${prefix}-${fragmentPart(value)}`
  }

  function restaurantEntityUrl (restaurant: Restaurant, origin: string): string {
    return new URL(restaurantDetailPath(restaurant), origin).toString()
  }

  function restaurantJsonLdId (restaurant: Restaurant, origin: string): string {
    return `${restaurantEntityUrl(restaurant, origin)}#restaurant`
  }

  function uniqueRestaurants (restaurants: Restaurant[] | undefined): Restaurant[] {
    const seen = new Set<string>()
    return (restaurants ?? []).filter((restaurant) => {
      const key = `${restaurant.vendor}:${restaurant.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  function restaurantAdditionalProperties (restaurant: Restaurant): JsonLdValue[] | undefined {
    const paths = restaurantPathTexts(restaurant)
    if (paths.length === 0) return undefined

    return paths.slice(0, 8).map((path, index) => ({
      '@type': 'PropertyValue',
      name: index === 0 ? '위치' : '위치 경로',
      value: path
    }))
  }

  function restaurantSummaryJsonLd (restaurant: Restaurant, origin: string): JsonLdValue {
    const vendorLabel = vendorName(restaurant.vendor)
    return {
      '@type': 'Restaurant',
      '@id': restaurantJsonLdId(restaurant, origin),
      name: restaurant.name,
      identifier: `${restaurant.vendor}:${restaurant.id}`,
      url: restaurantEntityUrl(restaurant, origin),
      description: `${vendorLabel} ${restaurant.name} 식단표와 메뉴 정보를 Welplan에서 조회할 수 있습니다.`,
      servesCuisine: ['Korean'],
      branchOf: {
        '@type': 'Organization',
        name: vendorLabel
      },
      additionalProperty: restaurantAdditionalProperties(restaurant)
    }
  }

  function selectedRestaurantsJsonLd (restaurants: Restaurant[] | undefined, origin: string, canonicalUrl: string): JsonLdValue[] {
    const visibleRestaurants = uniqueRestaurants(restaurants).slice(0, MAX_JSON_LD_RESTAURANTS)
    if (visibleRestaurants.length === 0) return []

    return [
      {
        '@type': 'ItemList',
        '@id': `${canonicalUrl}#selected-restaurants`,
        name: 'Welplan 선택 식당 목록',
        numberOfItems: visibleRestaurants.length,
        itemListElement: visibleRestaurants.map((restaurant, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: { '@id': restaurantJsonLdId(restaurant, origin) }
        }))
      },
      ...visibleRestaurants.map((restaurant) => restaurantSummaryJsonLd(restaurant, origin))
    ]
  }

  function siteNavigationJsonLd (origin: string): JsonLdValue {
    return {
      '@type': 'ItemList',
      '@id': `${origin}/#site-navigation`,
      name: 'Welplan 주요 페이지',
      itemListElement: SITE_NAVIGATION_LINKS.map((link, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'SiteNavigationElement',
          name: link.name,
          url: new URL(link.path, origin).toString()
        }
      }))
    }
  }

  function jsonLdScript (value: JsonLdValue): string {
    return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, '\\u003c')}</scr` + 'ipt>'
  }

  function breadcrumbName (segment: string, pathname: string, restaurant?: Restaurant): string {
    if (segment === 'restaurants') return '식당'
    if (segment === 'gallery') return '메뉴 갤러리'
    if (segment === 'takein') return '테이크인'
    if (segment === 'takeout') return '테이크아웃'
    if (segment === 'docs') return '문서'
    if (segment === 'api') return 'API'
    if (segment === 'notice') return '공지사항'
    if (segment === 'webhooks') return '메뉴 웹훅'
    if (segment === 'terms') return '서비스 이용약관'
    if (segment === 'privacy') return '개인정보 처리방침'
    if (segment === 'data-deletion') return '데이터 삭제 요청'
    if (/^\d{8}$/.test(segment)) return formatKoreanDate(segment)
    if (restaurant && segment === restaurant.vendor) return vendorName(restaurant.vendor)
    if (restaurant && segment === restaurant.id) return restaurant.name
    if (restaurant && pathname.includes(`/${restaurant.id}/`) && !['restaurants', restaurant.vendor].includes(segment)) return restaurant.name
    return decodeURIComponent(segment).replace(/-/g, ' ')
  }

  function breadcrumbJsonLd (
    pathname: string,
    origin: string,
    canonicalUrl: string,
    restaurant?: Restaurant,
    pageData?: PageStructuredData
  ): JsonLdValue | undefined {
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length === 0) return undefined

    const breadcrumbId = `${canonicalUrl}#breadcrumb`

    if (restaurant && pathname.startsWith('/restaurants/')) {
      const itemListElement = [
        {
          '@type': 'ListItem',
          position: 1,
          name: SITE_NAME,
          item: `${origin}/`
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: '식당',
          item: new URL('/restaurants', origin).toString()
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: restaurant.name,
          item: new URL(pageData?.detailPath ?? pathname, origin).toString()
        }
      ]

      if (pageData?.date && /^\d{8}$/.test(pageData.date) && pathname.endsWith(`/${pageData.date}`)) {
        itemListElement.push({
          '@type': 'ListItem',
          position: 4,
          name: formatKoreanDate(pageData.date),
          item: canonicalUrl
        })
      }

      return {
        '@type': 'BreadcrumbList',
        '@id': breadcrumbId,
        itemListElement
      }
    }

    const itemListElement = [
      {
        '@type': 'ListItem',
        position: 1,
        name: SITE_NAME,
        item: `${origin}/`
      },
      ...segments.map((segment, index) => {
        const itemPath = `/${segments.slice(0, index + 1).join('/')}`
        const isLast = index === segments.length - 1
        return {
          '@type': 'ListItem',
          position: index + 2,
          name: breadcrumbName(segment, pathname, restaurant),
          item: isLast ? canonicalUrl : new URL(itemPath, origin).toString()
        }
      })
    ]

    return {
      '@type': 'BreadcrumbList',
      '@id': breadcrumbId,
      itemListElement
    }
  }

  function nutritionJsonLd (menu: Menu): JsonLdValue | undefined {
    const nutrition = menu.nutrition
    if (nutrition?.calories == null) return undefined

    return {
      '@type': 'NutritionInformation',
      calories: `${Math.round(nutrition.calories)} calories`,
      carbohydrateContent: nutrition.carbohydrates == null ? undefined : `${Math.round(nutrition.carbohydrates)} g`,
      sugarContent: nutrition.sugar == null ? undefined : `${Math.round(nutrition.sugar)} g`,
      fiberContent: nutrition.fiber == null ? undefined : `${Math.round(nutrition.fiber)} g`,
      fatContent: nutrition.fat == null ? undefined : `${Math.round(nutrition.fat)} g`,
      proteinContent: nutrition.protein == null ? undefined : `${Math.round(nutrition.protein)} g`,
      sodiumContent: nutrition.sodium == null ? undefined : `${Math.round(nutrition.sodium)} mg`,
      cholesterolContent: nutrition.cholesterol == null ? undefined : `${Math.round(nutrition.cholesterol)} mg`,
      saturatedFatContent: nutrition.saturatedFat == null ? undefined : `${Math.round(nutrition.saturatedFat)} g`,
      transFatContent: nutrition.transFat == null ? undefined : `${Math.round(nutrition.transFat)} g`
    }
  }

  function menuDescription (menu: Menu): string | undefined {
    const components = menu.components.map((component) => component.name).filter(Boolean).slice(0, 6)
    return components.length > 0 ? components.join(', ') : undefined
  }

  function menuItemJsonLdId (menu: Menu, canonicalUrl: string): string {
    return jsonLdNodeId(canonicalUrl, 'menu-item', `${menu.restaurantId}:${menu.mealTimeId}:${menu.id}:${menu.name}`)
  }

  function menuItemJsonLd (
    menu: Menu,
    canonicalUrl: string,
    origin: string,
    restaurantsByKey: Map<string, Restaurant>,
    sectionId: string
  ): JsonLdValue {
    const restaurant = restaurantsByKey.get(`${menu.vendor}:${menu.restaurantId}`)
    const name = [menu.parentName, menu.name].filter(Boolean).join(' - ')

    return {
      '@type': 'MenuItem',
      '@id': menuItemJsonLdId(menu, canonicalUrl),
      identifier: menu.id,
      name,
      description: menuDescription(menu),
      image: menuImageUrl(menu, origin),
      nutrition: nutritionJsonLd(menu),
      category: menu.isTakeOut ? '테이크아웃' : '테이크인',
      isPartOf: { '@id': sectionId },
      provider: restaurant ? { '@id': restaurantJsonLdId(restaurant, origin) } : undefined
    }
  }

  function menuJsonLd (
    menus: Menu[],
    mealTimes: MealTime[],
    canonicalUrl: string,
    origin: string,
    date?: string,
    restaurants: Restaurant[] = [],
    restaurant?: Restaurant
  ): JsonLdValue | undefined {
    const visibleMenus = menus.slice(0, MAX_JSON_LD_MENUS)
    if (visibleMenus.length === 0) return undefined

    const visibleMealTimes = mealTimes.length > 0
      ? mealTimes
      : [...new Set(visibleMenus.map((menu) => menu.mealTimeId))].map(fallbackMealTime)
    const restaurantsByKey = new Map(uniqueRestaurants([restaurant, ...restaurants].filter((item): item is Restaurant => item !== undefined)).map((item) => [`${item.vendor}:${item.id}`, item]))
    const menuDate = compactDateToIso(date)

    return {
      '@type': 'Menu',
      '@id': `${canonicalUrl}#menu`,
      name: date && /^\d{8}$/.test(date) ? `${formatKoreanDate(date)} 식단표` : '식단표',
      url: canonicalUrl,
      inLanguage: 'ko-KR',
      datePublished: menuDate,
      temporalCoverage: menuDate,
      provider: restaurant ? { '@id': restaurantJsonLdId(restaurant, origin) } : undefined,
      hasMenuSection: visibleMealTimes
        .map((mealTime) => {
          const sectionMenus = visibleMenus.filter((menu) => menu.mealTimeId === mealTime.id)
          if (sectionMenus.length === 0) return undefined
          const sectionId = jsonLdNodeId(canonicalUrl, 'menu-section', mealTime.id)

          return {
            '@type': 'MenuSection',
            '@id': sectionId,
            name: mealTime.name,
            hasMenuItem: sectionMenus.map((menu) => menuItemJsonLd(menu, canonicalUrl, origin, restaurantsByKey, sectionId))
          }
        })
        .filter(Boolean)
    }
  }

  function dateModifiedFromPageData (pageData?: PageStructuredData): string | undefined {
    return pageData?.notice?.updatedAt ? new Date(pageData.notice.updatedAt).toISOString() : undefined
  }

  function apiDocumentationJsonLd (pathname: string, origin: string, canonicalUrl: string, routeMeta: RouteMeta, organizationId: string): JsonLdValue[] {
    if (!pathname.startsWith('/docs/api')) return []

    const apiId = `${origin}/#menu-api`
    const articleId = `${canonicalUrl}#api-docs`

    return [
      {
        '@type': 'TechArticle',
        '@id': articleId,
        headline: routeMeta.title,
        name: routeMeta.ogTitle,
        description: routeMeta.description,
        url: canonicalUrl,
        inLanguage: 'ko-KR',
        about: [
          { '@type': 'Thing', name: '웰스토리 API' },
          { '@type': 'Thing', name: '웰스토리 식단 조회 API' },
          { '@type': 'Thing', name: '신세계푸드 메뉴 조회' },
          { '@type': 'Thing', name: 'OpenAPI' }
        ],
        author: { '@id': organizationId },
        publisher: { '@id': organizationId },
        mainEntityOfPage: { '@id': `${canonicalUrl}#webpage` }
      },
      {
        '@type': 'WebAPI',
        '@id': apiId,
        name: 'Welplan Menu API',
        description: '웰스토리·신세계푸드 식당 검색, 날짜별 메뉴 조회, RSS 피드를 제공하는 Welplan API입니다.',
        documentation: canonicalUrl,
        provider: { '@id': organizationId },
        termsOfService: new URL('/terms', origin).toString(),
        entryPoint: [
          {
            '@type': 'EntryPoint',
            name: '식당 검색 API',
            httpMethod: 'GET',
            urlTemplate: `${origin}/proxy/search?q={query}`,
            contentType: 'application/json'
          },
          {
            '@type': 'EntryPoint',
            name: '식당 날짜별 메뉴 페이지',
            httpMethod: 'GET',
            urlTemplate: `${origin}/restaurants/{vendor}/{id}/{slug}/{date}`,
            contentType: ['text/html', 'text/markdown']
          },
          {
            '@type': 'EntryPoint',
            name: '전체 메뉴 RSS',
            httpMethod: 'GET',
            urlTemplate: `${origin}/rss.xml`,
            contentType: 'application/rss+xml'
          }
        ]
      }
    ]
  }

  function noticeArticleJsonLd (pathname: string, canonicalUrl: string, routeMeta: RouteMeta, organizationId: string, pageData?: PageStructuredData): JsonLdValue | undefined {
    if (!pathname.startsWith('/notice')) return undefined

    const notice = pageData?.notice
    const updatedAt = notice?.updatedAt ? new Date(notice.updatedAt).toISOString() : undefined

    return {
      '@type': 'Article',
      '@id': `${canonicalUrl}#notice`,
      headline: notice?.title || 'Welplan 공지사항',
      description: notice?.summary || routeMeta.description,
      articleBody: notice?.detail || undefined,
      datePublished: updatedAt,
      dateModified: updatedAt,
      inLanguage: 'ko-KR',
      author: { '@id': organizationId },
      publisher: { '@id': organizationId },
      mainEntityOfPage: { '@id': `${canonicalUrl}#webpage` }
    }
  }

  function jsonLdForPage (
    pathname: string,
    origin: string,
    canonicalUrl: string,
    routeMeta: RouteMeta,
    restaurant?: Restaurant,
    pageData?: unknown
  ): JsonLdValue[] {
    const typedData = pageStructuredData(pageData)
    const organizationId = `${origin}/#organization`
    const websiteId = `${origin}/#website`
    const webappId = `${origin}/#webapp`
    const homeUrl = `${origin}/`
    const defaultImageUrl = new URL('/og-image.webp', origin).toString()
    const rssFeedUrl = new URL('/rss.xml', origin).toString()
    const appScreenshotUrls = [
      '/pwa-screenshot-home-desktop.png',
      '/pwa-screenshot-home-mobile.png',
      '/pwa-screenshot-takein-desktop.png',
      '/pwa-screenshot-takeout-desktop.png',
      '/pwa-screenshot-api-desktop.png'
    ].map((path) => new URL(path, origin).toString())
    const pageImageUrl = firstMenuImageUrl(typedData?.menus, origin) ?? defaultImageUrl
    const breadcrumb = breadcrumbJsonLd(pathname, origin, canonicalUrl, restaurant, typedData)
    const dateModified = dateModifiedFromPageData(typedData)
    const menu = typedData?.menus?.length
      ? menuJsonLd(typedData.menus, typedData.mealTimes ?? [], canonicalUrl, origin, typedData.date, typedData.restaurants ?? [], restaurant)
      : undefined
    const noticeArticle = noticeArticleJsonLd(pathname, canonicalUrl, routeMeta, organizationId, typedData)
    const apiDocs = apiDocumentationJsonLd(pathname, origin, canonicalUrl, routeMeta, organizationId)
    const webPage: JsonLdValue = {
      '@type': menu ? ['WebPage', 'CollectionPage'] : 'WebPage',
      '@id': `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: routeMeta.title,
      description: routeMeta.description,
      inLanguage: 'ko-KR',
      isPartOf: { '@id': websiteId },
      publisher: { '@id': organizationId },
      image: pageImageUrl,
      primaryImageOfPage: {
        '@type': 'ImageObject',
        url: pageImageUrl
      },
      breadcrumb: breadcrumb ? { '@id': `${canonicalUrl}#breadcrumb` } : undefined,
      temporalCoverage: compactDateToIso(typedData?.date),
      dateModified
    }
    const graph: JsonLdValue[] = [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: SITE_NAME,
        alternateName: siteAlternateNames(origin),
        url: homeUrl,
        logo: {
          '@type': 'ImageObject',
          url: new URL('/manifest-icon-512.png', origin).toString(),
          width: 512,
          height: 512
        },
        description: SITE_DESCRIPTION,
        email: CONTACT_EMAIL,
        areaServed: {
          '@type': 'Country',
          name: 'South Korea'
        },
        knowsAbout: APP_FEATURES,
        brand: {
          '@type': 'Brand',
          name: SITE_NAME
        },
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: CONTACT_EMAIL,
          availableLanguage: ['ko-KR', 'ko']
        },
        sameAs: [GITHUB_URL]
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: SITE_NAME,
        alternateName: siteAlternateNames(origin),
        url: homeUrl,
        description: SITE_DESCRIPTION,
        inLanguage: 'ko-KR',
        publisher: { '@id': organizationId },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${origin}/proxy/search?q={search_term_string}`,
            contentType: 'application/json'
          },
          'query-input': 'required name=search_term_string'
        }
      },
      {
        '@type': 'WebApplication',
        '@id': webappId,
        name: SITE_NAME,
        alternateName: siteAlternateNames(origin),
        url: homeUrl,
        description: SITE_DESCRIPTION,
        applicationCategory: 'FoodAndDrinkApplication',
        applicationSubCategory: 'CafeteriaMenuApplication',
        operatingSystem: 'Any',
        inLanguage: 'ko-KR',
        isAccessibleForFree: true,
        image: defaultImageUrl,
        screenshot: appScreenshotUrls.map((url) => ({
          '@type': 'ImageObject',
          url
        })),
        featureList: APP_FEATURES,
        browserRequirements: 'Requires JavaScript and a modern web browser.',
        softwareHelp: new URL('/docs/api', origin).toString(),
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'KRW'
        },
        publisher: { '@id': organizationId }
      },
      {
        '@type': 'SoftwareSourceCode',
        '@id': `${origin}/#source-code`,
        name: 'Welplan source code',
        codeRepository: GITHUB_URL,
        programmingLanguage: ['TypeScript', 'Svelte'],
        runtimePlatform: 'Node.js',
        targetProduct: { '@id': webappId },
        publisher: { '@id': organizationId }
      },
      {
        '@type': 'DataFeed',
        '@id': `${rssFeedUrl}#feed`,
        name: 'Welplan 메뉴 RSS 피드',
        description: '선택한 식당의 웰스토리·신세계푸드 메뉴 업데이트를 제공하는 RSS 피드입니다.',
        url: rssFeedUrl,
        encodingFormat: 'application/rss+xml',
        inLanguage: 'ko-KR',
        provider: { '@id': organizationId }
      },
      siteNavigationJsonLd(origin),
      webPage
    ]

    if (breadcrumb) graph.push(breadcrumb)

    if (!restaurant && menu && typedData) {
      graph.push(...selectedRestaurantsJsonLd(typedData.restaurants, origin, canonicalUrl))
      webPage.mainEntity = { '@id': `${canonicalUrl}#menu` }
      graph.push(menu)
    }

    if (restaurant && typedData) {
      const vendorLabel = vendorName(restaurant.vendor)
      const restaurantId = restaurantJsonLdId(restaurant, origin)
      const restaurantUrl = restaurantEntityUrl(restaurant, origin)
      const image = firstMenuImageUrl(typedData.menus, origin)
      webPage.mainEntity = { '@id': restaurantId }
      webPage.about = { '@id': restaurantId }

      graph.push({
        '@type': 'Restaurant',
        '@id': restaurantId,
        name: restaurant.name,
        identifier: `${restaurant.vendor}:${restaurant.id}`,
        url: restaurantUrl,
        description: routeMeta.description,
        servesCuisine: ['Korean'],
        branchOf: {
          '@type': 'Organization',
          name: vendorLabel
        },
        hasMenu: menu ? { '@id': `${canonicalUrl}#menu` } : undefined,
        image,
        additionalProperty: restaurantAdditionalProperties(restaurant),
        subjectOf: { '@id': `${canonicalUrl}#webpage` },
        mainEntityOfPage: { '@id': `${canonicalUrl}#webpage` }
      })

      if (menu) graph.push(menu)
    }

    if (noticeArticle) {
      webPage.mainEntity = { '@id': `${canonicalUrl}#notice` }
      graph.push(noticeArticle)
    }

    if (apiDocs.length > 0) {
      webPage.mainEntity = { '@id': `${canonicalUrl}#api-docs` }
      graph.push(...apiDocs)
    }

    return [{ '@context': 'https://schema.org', '@graph': graph }]
  }

  function routeMetaFor (pathname: string, mealTimes: MealTime[], restaurant?: Restaurant): RouteMeta {
    const baseMeta: RouteMeta = {
      title: '웰스토리·신세계푸드 구내식당 오늘 메뉴 | Welplan',
      ogTitle: '웰스토리·신세계푸드 오늘 메뉴 | Welplan',
      description: '삼성웰스토리와 신세계푸드 구내식당의 오늘 메뉴를 확인하세요. 식당별 식단표, 메뉴 사진, 칼로리와 영양정보를 날짜별로 제공합니다.',
      robots: INDEXABLE_ROBOTS
    }

    if (pathname === '/' || pathname.startsWith('/gallery')) {
      return {
        ...baseMeta,
        title: '웰스토리·신세계푸드 구내식당 오늘 메뉴 | Welplan',
        ogTitle: '웰스토리·신세계푸드 오늘 메뉴 | Welplan',
        description: '삼성웰스토리와 신세계푸드 구내식당의 오늘 메뉴를 확인하세요. 식당별 식단표, 메뉴 사진, 칼로리와 영양정보를 날짜별로 제공합니다.'
      }
    }

    if (pathname.startsWith('/notice')) {
      return {
        ...baseMeta,
        title: '공지사항 | Welplan',
        ogTitle: 'Welplan 공지사항',
        description: 'Welplan 서비스 공지사항과 업데이트 안내입니다.'
      }
    }

    if (pathname.startsWith('/webhooks')) {
      return {
        ...baseMeta,
        title: '메뉴 웹훅 | Slack·Discord·Teams 메뉴 알림 | Welplan',
        ogTitle: 'Welplan 팀 채널 메뉴 알림',
        description: 'Slack, Discord, Google Chat, Microsoft Teams 등 팀 채널로 원하는 식당의 메뉴를 예약 전송합니다.',
        robots: NOINDEX_ROBOTS
      }
    }

    if (pathname.startsWith('/privacy')) {
      return {
        ...baseMeta,
        title: '개인정보 처리방침 | Welplan',
        ogTitle: 'Welplan 개인정보 처리방침',
        description: 'Welplan 웹사이트와 Android 앱의 개인정보 처리방침입니다. 식당 선택 저장, 쿠키, 로컬 저장소, 문의 처리 방식을 안내합니다.'
      }
    }

    if (pathname.startsWith('/terms')) {
      return {
        ...baseMeta,
        title: '서비스 이용약관 | Welplan',
        ogTitle: 'Welplan 서비스 이용약관',
        description: 'Welplan의 비상업적 이용 범위, 상업적 이용 및 메뉴 이미지 재배포 금지, 서비스 중단과 책임 제한을 설명합니다.'
      }
    }

    if (pathname.startsWith('/data-deletion')) {
      return {
        ...baseMeta,
        title: '데이터 삭제 요청 | Welplan',
        ogTitle: 'Welplan 데이터 삭제 요청 안내',
        description: 'Welplan 사용자가 이메일로 데이터 삭제를 요청하는 방법을 안내합니다.'
      }
    }

    if (pathname.startsWith('/takein/') || pathname.startsWith('/takeout/')) {
      const [, kind, date, time] = pathname.split('/')
      const kindLabel = kind === 'takeout' ? '테이크아웃' : '테이크인'
      const dateLabel = /^\d{8}$/.test(date) ? formatKoreanDate(date) : '오늘'
      const mealLabel = time ? mealTimeName(mealTimes, time) : '식단'

      return {
        ...baseMeta,
        title: `${dateLabel} ${mealLabel} ${kindLabel} 식단 조회 | Welplan`,
        description: `${dateLabel} ${mealLabel} ${kindLabel} 식단. 웰스토리·신세계푸드 메뉴와 영양정보.`
      }
    }

    if ((pathname.startsWith('/restaurant/') || pathname.startsWith('/restaurants/')) && restaurant) {
      const vendorLabel = vendorName(restaurant.vendor)
      const lastSegment = pathname.split('/').filter(Boolean).pop() ?? ''
      const dateLabel = /^\d{8}$/.test(lastSegment) ? ` ${formatKoreanDate(lastSegment)}` : ''
      return {
        ...baseMeta,
        title: `${restaurant.name}${dateLabel} 오늘의 메뉴 | ${vendorLabel} | Welplan`,
        ogTitle: `${restaurant.name} 오늘의 구내식당 메뉴`,
        description: `${restaurant.name} ${vendorLabel} 구내식당의 오늘 식단표와 메뉴 사진, 칼로리 및 영양정보를 확인하세요.`
      }
    }

    if (pathname.startsWith('/docs/api')) {
      return {
        ...baseMeta,
        title: '구내식당 메뉴 API 문서 | Welplan',
        ogTitle: 'Welplan 구내식당 메뉴 API',
        description: '삼성웰스토리·신세계푸드 식당 검색과 날짜별 메뉴 조회, RSS 및 OpenAPI 사용법을 안내합니다.'
      }
    }

    if (pathname.startsWith('/admin')) {
      return {
        ...baseMeta,
        title: 'Admin | Welplan',
        ogTitle: 'Admin | Welplan',
        description: 'Welplan 관리자 페이지',
        robots: 'noindex, nofollow'
      }
    }

    if (pathname.startsWith('/restaurants')) {
      return {
        ...baseMeta,
        title: '식당 선택 | Welplan',
        description: 'Welplan에서 조회할 삼성웰스토리·신세계푸드 식당을 추가하고 관리합니다.',
        robots: NOINDEX_ROBOTS
      }
    }

    return baseMeta
  }

  let { data, children }: { data: LayoutData, children: Snippet } = $props()

  const navLinks = $derived([
    { href: '/', label: '메뉴 갤러리', icon: Camera },
    { href: '/takein', label: data.hasTakeOutMenu === true ? '테이크 인' : '메뉴 리스트', icon: Utensils },
    { href: '/takeout', label: '테이크 아웃', icon: Package },
    { href: '/restaurants', label: '식당 선택', icon: Store }
  ])
  const visibleNavLinks = $derived(navLinks.filter((link) => {
    if (link.href === '/') return data.hasGalleryMenuPictures === true
    if (link.href === '/takeout') return data.hasTakeOutMenu === true
    return true
  }))

  const isNavigating = $derived(navigating.to !== null)
  let showLoading = $state(false)
  let theme = $state<'light' | 'dark'>('light')
  let loadingTimer: ReturnType<typeof setTimeout> | undefined
  let firstVisitDialogOpen = $state(untrack(() => data.isFirstVisit))
  let dialogRestaurants = $state<Restaurant[]>(untrack(() => data.isFirstVisit ? [] : data.restaurants ?? []))
  let restaurantQuery = $state('')
  let allDialogRestaurants = $state<Restaurant[]>([])
  let restaurantSearchResults = $state<Restaurant[]>([])
  let restaurantSearching = $state(false)
  let restaurantSearchError = $state('')
  let lastSelectionRefresh = $state('')
  const dialogRestaurantIds = $derived(new Set(dialogRestaurants.map((restaurant) => restaurantKey(restaurant))))
  const visibleRestaurantSearchResults = $derived(restaurantQuery.trim() ? restaurantSearchResults : allDialogRestaurants)

  function restaurantKey (restaurant: Restaurant): string {
    return `${restaurant.vendor}:${restaurant.id}:${restaurant.name}:${restaurantPathText(restaurant)}`
  }

  function setTheme (nextTheme: 'light' | 'dark') {
    theme = nextTheme
    document.documentElement.dataset.theme = nextTheme
    document.querySelector<HTMLMetaElement>('#theme-color')?.setAttribute('content', nextTheme === 'dark' ? '#020617' : '#0f172a')
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch {}
  }

  function toggleTheme () {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    trackEvent('Theme Changed', { theme: nextTheme, source: 'footer' })
  }

  $effect(() => {
    const serverRestaurants = data.restaurants ?? []
    const clientRestaurants = readRestaurantSelectionFromClient()
    if (!firstVisitDialogOpen && !data.isFirstVisit && restaurantSelectionsEqual(serverRestaurants, clientRestaurants)) {
      dialogRestaurants = serverRestaurants
      lastSelectionRefresh = ''
      return
    }

    // A previous invalidation can complete after the cookie has changed. Reload
    // the layout once so navigation visibility uses the current selection.
    const selectionKey = clientRestaurants.map((restaurant) => `${restaurant.vendor}:${restaurant.id}`).join(',') || 'empty'
    if (!firstVisitDialogOpen && lastSelectionRefresh !== selectionKey) {
      lastSelectionRefresh = selectionKey
      void invalidateAll()
    }
  })

  $effect(() => {
    if (!browser) return
    document.body.classList.toggle('first-visit-modal-open', showFirstVisitDialog)

    return () => {
      document.body.classList.remove('first-visit-modal-open')
    }
  })

  async function loadAllDialogRestaurants () {
    restaurantSearching = true
    restaurantSearchError = ''
    try {
      const response = await fetch('/proxy/search?q=')
      if (!response.ok) throw new Error('검색 실패')
      allDialogRestaurants = await response.json()
    } catch (error) {
      restaurantSearchError = `검색 중 오류가 발생했습니다: ${error instanceof Error ? error.message : error}`
      allDialogRestaurants = []
    } finally {
      restaurantSearching = false
    }
  }

  async function persistDialogRestaurants (next: Restaurant[]) {
    dialogRestaurants = next
    saveRestaurantSelection(next)
    await invalidateAll()
  }

  function addDialogRestaurant (restaurant: Restaurant) {
    if (dialogRestaurantIds.has(restaurantKey(restaurant))) return
    trackEvent('Restaurant Added', { vendor: restaurant.vendor, restaurantId: restaurant.id, source: 'first_visit_dialog' })
    void persistDialogRestaurants([...dialogRestaurants, restaurant])
    void recordRestaurantSelection(restaurant).catch(() => undefined)
  }

  function removeDialogRestaurant (restaurant: Restaurant) {
    trackEvent('Restaurant Removed', { vendor: restaurant.vendor, restaurantId: restaurant.id, source: 'first_visit_dialog' })
    void persistDialogRestaurants(dialogRestaurants.filter((item) => restaurantKey(item) !== restaurantKey(restaurant)))
  }

  function navigateWithCurrentRestaurantSelection(event: MouseEvent) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return

    const target = event.target
    if (!(target instanceof Element)) return
    const link = target.closest<HTMLAnchorElement>('a[href]')
    if (!link || link.target || link.hasAttribute('download') || link.dataset.sveltekitReload !== undefined) return

    const destination = new URL(link.href)
    if (
      destination.origin !== window.location.origin ||
      (destination.pathname === window.location.pathname && destination.search === window.location.search) ||
      restaurantSelectionsEqual(data.restaurants ?? [], readRestaurantSelectionFromClient())
    ) return

    event.preventDefault()
    void goto(destination.href, { invalidateAll: true })
  }

  async function searchDialogRestaurants () {
    const query = restaurantQuery.trim()
    if (!query) {
      if (allDialogRestaurants.length === 0) loadAllDialogRestaurants()
      return
    }
    restaurantSearching = true
    restaurantSearchError = ''
    try {
      const response = await fetch(`/proxy/search?q=${encodeURIComponent(query)}`)
      if (!response.ok) throw new Error('검색 실패')
      restaurantSearchResults = await response.json()
      trackEvent('Restaurant Search', { queryLength: query.length, resultCount: restaurantSearchResults.length, source: 'first_visit_dialog' })
    } catch (error) {
      restaurantSearchError = `검색 중 오류가 발생했습니다: ${error instanceof Error ? error.message : error}`
      restaurantSearchResults = []
      trackEvent('Restaurant Search Failed', { queryLength: query.length, source: 'first_visit_dialog' })
    } finally {
      restaurantSearching = false
    }
  }

  function closeFirstVisitDialog () {
    if (dialogRestaurants.length === 0) return
    trackEvent('First Visit Dialog Closed', { restaurantCount: dialogRestaurants.length })
    void persistDialogRestaurants(dialogRestaurants)
    firstVisitDialogOpen = false
  }

  function activateAppUpdate (worker: ServiceWorker) {
    trackEvent('PWA Update Applied Automatically')
    worker.postMessage({ type: 'SKIP_WAITING' })
  }

  async function requestPersistentStorage () {
    if (!navigator.storage?.persisted || !navigator.storage.persist) return
    if (await navigator.storage.persisted()) return
    await navigator.storage.persist().catch(() => false)
  }

  async function registerServiceWorker () {
    if (!browser || !('serviceWorker' in navigator)) return

    const registration = await navigator.serviceWorker.register('/sw.js')

    if (registration.waiting && navigator.serviceWorker.controller) {
      activateAppUpdate(registration.waiting)
    }

    registration.addEventListener('updatefound', () => {
      const installingWorker = registration.installing
      if (!installingWorker) return

      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state !== 'installed') return

        if (navigator.serviceWorker.controller) {
          activateAppUpdate(installingWorker)
        }
      })
    })

    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
  }

  $effect(() => {
    if (isNavigating) {
      if (!showLoading && !loadingTimer) {
        loadingTimer = setTimeout(() => {
          showLoading = true
          loadingTimer = undefined
        }, 120)
      }

      return () => {
        if (loadingTimer) {
          clearTimeout(loadingTimer)
          loadingTimer = undefined
        }
      }
    }

    showLoading = false
  })

  onMount(() => {
    theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
    const restoredRestaurants = data.isFirstVisit ? restoreRestaurantCookieFromStorage() : []
    if (restoredRestaurants.length > 0) {
      dialogRestaurants = restoredRestaurants
      firstVisitDialogOpen = false
      invalidateAll()
    } else {
      firstVisitDialogOpen = data.isFirstVisit
      dialogRestaurants = data.isFirstVisit ? [] : data.restaurants ?? []
    }
    if (firstVisitDialogOpen) loadAllDialogRestaurants()

    requestPersistentStorage()

    registerServiceWorker().catch(() => {})
    const modelContext = document.modelContext
    if (!modelContext) return

    const controller = new AbortController()
    const resolvedRestaurants = new Map<string, Restaurant>()

    function pageSummary () {
      const headings = [...document.querySelectorAll('.content h1, .content h2, .content h3')]
        .map((heading) => heading.textContent?.trim())
        .filter(Boolean)
        .slice(0, MAX_WEB_MCP_PAGE_HEADINGS)
        .map((heading) => heading?.slice(0, 100))
      const bodyText = document.querySelector('.content')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

      return {
        url: window.location.href,
        path: window.location.pathname,
        title: document.title,
        headings,
        text: bodyText.slice(0, MAX_WEB_MCP_PAGE_TEXT)
      }
    }

    async function registerWebMcpTools () {
      for (const tool of WEB_MCP_TOOLS) {
        await modelContext.registerTool(
          {
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: {
              readOnlyHint: tool.readOnlyHint,
              untrustedContentHint: tool.untrustedContentHint
            },
            execute: async (input: Record<string, unknown>) => {
              trackEvent('WebMCP Tool Called', { tool: tool.name })
              switch (tool.name) {
                case 'welplan.search-restaurants': {
                  const query = typeof input.query === 'string' ? input.query.trim() : ''
                  if (!query || query.length > 100) throw new Error('query must be between 1 and 100 characters')

                  const response = await fetch(`/proxy/search?q=${encodeURIComponent(query)}`)
                  if (!response.ok) throw new Error(`Search failed with status ${response.status}`)
                  const value: unknown = await response.json()
                  if (!Array.isArray(value)) throw new Error('Search returned an invalid response')
                  const results = value.filter(isRestaurant)
                  const visibleResults = results.slice(0, MAX_WEB_MCP_SEARCH_RESULTS)
                  for (const restaurant of visibleResults) {
                    const key = `${restaurant.vendor}:${restaurant.id}`
                    resolvedRestaurants.delete(key)
                    resolvedRestaurants.set(key, restaurant)
                  }
                  while (resolvedRestaurants.size > MAX_WEB_MCP_RESOLVED_RESTAURANTS) {
                    const oldestKey = resolvedRestaurants.keys().next().value
                    if (typeof oldestKey !== 'string') break
                    resolvedRestaurants.delete(oldestKey)
                  }
                  return {
                    query,
                    resultCount: results.length,
                    truncated: results.length > MAX_WEB_MCP_SEARCH_RESULTS,
                    results: visibleResults.map((restaurant) => ({
                      id: restaurant.id,
                      name: restaurant.name,
                      vendor: restaurant.vendor,
                      path: restaurant.path?.slice(0, 8)
                    }))
                  }
                }
                case 'welplan.open-restaurant': {
                  const vendor = input.vendor === 'welstory' || input.vendor === 'shinsegae' ? input.vendor : ''
                  const id = typeof input.id === 'string' ? input.id.trim() : ''
                  const name = typeof input.name === 'string' ? input.name.trim() : ''
                  const date = typeof input.date === 'string' ? input.date.trim() : ''
                  if (!vendor || !id || id.length > 256) throw new Error('vendor and a valid id are required')
                  if (name.length > 200) throw new Error('name must not exceed 200 characters')
                  if (date && !/^\d{8}$/.test(date)) throw new Error('date must use YYYYMMDD format')

                  const restaurant = resolvedRestaurants.get(`${vendor}:${id}`)
                  if (!restaurant) throw new Error(`Restaurant ${id} was not verified. Call welplan.search-restaurants first.`)
                  if (name && name !== restaurant.name) throw new Error(`Restaurant name does not match the verified result for ${id}`)
                  const target = date
                    ? restaurantDatedPath(restaurant, date)
                    : restaurantDetailPath(restaurant)
                  void goto(target).catch((error) => console.warn('WebMCP navigation failed', error))
                  return {
                    ok: true,
                    status: 'navigation-requested',
                    url: new URL(target, window.location.origin).toString()
                  }
                }
                case 'welplan.get-current-page':
                  return pageSummary()
                default:
                  throw new Error(`Unsupported tool '${tool.name}'`)
              }
            }
          },
          { signal: controller.signal }
        )
      }
    }

    registerWebMcpTools()
      .catch((error) => {
        if (controller.signal.aborted) return
        controller.abort()
        console.warn('WebMCP tool registration failed', error)
      })

    return () => {
      controller.abort()
    }
  })

  const restaurantMeta = $derived(restaurantFromPageData(page.data))
  const isAdminPage = $derived(page.url.pathname.startsWith('/admin'))

  $effect(() => {
    if (!browser || !restaurantMeta) return

    const selectedRestaurants = readRestaurantSelectionFromClient()
    const isSelected = selectedRestaurants.some((restaurant) =>
      restaurant.vendor === restaurantMeta.vendor && restaurant.id === restaurantMeta.id
    )
    if (isSelected) return

    const next = [...selectedRestaurants, restaurantMeta]
    dialogRestaurants = next
    firstVisitDialogOpen = false
    saveRestaurantSelection(next)
    trackEvent('Restaurant Added', {
      vendor: restaurantMeta.vendor,
      restaurantId: restaurantMeta.id,
      source: 'restaurant_detail'
    })
    void recordRestaurantSelection(restaurantMeta).catch(() => undefined)
    void invalidateAll()
  })

  const routeMeta = $derived.by(() => {
    let meta = routeMetaFor(page.url.pathname, data.mealTimes ?? [], restaurantMeta)
    const pageData = page.data as { pageDescription?: string, indexable?: boolean }
    if (pageData.pageDescription) meta = { ...meta, description: pageData.pageDescription }
    if (pageData.indexable === false) meta = { ...meta, robots: NOINDEX_ROBOTS }
    return meta
  })
  const pageCanonicalPath = $derived(canonicalPathFromPageData(page.data))
  const isRestaurantDetailPage = $derived((page.url.pathname.startsWith('/restaurant/') || page.url.pathname.startsWith('/restaurants/')) && restaurantMeta !== undefined)
  const hideGlobalNav = $derived(page.url.searchParams.has('nonav'))
  const showGlobalChrome = $derived(!hideGlobalNav)
  const showFirstVisitDialog = $derived(
    firstVisitDialogOpen &&
    !isAdminPage &&
    !page.url.pathname.startsWith('/restaurants') &&
    !page.url.pathname.startsWith('/webhooks')
  )
  const notice = $derived(data.notice)
  const showNotice = $derived(notice?.enabled === true && ((notice.summary?.length ?? 0) > 0 || (notice.detail?.length ?? 0) > 0 || (notice.contentHtml?.length ?? 0) > 0))
  const noticeHref = $derived(hideGlobalNav ? '/notice?nonav' : '/notice')
  const canonicalUrl = $derived(new URL(pageCanonicalPath ?? page.url.pathname, page.url.origin).toString())
  const rssUrl = $derived(new URL('/rss.xml', page.url.origin).toString())
  const ogImageWebpUrl = $derived(new URL('/og-image.webp', page.url.origin).toString())
  const jsonLd = $derived(jsonLdForPage(page.url.pathname, page.url.origin, canonicalUrl, routeMeta, restaurantMeta, page.data))
</script>

<svelte:head>
  <title>{routeMeta.title}</title>
  <meta name="application-name" content="Welplan" />
  <meta name="author" content="Welplan" />
  <meta name="creator" content="Welplan" />
  <meta name="publisher" content="Welplan" />
  <meta name="description" content={routeMeta.description} />
  <meta name="robots" content={routeMeta.robots} />
  <meta name="googlebot" content={routeMeta.robots} />
  <meta name="bingbot" content={routeMeta.robots} />
  <meta property="og:locale" content="ko_KR" />
  <meta property="og:site_name" content="Welplan" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={routeMeta.ogTitle} />
  <meta property="og:description" content={routeMeta.description} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content={ogImageWebpUrl} />
  <meta property="og:image:secure_url" content={ogImageWebpUrl} />
  <meta property="og:image:type" content="image/webp" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={`${routeMeta.ogTitle} 대표 이미지`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={routeMeta.ogTitle} />
  <meta name="twitter:description" content={routeMeta.description} />
  <meta name="twitter:image" content={ogImageWebpUrl} />
  <meta name="twitter:image:alt" content={`${routeMeta.ogTitle} 대표 이미지`} />
  <link rel="canonical" href={canonicalUrl} />
  <link rel="alternate" hreflang="ko-KR" href={canonicalUrl} />
  <link rel="alternate" hreflang="x-default" href={canonicalUrl} />
  <link rel="alternate" type="application/rss+xml" title="Welplan RSS" href={rssUrl} />
  <link rel="api-catalog" href={API_CATALOG_PATH} />
  <link rel="service-doc" href={API_DOC_PATH} />
  <link rel="service-desc" href={OPENAPI_PATH} />
  <link rel="describedby" href={AGENT_SKILLS_INDEX_PATH} />
  <link rel="describedby" type="text/plain" href="/llms.txt" title="LLM usage guide" />
  {#if isRestaurantDetailPage}
    <link rel="alternate" type="text/markdown" href={canonicalUrl} />
  {/if}
  {#if showFirstVisitDialog}
    <style id="first-visit-ssr-scroll-lock">
      html,
      body {
        overflow: hidden;
      }
    </style>
  {/if}
  {#each jsonLd as item}
    {@html jsonLdScript(item)}
  {/each}
</svelte:head>

<div class="app" onclickcapture={navigateWithCurrentRestaurantSelection}>
  {#if showNotice && notice}
    <section class="notice-shell" aria-label="공지사항">
      <a class="notice-bar" href={noticeHref} onclick={() => trackEvent('Notice Bar Clicked', { source: 'global_bar', nonav: hideGlobalNav ? 1 : 0 })}>
        <span class="notice-bar-badge">
          <Megaphone class="notice-icon" aria-hidden="true" />
          공지
        </span>
        <span class="notice-bar-text">
          {#if notice.title}
            <strong>{notice.title}</strong>
          {/if}
          {notice.summary || notice.detail || '공지사항을 확인해 주세요'}
        </span>
        <span class="notice-bar-action">자세히</span>
      </a>
    </section>
  {/if}

  {#if showFirstVisitDialog}
    <div class="first-visit-backdrop" role="presentation">
      <div class="first-visit-dialog" role="dialog" aria-modal="true" aria-labelledby="first-visit-title">
        <div class="first-visit-head">
          <div>
            <h2 id="first-visit-title">자주 이용하는 식당을 선택해 주세요</h2>
            <p>선택한 식당 기준으로 갤러리, 테이크인, 테이크아웃 메뉴가 표시됩니다.</p>
          </div>
        </div>

        <div class="first-visit-grid">
          <section class="first-visit-panel" aria-labelledby="first-visit-selected-title">
            <div class="first-visit-panel-head">
              <h3 id="first-visit-selected-title">선택된 식당</h3>
              <span>{dialogRestaurants.length}개</span>
            </div>

            {#if dialogRestaurants.length === 0}
                <div class="first-visit-empty first-visit-empty-selected">
                  <Store class="first-visit-empty-icon" aria-hidden="true" />
                  <span>추가된 식당이 없습니다. 검색에서 식당을 추가하세요.</span>
                </div>
            {:else}
              <ul class="first-visit-list">
                {#each dialogRestaurants as restaurant (restaurantKey(restaurant))}
                  <li class="first-visit-item">
                    <div class="first-visit-restaurant">
                      <p>{restaurant.name}</p>
                      {#if restaurantPathText(restaurant)}
                        <span>{restaurantPathText(restaurant)}</span>
                      {/if}
                    </div>
                    <span class="first-visit-vendor vendor-{restaurant.vendor}">{vendorName(restaurant.vendor)}</span>
                    <button type="button" class="first-visit-remove" onclick={() => removeDialogRestaurant(restaurant)}>삭제</button>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>

          <section class="first-visit-panel" aria-labelledby="first-visit-search-title">
            <div class="first-visit-panel-head">
              <h3 id="first-visit-search-title">식당 검색</h3>
            </div>

            <div class="first-visit-search-row">
              <Search class="first-visit-search-icon" aria-hidden="true" />
              <input
                type="text"
                placeholder="식당 이름을 입력하세요..."
                bind:value={restaurantQuery}
                oninput={searchDialogRestaurants}
              />
              {#if restaurantSearching}<span>검색 중...</span>{/if}
            </div>

            {#if restaurantSearchError}
              <p class="first-visit-error">{restaurantSearchError}</p>
            {:else if visibleRestaurantSearchResults.length === 0 && restaurantQuery.trim() && !restaurantSearching}
              <div class="first-visit-empty">검색 결과가 없습니다.</div>
            {:else if visibleRestaurantSearchResults.length > 0}
              <ul class="first-visit-list">
                {#each visibleRestaurantSearchResults as restaurant (restaurantKey(restaurant))}
                  {@const added = dialogRestaurantIds.has(restaurantKey(restaurant))}
                  <li>
                    {#if added}
                      <div class="first-visit-item first-visit-item-added">
                        <div class="first-visit-restaurant">
                          <p>{restaurant.name}</p>
                          {#if restaurantPathText(restaurant)}
                            <span>{restaurantPathText(restaurant)}</span>
                          {/if}
                        </div>
                        <span class="first-visit-vendor vendor-{restaurant.vendor}">{vendorName(restaurant.vendor)}</span>
                        <span class="first-visit-added">
                          <Check class="first-visit-added-icon" aria-hidden="true" />
                          추가됨
                        </span>
                      </div>
                    {:else}
                      <button type="button" class="first-visit-item first-visit-item-button" onclick={() => addDialogRestaurant(restaurant)}>
                        <div class="first-visit-restaurant">
                          <p>{restaurant.name}</p>
                          {#if restaurantPathText(restaurant)}
                            <span>{restaurantPathText(restaurant)}</span>
                          {/if}
                        </div>
                        <span class="first-visit-vendor vendor-{restaurant.vendor}">{vendorName(restaurant.vendor)}</span>
                        <span class="first-visit-add">+ 추가</span>
                      </button>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        </div>

        <div class="first-visit-actions">
          <button type="button" disabled={dialogRestaurants.length === 0} onclick={closeFirstVisitDialog}>이대로 시작하기</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showGlobalChrome}
    <header>
      <div class="header-inner">
        <a href="/" class="brand">
          <img class="brand-icon" src="/favicon.svg" alt="" aria-hidden="true" />
          <div class="brand-text">
            <span class="brand-name">Welplan</span>
            <span class="brand-sub">웰스토리 · 신세계푸드</span>
          </div>
        </a>
        <nav class="header-nav">
          {#each visibleNavLinks as link}
            {@const Icon = link.icon}
            <a href={link.href} class="tab-btn" class:active={(page.url.pathname.startsWith(link.href) && (link.href !== '/' || page.url.pathname === '/')) || (link.href === '/takein' && page.url.pathname === '/' && data.hasGalleryMenuPictures !== true)} onclick={() => trackEvent('Navigation Tab Clicked', { href: link.href, label: link.label })}>
              <Icon class="tab-icon" aria-hidden="true" />
              <span class="tab-label">{link.label}</span>
            </a>
          {/each}
        </nav>
      </div>

      {#if showLoading}
        <div class="route-progress" role="status" aria-label="페이지 불러오는 중">
          <div class="route-progress-bar route-progress-bar-secondary" aria-hidden="true"></div>
          <div class="route-progress-bar route-progress-bar-primary" aria-hidden="true"></div>
        </div>
      {/if}
    </header>
  {/if}

  {#if showLoading && isRestaurantDetailPage && !showGlobalChrome}
    <div class="route-progress route-progress-floating" role="status" aria-label="페이지 불러오는 중">
      <div class="route-progress-bar route-progress-bar-secondary" aria-hidden="true"></div>
      <div class="route-progress-bar route-progress-bar-primary" aria-hidden="true"></div>
    </div>
  {/if}

  {#if !hideGlobalNav}
    <a
      class="webhook-shortcut notification-shortcut"
      href="/webhooks"
      aria-label="Slack, Discord, Teams 메뉴 알림 설정"
      onclick={() => trackEvent('Webhook Shortcut Clicked', { source: 'floating_button' })}
    >
      <span class="notification-shortcut-icon-wrap" aria-hidden="true">
        <BellRing class="notification-shortcut-icon" />
      </span>
      <span class="notification-shortcut-copy">
        <strong>메뉴 알림 받기</strong>
        <small>Slack · Discord · Teams</small>
      </span>
    </a>
    <a
      class="webhook-shortcut llm-api-shortcut"
      href="/docs/api"
      aria-label="LLM API 문서"
      onclick={() => trackEvent('LLM API Shortcut Clicked', { source: 'floating_button' })}
    >
      <Braces class="webhook-shortcut-icon" aria-hidden="true" />
      <span>LLM APIs</span>
    </a>
    <a
      class="webhook-shortcut terms-shortcut"
      href="/terms"
      aria-label="서비스 이용약관"
      onclick={() => trackEvent('Terms Shortcut Clicked', { source: 'floating_button' })}
    >
      <FileText class="webhook-shortcut-icon" aria-hidden="true" />
      <span>이용 약관</span>
    </a>
  {/if}

  <main class="content" class:content-loading={showLoading} class:focused-content={isRestaurantDetailPage || hideGlobalNav} aria-busy={showLoading}>
    {@render children()}

    <footer class="legal-notice" aria-label="메뉴 알림, 이용약관, 상표, 개인정보 및 문의 안내">
      <p>
        삼성웰스토리, 신세계푸드 및 각 사의 브랜드명, 식당명에 포함된 회사명·브랜드명 등 모든 상표는 해당 권리자에게 귀속됩니다.
        Welplan은 해당 상표권자 및 관련 회사와 제휴, 후원, 승인, 위탁, 대리 또는 그 밖의 공식 관계가 전혀 없는 독립적인 사이트 및 애플리케이션이며, 해당 회사들은 Welplan의 개발·운영·검수에 참여하지 않습니다.
        <a href="/terms">서비스 이용약관</a>, <a href="/privacy">개인정보 처리방침</a>과 <a href="/data-deletion">데이터 삭제 요청 안내</a>를 확인할 수 있으며, 문의 및 건의사항은 <a href="https://github.com/pmh-only/welplan2" target="_blank" rel="noreferrer">GitHub 저장소</a> 또는 <a href="mailto:pmh_only@pmh.codes">pmh_only@pmh.codes</a>로 연락해 주세요.
      </p>
      <p class="mobile-footer-action">
        <strong>매일 메뉴를 찾아보지 않아도 돼요</strong>
        <span>선택한 식당의 메뉴를 Slack · Discord · Teams에서 원하는 요일과 시간에 받아보세요.</span>
        <a href="/webhooks" onclick={() => trackEvent('Webhook Shortcut Clicked', { source: 'footer_link' })}>메뉴 알림 설정하기</a>
      </p>
      <nav class="mobile-footer-links" aria-label="LLM API 문서와 이용약관">
        <a class="mobile-footer-link mobile-footer-api" href="/docs/api" onclick={() => trackEvent('LLM API Shortcut Clicked', { source: 'footer_link' })}>
          <Braces class="mobile-footer-link-icon" aria-hidden="true" />
          LLM APIs
        </a>
        <a class="mobile-footer-link mobile-footer-terms" href="/terms" onclick={() => trackEvent('Terms Shortcut Clicked', { source: 'footer_link' })}>
          <FileText class="mobile-footer-link-icon" aria-hidden="true" />
          이용약관
        </a>
      </nav>
      <div class="footer-theme-row">
        <button
          type="button"
          class="theme-toggle"
          aria-pressed={theme === 'dark'}
          aria-label={theme === 'dark' ? '라이트 테마로 전환' : '다크 테마로 전환'}
          onclick={toggleTheme}
        >
          {#if theme === 'dark'}
            <Sun class="theme-toggle-icon" aria-hidden="true" />
            <span>라이트 모드</span>
          {:else}
            <Moon class="theme-toggle-icon" aria-hidden="true" />
            <span>다크 모드</span>
          {/if}
        </button>
      </div>
    </footer>
  </main>
</div>

<style>
  .app { min-height: 100vh; }

  :global(html:has(body.first-visit-modal-open)),
  :global(body.first-visit-modal-open) {
    overflow: hidden;
  }

  .legal-notice {
    margin-top: 28px;
    padding: 18px 4px 4px;
    border-top: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.7;
  }

  .legal-notice p {
    max-width: 980px;
    margin: 0 auto;
  }

  .legal-notice a {
    color: var(--text-muted);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .legal-notice .mobile-footer-action {
    display: none;
  }

  .legal-notice .mobile-footer-links {
    display: none;
  }

  .footer-theme-row {
    display: flex;
    justify-content: center;
    max-width: 980px;
    margin: 14px auto 0;
  }

  .theme-toggle {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 34px;
    padding: 7px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-muted);
    background: var(--surface);
    font-size: 11px;
    font-weight: 600;
    transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
  }

  .theme-toggle:hover {
    border-color: var(--border-focus);
    color: var(--text);
    background: var(--surface-hover);
  }

  .theme-toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  :global(.theme-toggle-icon) {
    width: 14px;
    height: 14px;
  }

  .legal-notice a:hover { color: var(--text); }

  .notice-shell {
    position: relative;
    z-index: 120;
    background: #111827;
  }

  .notice-bar {
    width: 100%;
    border: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 10px 20px;
    background: linear-gradient(90deg, #7c3aed 0%, #4f46e5 50%, #0891b2 100%);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }

  .notice-bar:hover {
    filter: brightness(1.05);
  }

  .notice-bar-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.25);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  :global(.notice-icon) {
    width: 13px;
    height: 13px;
  }

  .notice-bar-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .notice-bar-text strong {
    margin-right: 8px;
  }

  .notice-bar-action {
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 800;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .first-visit-backdrop {
    position: fixed;
    inset: 0;
    z-index: 220;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.58);
    backdrop-filter: blur(8px);
  }

  .first-visit-dialog {
    width: min(1120px, 100%);
    height: min(920px, calc(100vh - 24px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 0;
    border-radius: 14px;
    background: var(--surface);
    box-shadow: 0 30px 80px rgba(15, 23, 42, 0.34);
  }

  .first-visit-head {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    padding: 22px 24px 18px;
    background: #0f172a;
    color: #f8fafc;
  }

  .first-visit-eyebrow {
    margin-bottom: 6px;
    color: #86efac;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .first-visit-head h2 {
    margin: 0 0 7px;
    font-size: clamp(1.2rem, 2.4vw, 1.7rem);
    letter-spacing: -0.03em;
  }

  .first-visit-head p:last-child {
    margin: 0;
    color: #d1fae5;
    font-size: 13px;
    line-height: 1.55;
  }

  .first-visit-close {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.1);
  }

  .first-visit-close:hover {
    background: rgba(255, 255, 255, 0.18);
  }

  :global(.first-visit-close-icon) {
    width: 17px;
    height: 17px;
  }

  .first-visit-grid {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 14px;
    padding: 16px;
    overflow: auto;
  }

  .first-visit-panel {
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
    box-shadow: var(--shadow-sm);
  }

  .first-visit-panel[aria-labelledby="first-visit-search-title"] {
    order: -1;
  }

  .first-visit-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 13px 15px;
    border-bottom: 1px solid var(--border);
  }

  .first-visit-panel-head h3 {
    margin: 0;
    padding-left: 10px;
    border-left: 3px solid var(--green);
    color: var(--text);
    font-size: 0.95rem;
    font-weight: 700;
  }

  .first-visit-panel-head span {
    flex-shrink: 0;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text-dim);
    font-size: 12px;
  }

  .first-visit-list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 10px 14px 14px;
  }

  .first-visit-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }

  .first-visit-item-added {
    opacity: 0.68;
  }

  .first-visit-item-button {
    width: 100%;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .first-visit-item-button:hover {
    border-color: #6ee7b7;
    background: var(--success-bg);
  }

  .first-visit-restaurant {
    min-width: 0;
  }

  .first-visit-restaurant p {
    margin: 0;
    overflow: hidden;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .first-visit-restaurant span {
    display: block;
    overflow: hidden;
    margin-top: 2px;
    color: var(--text-dim);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .first-visit-vendor {
    flex-shrink: 0;
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
  }

  .vendor-welstory {
    background: var(--info-bg);
    color: var(--info-text);
  }

  .vendor-shinsegae {
    background: var(--pink-bg);
    color: var(--pink-text);
  }

  .first-visit-remove,
  .first-visit-add {
    flex-shrink: 0;
    padding: 5px 11px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
  }

  .first-visit-remove {
    border: 1px solid #fca5a5;
    background: var(--danger-bg);
    color: var(--danger-text);
  }

  .first-visit-remove:hover {
    background: var(--danger-bg);
  }

  .first-visit-add {
    border: 1px solid #6ee7b7;
    background: var(--success-bg);
    color: var(--success-text);
  }

  .first-visit-add:hover {
    background: var(--green-dim);
  }

  .first-visit-added {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #059669;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  :global(.first-visit-added-icon) {
    width: 13px;
    height: 13px;
  }

  .first-visit-search-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 14px 14px 4px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }

  .first-visit-search-row:focus-within {
    border-color: var(--border-focus);
    background: var(--card);
  }

  .first-visit-search-row input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    padding: 10px 4px;
    background: transparent;
    color: var(--text);
    font-size: 13px;
  }

  .first-visit-search-row span {
    color: var(--text-dim);
    font-size: 12px;
    white-space: nowrap;
  }

  :global(.first-visit-search-icon) {
    width: 14px;
    height: 14px;
    color: var(--text-dim);
    flex-shrink: 0;
  }

  .first-visit-empty,
  .first-visit-error {
    margin: 0;
    padding: 18px 15px;
    font-size: 13px;
  }

  .first-visit-empty {
    color: var(--text-dim);
    font-style: italic;
  }

  .first-visit-empty-selected {
    min-height: 220px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 12px;
    text-align: center;
  }

  :global(.first-visit-empty-icon) {
    width: 44px;
    height: 44px;
    color: #94a3b8;
    stroke-width: 1.8;
  }

  .first-visit-error {
    color: #dc2626;
  }

  .first-visit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 16px 16px;
    border-top: 1px solid var(--border);
    background: var(--card);
  }

  .first-visit-actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 800;
    text-decoration: none;
  }

  .first-visit-actions button {
    border: 0;
    background: #10b981;
    color: #fff;
  }

  .first-visit-actions button:hover {
    background: #059669;
  }

  .first-visit-actions button:disabled {
    background: #cbd5e1;
    color: var(--text-dim);
    cursor: not-allowed;
  }

  .first-visit-actions button:disabled:hover {
    background: #cbd5e1;
  }
  header {
    background: #0f172a;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }

  .route-progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    overflow: hidden;
    pointer-events: none;
    background: rgba(148, 163, 184, 0.14);
  }

  .route-progress-floating {
    position: fixed;
    top: 0;
    bottom: auto;
    z-index: 120;
  }

  .route-progress-bar {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 999px;
    transform-origin: left center;
    will-change: transform;
  }

  .route-progress-bar-primary {
    width: 38%;
    background: linear-gradient(90deg, rgba(56, 189, 248, 0.1) 0%, #38bdf8 24%, #10b981 100%);
    box-shadow: 0 0 14px rgba(16, 185, 129, 0.28);
    animation: route-progress-primary 1.35s cubic-bezier(0.22, 1, 0.36, 1) infinite;
  }

  .route-progress-bar-secondary {
    width: 56%;
    opacity: 0.42;
    background: linear-gradient(90deg, rgba(16, 185, 129, 0) 0%, rgba(16, 185, 129, 0.45) 30%, rgba(56, 189, 248, 0.78) 100%);
    animation: route-progress-secondary 1.8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
  }

  .header-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
    display: flex;
    align-items: center;
    gap: 24px;
    height: 52px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    flex-shrink: 0;
  }
  .brand-icon { width: 22px; height: 22px; flex-shrink: 0; }
  .brand-text { display: flex; flex-direction: column; gap: 0; }
  .brand-name { font-size: 1rem; font-weight: 700; color: #f8fafc; line-height: 1.2; letter-spacing: -0.01em; }
  .brand-sub { font-size: 0.7rem; color: #94a3b8; line-height: 1; }

  .header-nav { display: flex; gap: 2px; flex: 1; }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 7px;
    color: #94a3b8;
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    transition: background 0.12s, color 0.12s;
    white-space: nowrap;
    position: relative;
  }

  :global(.tab-icon) { width: 14px; height: 14px; flex-shrink: 0; }
  .tab-label { }

  .tab-btn:hover { color: #cbd5e1; background: rgba(255, 255, 255, 0.07); }
  .tab-btn.active { color: #f8fafc; background: rgba(255, 255, 255, 0.12); }
  .tab-btn.active::after {
    content: '';
    position: absolute;
    bottom: -7px;
    left: 50%;
    transform: translateX(-50%);
    width: 20px;
    height: 2px;
    background: #10b981;
    border-radius: 2px;
  }

  .webhook-shortcut {
    position: fixed;
    top: 64px;
    right: 0;
    z-index: 125;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 8px 11px;
    border: 1px solid #047857;
    border-right: 0;
    border-radius: 999px 0 0 999px;
    color: #fff;
    background: #059669;
    box-shadow: 0 8px 24px rgba(5, 150, 105, 0.32);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    text-decoration: none;
    backdrop-filter: blur(8px);
    transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s;
  }

  .webhook-shortcut:hover {
    transform: translateX(-3px);
    border-color: #065f46;
    background: #047857;
    box-shadow: 0 10px 28px rgba(5, 150, 105, 0.42);
  }

  .webhook-shortcut:focus-visible {
    outline: 3px solid #fbbf24;
    outline-offset: 2px;
  }

  .notification-shortcut {
    min-height: 54px;
    gap: 9px;
    padding: 8px 16px 8px 9px;
    border-color: #10b981;
    background: linear-gradient(135deg, #065f46, #047857);
    box-shadow: 0 10px 30px rgba(5, 150, 105, 0.38), 0 0 0 2px rgba(16, 185, 129, 0.14);
  }

  .notification-shortcut:hover {
    border-color: #34d399;
    background: linear-gradient(135deg, #064e3b, #065f46);
    box-shadow: 0 12px 34px rgba(5, 150, 105, 0.48), 0 0 0 3px rgba(16, 185, 129, 0.18);
  }

  .notification-shortcut-icon-wrap {
    display: grid;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.14);
  }

  :global(.notification-shortcut-icon) {
    width: 20px;
    height: 20px;
    stroke-width: 2.2;
  }

  .notification-shortcut-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    white-space: nowrap;
  }

  .notification-shortcut-copy strong {
    font-size: 13px;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.01em;
  }

  .notification-shortcut-copy small {
    color: #d1fae5;
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
  }

  .terms-shortcut {
    top: 170px;
    border-color: #475569;
    background: #64748b;
    box-shadow: 0 8px 24px rgba(71, 85, 105, 0.3);
  }

  .terms-shortcut:hover {
    border-color: #334155;
    background: #475569;
    box-shadow: 0 10px 28px rgba(71, 85, 105, 0.4);
  }

  .llm-api-shortcut {
    top: 126px;
    border-color: #2563eb;
    background: #3b82f6;
    box-shadow: 0 8px 24px rgba(37, 99, 235, 0.3);
  }

  .llm-api-shortcut:hover {
    border-color: #1d4ed8;
    background: #2563eb;
    box-shadow: 0 10px 28px rgba(37, 99, 235, 0.4);
  }

  :global(.webhook-shortcut-icon) {
    width: 14px;
    height: 14px;
  }

  @media (display-mode: window-controls-overlay) {
    header {
      min-height: max(52px, env(titlebar-area-height, 52px));
      -webkit-app-region: drag;
      app-region: drag;
    }

    .header-inner {
      width: env(titlebar-area-width, 100%);
      max-width: none;
      height: max(52px, env(titlebar-area-height, 52px));
      margin-left: env(titlebar-area-x, 0);
      margin-right: 0;
      padding-left: max(20px, env(safe-area-inset-left));
      padding-right: 20px;
    }

    .brand,
    .header-nav,
    .tab-btn,
    button,
    a {
      -webkit-app-region: no-drag;
      app-region: no-drag;
    }
  }

  .content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px 16px;
    transition: opacity 0.18s ease, filter 0.18s ease;
  }

  .focused-content {
    max-width: 1040px;
  }

  .content-loading {
    opacity: 0.88;
    filter: saturate(0.96);
  }

  @keyframes route-progress-primary {
    0% { transform: translateX(-130%) scaleX(0.72); }
    55% { transform: translateX(55%) scaleX(1); }
    100% { transform: translateX(240%) scaleX(0.86); }
  }

  @keyframes route-progress-secondary {
    0% { transform: translateX(-170%) scaleX(0.35); }
    60% { transform: translateX(35%) scaleX(0.82); }
    100% { transform: translateX(210%) scaleX(0.52); }
  }

  @media (prefers-reduced-motion: reduce) {
    .route-progress-bar-primary,
    .route-progress-bar-secondary {
      animation: none;
      transform: none;
    }

    .route-progress-bar-primary { width: 58%; }
    .route-progress-bar-secondary { display: none; }
    .content { transition: none; }
    .webhook-shortcut { transition: none; }
  }

  @media (max-width: 640px) {
    .first-visit-backdrop {
      place-items: stretch;
      overflow: hidden;
      padding: 0;
    }

    .first-visit-dialog {
      width: 100%;
      height: 100vh;
      height: 100dvh;
      max-height: none;
      border: 0;
      border-radius: 0;
    }

    .first-visit-head {
      padding: 18px 16px 16px;
    }

    .first-visit-head p:last-child {
      display: none;
    }

    .first-visit-grid {
      flex: 1;
      min-height: 0;
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr);
      gap: 12px;
      padding: 12px;
      overflow: hidden;
    }

    .first-visit-panel[aria-labelledby="first-visit-selected-title"] {
      display: none;
    }

    .first-visit-panel[aria-labelledby="first-visit-search-title"] {
      order: 0;
    }

    .first-visit-panel[aria-labelledby="first-visit-search-title"] {
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .first-visit-panel[aria-labelledby="first-visit-search-title"] .first-visit-list {
      flex: 1;
      max-height: none;
    }

    .first-visit-list {
      max-height: 150px;
      padding: 8px 10px 10px;
    }

    .first-visit-item {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .first-visit-vendor {
      display: none;
    }

    .first-visit-actions { padding: 12px; }

    .first-visit-actions button {
      width: 100%;
    }

    .header-inner { height: auto; padding: 10px 16px; }
    .header-nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 130;
      width: 100%;
      padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
      background: rgba(15, 23, 42, 0.96);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.22);
      overflow-x: auto;
      scrollbar-width: none;
      gap: 2px;
    }
    .header-nav::-webkit-scrollbar { display: none; }
    .webhook-shortcut {
      top: 54px;
      right: 0;
    }
    .notification-shortcut,
    .llm-api-shortcut,
    .terms-shortcut { display: none; }
    .legal-notice .mobile-footer-action {
      display: block;
      margin-top: 14px;
      text-align: center;
    }

    .mobile-footer-action strong,
    .mobile-footer-action span {
      display: block;
    }

    .mobile-footer-action strong {
      color: var(--text);
      font-size: 13px;
    }

    .mobile-footer-action span {
      max-width: 320px;
      margin: 3px auto 5px;
      color: var(--text-dim);
      font-size: 11px;
    }

    .mobile-footer-action a {
      color: var(--success-text);
      font-size: 12px;
      font-weight: 700;
    }
    .legal-notice .mobile-footer-links {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      max-width: 320px;
      margin: 12px auto 0;
    }
    .legal-notice .mobile-footer-link {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 38px;
      padding: 8px 10px;
      border: 1px solid;
      border-radius: 9px;
      font-size: 11px;
      font-weight: 700;
      text-decoration: none;
    }
    .legal-notice .mobile-footer-api {
      border-color: #bfdbfe;
      background: var(--info-bg);
      color: var(--info-text);
    }
    .legal-notice .mobile-footer-terms {
      border-color: #cbd5e1;
      background: var(--surface);
      color: var(--text-muted);
    }
    :global(.mobile-footer-link-icon) {
      width: 14px;
      height: 14px;
    }
    .tab-btn {
      flex: 1 0 64px;
      flex-direction: column;
      justify-content: center;
      gap: 3px;
      min-height: 48px;
      padding: 6px 4px;
      border-radius: 10px;
      font-size: 11px;
    }
    :global(.tab-icon) { width: 16px; height: 16px; }
    .tab-btn.active::after { top: 3px; bottom: auto; width: 18px; }
    .brand-sub { display: none; }
    .content { padding: 14px 12px calc(82px + env(safe-area-inset-bottom)); }
  }
</style>
