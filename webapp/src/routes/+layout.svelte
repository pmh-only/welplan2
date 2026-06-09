<script lang="ts">
  import { goto } from '$app/navigation'
  import { browser } from '$app/environment'
  import '../app.css'
  import type { Snippet } from 'svelte'
  import { onMount } from 'svelte'
  import { navigating, page } from '$app/state'
  import { Camera, Lightbulb, Megaphone, Package, Store, Utensils, X } from '@lucide/svelte'
  import {
    AGENT_SKILLS_INDEX_PATH,
    API_CATALOG_PATH,
    API_DOC_PATH,
    OPENAPI_PATH,
    WEB_MCP_TOOLS
  } from '$lib/agent'
  import type { MealTime, Menu, Restaurant } from '$lib/types'
  import { ALL_MEAL_TIME_ID, formatKoreanDate } from '$lib/utils'

  type RouteMeta = {
    title: string
    ogTitle: string
    description: string
    robots: string
    keywords: string
  }

  type JsonLdValue = Record<string, unknown>

  type BeforeInstallPromptEvent = Event & {
    platforms?: string[]
    prompt: () => Promise<{ outcome: 'accepted' | 'dismissed', platform?: string }>
  }

  type PageTip = {
    title: string
    items: string[]
  }

  type LayoutData = {
    mealTimes?: MealTime[]
    isFirstVisit: boolean
    notice?: NoticeSettings
  }

  type NoticeSettings = {
    enabled: boolean
    title: string
    summary: string
    detail: string
    updatedAt?: number
  }

  const INDEXABLE_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
  const NOINDEX_ROBOTS = 'noindex, follow'
  const SITE_NAME = 'Welplan'
  const SITE_DESCRIPTION = '웰스토리·신세계푸드 사내 식당 메뉴 조회 서비스'
  const GITHUB_URL = 'https://github.com/pmh-only/welplan2'
  const DEFAULT_KEYWORDS = [
    '웰스토리 식단 조회',
    '웰스토리 식단표',
    '웰스토리 식단',
    '웰스토리 메뉴',
    '삼성웰스토리 메뉴',
    '웰스토리 메뉴 조회',
    '삼성웰스토리 식단',
    '삼성웰스토리 식단 조회',
    '삼성웰스토리 식단표',
    '웰스토리 api',
    '웰스토리 식단 조회 api',
    '웰스토리 식단 조회 어플',
    '삼성전자 식단 조회',
    '삼성전자 식단표',
    '삼성전자 웰스토리 메뉴',
    '신세계푸드 식단 조회',
    '신세계푸드 메뉴 조회',
    '신세계푸드 식단표'
  ].join(', ')
  const PAGE_TIP_DISMISSED_STORAGE_KEY = 'welplan_page_tip_dismissed'

  function mergeKeywords (...groups: string[]): string {
    const keywords = groups.flatMap((group) => group.split(',').map((keyword) => keyword.trim()))
    return [...new Set(keywords.filter(Boolean))].join(', ')
  }

  function mealTimeName (mealTimes: MealTime[], id: string): string {
    if (id === ALL_MEAL_TIME_ID) return '전체'
    return mealTimes.find((mealTime) => mealTime.id === id)?.name ?? id
  }

  function isRestaurant (value: unknown): value is Restaurant {
    if (!value || typeof value !== 'object') return false
    const restaurant = value as Partial<Restaurant>
    return typeof restaurant.id === 'string' &&
      typeof restaurant.name === 'string' &&
      typeof restaurant.vendor === 'string'
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
    if (/^\d{8}$/.test(segment)) return formatKoreanDate(segment)
    if (restaurant && segment === restaurant.vendor) return vendorName(restaurant.vendor)
    if (restaurant && segment === restaurant.id) return restaurant.name
    if (restaurant && pathname.includes(`/${restaurant.id}/`) && !['restaurants', restaurant.vendor].includes(segment)) return restaurant.name
    return decodeURIComponent(segment).replace(/-/g, ' ')
  }

  function breadcrumbJsonLd (pathname: string, origin: string, restaurant?: Restaurant): JsonLdValue | undefined {
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length === 0) return undefined

    const itemListElement = [
      {
        '@type': 'ListItem',
        position: 1,
        name: SITE_NAME,
        item: `${origin}/`
      },
      ...segments.map((segment, index) => {
        const itemPath = `/${segments.slice(0, index + 1).join('/')}`
        return {
          '@type': 'ListItem',
          position: index + 2,
          name: breadcrumbName(segment, pathname, restaurant),
          item: new URL(itemPath, origin).toString()
        }
      })
    ]

    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement
    }
  }

  function menuJsonLd (menus: Menu[], mealTimes: MealTime[]): JsonLdValue | undefined {
    const visibleMenus = menus.slice(0, 60)
    if (visibleMenus.length === 0) return undefined

    return {
      '@type': 'Menu',
      hasMenuSection: mealTimes
        .map((mealTime) => {
          const sectionMenus = visibleMenus.filter((menu) => menu.mealTimeId === mealTime.id)
          if (sectionMenus.length === 0) return undefined

          return {
            '@type': 'MenuSection',
            name: mealTime.name,
            hasMenuItem: sectionMenus.map((menu) => ({
              '@type': 'MenuItem',
              name: menu.name,
              image: menu.imageUrl,
              nutrition: menu.nutrition?.calories == null
                ? undefined
                : {
                    '@type': 'NutritionInformation',
                    calories: `${Math.round(menu.nutrition.calories)} calories`
                  }
            }))
          }
        })
        .filter(Boolean)
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
    const organizationId = `${origin}/#organization`
    const websiteId = `${origin}/#website`
    const graph: JsonLdValue[] = [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: SITE_NAME,
        url: origin,
        logo: new URL('/favicon.svg', origin).toString(),
        sameAs: [GITHUB_URL]
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: SITE_NAME,
        url: origin,
        description: SITE_DESCRIPTION,
        inLanguage: 'ko-KR',
        publisher: { '@id': organizationId },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${origin}/proxy/search?q={search_term_string}`
          },
          'query-input': 'required name=search_term_string'
        }
      },
      {
        '@type': 'WebApplication',
        '@id': `${origin}/#webapp`,
        name: SITE_NAME,
        url: origin,
        description: SITE_DESCRIPTION,
        applicationCategory: 'FoodAndDrinkApplication',
        operatingSystem: 'Any',
        inLanguage: 'ko-KR',
        isAccessibleForFree: true,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'KRW'
        },
        publisher: { '@id': organizationId }
      },
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: routeMeta.title,
        description: routeMeta.description,
        inLanguage: 'ko-KR',
        isPartOf: { '@id': websiteId }
      }
    ]

    const breadcrumb = breadcrumbJsonLd(pathname, origin, restaurant)
    if (breadcrumb) graph.push(breadcrumb)

    if (restaurant && pageData && typeof pageData === 'object') {
      const typedData = pageData as { menus?: Menu[], mealTimes?: MealTime[], date?: string }
      const vendorLabel = vendorName(restaurant.vendor)
      const menu = menuJsonLd(typedData.menus ?? [], typedData.mealTimes ?? [])
      graph.push({
        '@type': 'Restaurant',
        '@id': `${canonicalUrl}#restaurant`,
        name: restaurant.name,
        url: canonicalUrl,
        description: `${vendorLabel} ${restaurant.name} 식단표`,
        servesCuisine: 'Korean',
        provider: {
          '@type': 'Organization',
          name: vendorLabel
        },
        hasMenu: menu,
        image: (typedData.menus ?? []).find((menuItem) => menuItem.imageUrl)?.imageUrl
      })
    }

    return [{ '@context': 'https://schema.org', '@graph': graph }]
  }

  function routeMetaFor (pathname: string, mealTimes: MealTime[], restaurant?: Restaurant): RouteMeta {
    const baseMeta: RouteMeta = {
      title: 'Welplan | 웰스토리 식단 조회와 신세계푸드 메뉴 조회',
      ogTitle: 'Welplan | 웰스토리·신세계푸드 메뉴 조회',
      description: '웰스토리·신세계푸드 식단 조회를 한 곳에서. 메뉴 사진과 영양정보를 빠르게.',
      robots: INDEXABLE_ROBOTS,
      keywords: DEFAULT_KEYWORDS
    }

    if (pathname === '/' || pathname.startsWith('/gallery')) {
      return {
        ...baseMeta,
        title: '웰스토리 식단 조회 | 웰스토리 식단표·메뉴 조회 | Welplan',
        ogTitle: '웰스토리 식단 조회와 메뉴 갤러리 | Welplan',
        description: '웰스토리 식단 조회와 삼성웰스토리 식단표를 한 곳에서 확인하세요. 날짜·식사 시간별 메뉴 사진, 칼로리, 상세 영양정보를 빠르게 볼 수 있습니다.'
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
      const restaurantKeywords = restaurant.vendor === 'welstory'
        ? ['웰스토리 식단 조회', '웰스토리 식단표', '삼성웰스토리 식단 조회', '웰스토리 메뉴 조회']
        : ['신세계푸드 식단 조회', '신세계푸드 메뉴 조회', '신세계푸드 식단표']

      return {
        ...baseMeta,
        title: `${restaurant.name} ${vendorLabel}${dateLabel} 식단표 조회 | Welplan`,
        ogTitle: `${restaurant.name} ${vendorLabel} 식단표 조회`,
        description: `${vendorLabel} ${restaurant.name} 식단표. 메뉴 사진과 영양정보를 한눈에.`,
        keywords: mergeKeywords(restaurant.name, vendorLabel, ...restaurantKeywords, '하루 전체 메뉴', '메뉴 갤러리', '식단 사진', DEFAULT_KEYWORDS)
      }
    }

    if (pathname.startsWith('/docs/api')) {
      return {
        ...baseMeta,
        title: '웰스토리 API | 웰스토리 식단 조회 API 문서 | Welplan',
        ogTitle: '웰스토리 식단 조회 API 문서 | Welplan',
        description: '웰스토리 API와 웰스토리 식단 조회 API 사용법을 확인하세요. 식당 검색, 날짜별 메뉴 조회, RSS, OpenAPI 문서를 Welplan에서 제공합니다.',
        keywords: mergeKeywords('웰스토리 api', '웰스토리 식단 조회 api', '웰스토리 메뉴 조회 api', '삼성웰스토리 api', DEFAULT_KEYWORDS)
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

  function routeTipFor (pathname: string): PageTip {
    if (pathname === '/' || pathname.startsWith('/gallery')) {
      return {
        title: '갤러리 팁',
        items: [
          '메뉴 이미지를 누르면 크게 확대해서 자세히 볼 수 있습니다.'
        ]
      }
    }

    if (pathname.startsWith('/takein/')) {
      return {
        title: '테이크인 팁',
        items: [
          '상단 정렬 기준에서 메뉴를 원하는 순서로 정렬할 수 있습니다.'
        ]
      }
    }

    if (pathname.startsWith('/takeout/')) {
      return {
        title: '테이크아웃 팁',
        items: [
          '테이크아웃 메뉴를 클릭하면 4코인 계산을 자동으로 지원합니다.'
        ]
      }
    }

    if (pathname.startsWith('/restaurants')) {
      return {
        title: '식당 선택 팁',
        items: [
          '식당 이름 일부만 입력해도 검색할 수 있어 원하는 식당을 빠르게 추가할 수 있습니다.',
          '추가한 식당 목록은 저장되어 다음 방문 때도 그대로 유지됩니다.'
        ]
      }
    }

    return {
      title: 'Welplan 팁',
      items: ['상단 탭으로 갤러리, 테이크인, 테이크아웃, 식당 선택 화면을 빠르게 이동할 수 있습니다.']
    }
  }

  let { data, children }: { data: LayoutData, children: Snippet } = $props()

  const navLinks = [
    { href: '/', label: '갤러리', icon: Camera },
    { href: '/takein', label: '테이크 인', icon: Utensils },
    { href: '/takeout', label: '테이크 아웃', icon: Package },
    { href: '/restaurants', label: '식당 선택', icon: Store }
  ]

  const isNavigating = $derived(navigating.to !== null)
  let showLoading = $state(false)
  let loadingTimer: ReturnType<typeof setTimeout> | undefined
  let pageTipDismissed = $state(false)
  let noticeOpen = $state(false)
  let updateAvailable = $state(false)
  let offlineReady = $state(false)
  let installAvailable = $state(false)
  let installPromptEvent = $state<BeforeInstallPromptEvent | undefined>()
  let waitingServiceWorker: ServiceWorker | undefined

  function dismissPageTip () {
    pageTipDismissed = true
    localStorage.setItem(PAGE_TIP_DISMISSED_STORAGE_KEY, '1')
  }

  function applyAppUpdate () {
    waitingServiceWorker?.postMessage({ type: 'SKIP_WAITING' })
  }

  function clearInstallPrompt () {
    installPromptEvent = undefined
    installAvailable = false
  }

  async function installApp () {
    if (!installPromptEvent) return
    const promptEvent = installPromptEvent
    clearInstallPrompt()
    await promptEvent.prompt().catch(() => undefined)
  }

  function isInstalledDisplayMode () {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
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
      waitingServiceWorker = registration.waiting
      updateAvailable = true
    }

    registration.addEventListener('updatefound', () => {
      const installingWorker = registration.installing
      if (!installingWorker) return

      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state !== 'installed') return

        if (navigator.serviceWorker.controller) {
          waitingServiceWorker = installingWorker
          updateAvailable = true
        } else {
          offlineReady = true
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
    pageTipDismissed = localStorage.getItem(PAGE_TIP_DISMISSED_STORAGE_KEY) === '1'

    requestPersistentStorage()

    registerServiceWorker().catch(() => {})

    function handleBeforeInstallPrompt (event: Event) {
      if (isInstalledDisplayMode()) return
      event.preventDefault()
      installPromptEvent = event as BeforeInstallPromptEvent
      installAvailable = true
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', clearInstallPrompt)

    const navigatorWithModelContext = navigator as Navigator & {
      modelContext?: {
        registerTool?: (
          tool: {
            name: string
            title?: string
            description: string
            inputSchema?: Record<string, unknown>
            execute: (input: Record<string, unknown>) => Promise<unknown>
            annotations?: { readOnlyHint?: boolean }
          },
          options?: { signal?: AbortSignal }
        ) => void
      }
    }

    const modelContext = navigatorWithModelContext.modelContext
    if (!modelContext?.registerTool) {
      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
        window.removeEventListener('appinstalled', clearInstallPrompt)
      }
    }

    const controller = new AbortController()

    function pageSummary () {
      const headings = [...document.querySelectorAll('h1, h2, h3')]
        .map((heading) => heading.textContent?.trim())
        .filter(Boolean)
      const bodyText = document.querySelector('.content')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

      return {
        url: window.location.href,
        path: window.location.pathname,
        title: document.title,
        headings,
        text: bodyText.slice(0, 4000)
      }
    }

    for (const tool of WEB_MCP_TOOLS) {
      modelContext.registerTool(
        {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: { readOnlyHint: tool.readOnlyHint },
          execute: async (input: Record<string, unknown>) => {
            switch (tool.name) {
              case 'welplan.search-restaurants': {
                const query = typeof input.query === 'string' ? input.query.trim() : ''
                if (!query) throw new Error('query is required')

                const response = await fetch(`/proxy/search?q=${encodeURIComponent(query)}`)
                if (!response.ok) throw new Error(`Search failed with status ${response.status}`)
                return { query, results: await response.json() }
              }
              case 'welplan.open-restaurant': {
                const vendor = typeof input.vendor === 'string' ? input.vendor : ''
                const id = typeof input.id === 'string' ? input.id : ''
                if (!vendor || !id) throw new Error('vendor and id are required')

                const searchResponse = await fetch(`/proxy/search?q=${encodeURIComponent(id)}`)
                if (!searchResponse.ok) throw new Error('Could not resolve restaurant')
                const results: { id: string; name: string; vendor: string }[] = await searchResponse.json()
                const restaurant = results.find((r) => r.id === id && r.vendor === vendor)
                if (!restaurant) throw new Error(`Restaurant ${id} not found`)

                const slug = restaurant.name
                  .normalize('NFKC').trim().toLowerCase()
                  .replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-+|-+$/g, '') || 'restaurant'
                const date = typeof input.date === 'string' ? input.date : ''
                const target = date
                  ? `/restaurants/${vendor}/${id}/${slug}/${date}`
                  : `/restaurants/${vendor}/${id}/${slug}`
                await goto(target)
                return { ok: true, url: new URL(target, window.location.origin).toString() }
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

    return () => {
      controller.abort()
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', clearInstallPrompt)
    }
  })

  const restaurantMeta = $derived(restaurantFromPageData(page.data))
  const isAdminPage = $derived(page.url.pathname.startsWith('/admin'))
  const routeMeta = $derived.by(() => {
    const base = routeMetaFor(page.url.pathname, data.mealTimes ?? [], restaurantMeta)
    const pageDescription = (page.data as { pageDescription?: string }).pageDescription
    return pageDescription ? { ...base, description: pageDescription } : base
  })
  const pageTip = $derived(routeTipFor(page.url.pathname))
  const pageCanonicalPath = $derived(canonicalPathFromPageData(page.data))
  const isRestaurantDetailPage = $derived((page.url.pathname.startsWith('/restaurant/') || page.url.pathname.startsWith('/restaurants/')) && restaurantMeta !== undefined)
  const showGlobalChrome = $derived(!isRestaurantDetailPage)
  const showFirstVisitGuide = $derived(showGlobalChrome && !isAdminPage && data.isFirstVisit && !page.url.pathname.startsWith('/restaurants'))
  const showPageTip = $derived(showGlobalChrome && !isAdminPage && !pageTipDismissed)
  const notice = $derived(data.notice)
  const showNotice = $derived(notice?.enabled === true && ((notice.summary?.length ?? 0) > 0 || (notice.detail?.length ?? 0) > 0))
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
  <meta name="keywords" content={routeMeta.keywords} />
  <meta name="robots" content={routeMeta.robots} />
  <meta name="googlebot" content={routeMeta.robots} />
  <meta name="bingbot" content={routeMeta.robots} />
  <meta name="theme-color" content="#0f172a" />
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
  <link rel="alternate" type="application/rss+xml" title="Welplan RSS" href={rssUrl} />
  <link rel="api-catalog" href={API_CATALOG_PATH} />
  <link rel="service-doc" href={API_DOC_PATH} />
  <link rel="service-desc" href={OPENAPI_PATH} />
  <link rel="describedby" href={AGENT_SKILLS_INDEX_PATH} />
  <link rel="describedby" type="text/plain" href="/llms.txt" title="LLM usage guide" />
  {#if isRestaurantDetailPage}
    <link rel="alternate" type="text/markdown" href={canonicalUrl} />
  {/if}
  {#each jsonLd as item}
    {@html jsonLdScript(item)}
  {/each}
</svelte:head>

<div class="app">
  <a
    class="github-ribbon"
    href="https://github.com/pmh-only/welplan2"
    target="_blank"
    rel="noreferrer"
    aria-label="Welplan GitHub 저장소 열기"
  >
    <svg class="github-icon-desktop" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.25 14.4 9h7.1l-5.75 4.17 2.2 6.58L12 15.64 6.05 19.75l2.2-6.58L2.5 9h7.1z" />
    </svg>
    <span class="github-label-desktop">Star on GitHub</span>
  </a>

  {#if showNotice && notice}
    <section class="notice-shell" aria-label="공지사항">
      <button type="button" class="notice-bar" aria-expanded={noticeOpen} onclick={() => { noticeOpen = !noticeOpen }}>
        <span class="notice-bar-badge">
          <Megaphone class="notice-icon" aria-hidden="true" />
          공지
        </span>
        <span class="notice-bar-text">
          {#if notice.title}
            <strong>{notice.title}</strong>
          {/if}
          {notice.summary || notice.detail}
        </span>
        <span class="notice-bar-action">자세히</span>
      </button>
      {#if noticeOpen}
        <div class="notice-detail">
          {#if notice.title}
            <h2>{notice.title}</h2>
          {/if}
          <p>{notice.detail || notice.summary}</p>
        </div>
      {/if}
    </section>
  {/if}

  {#if updateAvailable || installAvailable || offlineReady}
    <section class="pwa-status" aria-live="polite" aria-label="앱 상태">
      <div>
        <strong>{updateAvailable ? '새 버전이 준비되었습니다.' : installAvailable ? 'Welplan 앱을 설치할 수 있습니다.' : '오프라인에서도 사용할 준비가 되었습니다.'}</strong>
        <p>{updateAvailable ? '편한 시점에 새로고침해 최신 앱으로 전환하세요.' : installAvailable ? '홈 화면이나 작업 표시줄에서 바로 열고 더 빠르게 식단을 확인하세요.' : '최근에 연 화면과 앱 리소스가 캐시에 저장되었습니다.'}</p>
      </div>
      <div class="pwa-status-actions">
        {#if updateAvailable}
          <button type="button" onclick={applyAppUpdate}>업데이트</button>
        {:else if installAvailable}
          <button type="button" onclick={installApp}>설치</button>
          <button type="button" class="pwa-status-secondary" onclick={clearInstallPrompt}>나중에</button>
        {:else}
          <button type="button" onclick={() => { offlineReady = false }}>확인</button>
        {/if}
      </div>
    </section>
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
          {#each navLinks as link}
            {@const Icon = link.icon}
            <a href={link.href} class="tab-btn" class:active={page.url.pathname.startsWith(link.href) && (link.href !== '/' || page.url.pathname === '/')}>
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

  <main class="content" class:content-loading={showLoading} class:focused-content={isRestaurantDetailPage} aria-busy={showLoading}>
    {#if showFirstVisitGuide}
      <section class="setup-banner" aria-label="첫 방문 안내">
        <div class="setup-banner-icon" aria-hidden="true">
          <Store />
        </div>
        <div class="setup-banner-body">
          <p class="setup-banner-title">처음 방문하셨다면 먼저 식당 선택을 해주세요</p>
        </div>
        <a class="setup-banner-link" href="/restaurants">식당 선택으로 이동</a>
      </section>
    {/if}

    {#if showPageTip}
      <aside class="page-tip" aria-label={pageTip.title}>
        <div class="page-tip-icon" aria-hidden="true">
          <Lightbulb />
        </div>
        <div class="page-tip-body">
          <p class="page-tip-title">{pageTip.title}</p>
          <ul class="page-tip-list">
            {#each pageTip.items as item}
              <li>{item}</li>
            {/each}
          </ul>
        </div>
        <button type="button" class="page-tip-close" aria-label="팁 닫기" onclick={dismissPageTip}>
          <X class="page-tip-close-icon" aria-hidden="true" />
        </button>
      </aside>
    {/if}

    {@render children()}

    <footer class="legal-notice" aria-label="상표 및 문의 안내">
      <p>
        삼성웰스토리, 신세계푸드 및 각 사의 브랜드명, 식당명에 포함된 회사명·브랜드명 등 모든 상표는 해당 권리자에게 귀속됩니다.
        Welplan은 해당 상표권자 및 관련 회사와 제휴, 후원, 승인 또는 공식 관계가 없는 독립적인 사이트 및 애플리케이션입니다.
        문의 및 건의사항은 <a href="https://github.com/pmh-only/welplan2" target="_blank" rel="noreferrer">GitHub 저장소</a> 또는 <a href="mailto:pmh_only@pmh.codes">pmh_only@pmh.codes</a>로 연락해 주세요.
      </p>
    </footer>
  </main>
</div>

<style>
  .app { min-height: 100vh; }

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

  .notice-detail {
    max-width: 920px;
    margin: 0 auto;
    padding: 16px 20px 18px;
    color: #f8fafc;
    background: #111827;
    white-space: pre-wrap;
  }

  .notice-detail h2 {
    margin: 0 0 8px;
    font-size: 1rem;
    letter-spacing: -0.02em;
  }

  .notice-detail p {
    margin: 0;
    color: #dbeafe;
    line-height: 1.65;
  }

  .pwa-status {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 170;
    width: min(360px, calc(100vw - 32px));
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 14px;
    align-items: center;
    padding: 14px;
    border: 1px solid rgba(125, 211, 252, 0.34);
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.94);
    color: #f8fafc;
    box-shadow: 0 18px 45px rgba(15, 23, 42, 0.28);
    backdrop-filter: blur(16px);
  }

  .pwa-status strong {
    display: block;
    margin-bottom: 4px;
    font-size: 13px;
  }

  .pwa-status p {
    margin: 0;
    color: #cbd5e1;
    font-size: 12px;
    line-height: 1.45;
  }

  .pwa-status-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pwa-status button {
    border: 0;
    border-radius: 999px;
    padding: 9px 12px;
    background: #f8fafc;
    color: #0f172a;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .pwa-status button:hover {
    background: #e0f2fe;
  }

  .pwa-status .pwa-status-secondary {
    background: rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
  }

  .pwa-status .pwa-status-secondary:hover {
    background: rgba(255, 255, 255, 0.18);
  }

  .github-ribbon {
    position: fixed;
    top: 18px;
    right: -52px;
    z-index: 140;
    width: 196px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 0;
    background: linear-gradient(135deg, #0f172a 0%, #1f2937 100%);
    color: #f8fafc;
    text-decoration: none;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
    transform: rotate(42deg);
    border: 1px solid rgba(148, 163, 184, 0.35);
    box-shadow: 0 16px 30px rgba(15, 23, 42, 0.24);
    transition: background 0.14s ease, box-shadow 0.14s ease;
  }

  .github-ribbon:hover {
    background: linear-gradient(135deg, #111827 0%, #0f766e 100%);
    box-shadow: 0 18px 36px rgba(15, 23, 42, 0.28);
  }

  .github-ribbon svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
    flex-shrink: 0;
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
    .github-ribbon,
    .pwa-status,
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

  .setup-banner {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 14px;
    align-items: center;
    margin-bottom: 14px;
    padding: 16px 18px;
    border: 1px solid #86efac;
    border-radius: var(--radius);
    background: linear-gradient(180deg, #ecfdf5 0%, #f8fafc 100%);
    box-shadow: var(--shadow-sm);
  }

  .setup-banner-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 999px;
    background: rgba(16, 185, 129, 0.12);
    color: #059669;
  }

  .setup-banner-icon :global(svg) {
    width: 19px;
    height: 19px;
  }

  .setup-banner-body {
    min-width: 0;
  }

  .setup-banner-title {
    margin-bottom: 4px;
    color: #166534;
    font-size: 14px;
    font-weight: 700;
  }

  .setup-banner-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    background: #10b981;
    color: #fff;
    text-decoration: none;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .setup-banner-link:hover {
    background: #059669;
  }

  .page-tip {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 12px;
    align-items: flex-start;
    margin-bottom: 14px;
    padding: 14px 16px;
    border: 1px solid #bfdbfe;
    border-radius: var(--radius);
    background: linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%);
    box-shadow: var(--shadow-sm);
  }

  .page-tip-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.12);
    color: #2563eb;
  }

  .page-tip-icon :global(svg) {
    width: 17px;
    height: 17px;
  }

  .page-tip-body {
    min-width: 0;
  }

  .page-tip-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    margin-top: -4px;
    margin-right: -6px;
    border-radius: 999px;
    color: #1e3a8a;
    font-size: 17px;
    line-height: 1;
  }

  :global(.page-tip-close-icon) {
    width: 16px;
    height: 16px;
  }

  .page-tip-close:hover {
    background: rgba(59, 130, 246, 0.12);
  }

  .page-tip-title {
    margin-bottom: 4px;
    color: #1e3a8a;
    font-size: 13px;
    font-weight: 700;
  }

  .page-tip-list {
    margin: 0;
    padding-left: 18px;
    color: var(--text-muted);
    font-size: 13px;
  }

  .page-tip-list li + li {
    margin-top: 2px;
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
    .github-ribbon {
      transition: none;
    }

    .route-progress-bar-primary,
    .route-progress-bar-secondary {
      animation: none;
      transform: none;
    }

    .route-progress-bar-primary { width: 58%; }
    .route-progress-bar-secondary { display: none; }
    .content { transition: none; }
  }

  @media (max-width: 640px) {
    .setup-banner {
      grid-template-columns: 1fr;
      gap: 10px;
      padding: 14px;
    }

    .setup-banner-link {
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
    .pwa-status {
      left: 10px;
      right: 10px;
      bottom: calc(76px + env(safe-area-inset-bottom));
      width: auto;
      grid-template-columns: 1fr;
      gap: 12px;
      padding: 16px;
    }
    .pwa-status-actions {
      flex-direction: row;
      flex-wrap: wrap;
    }
    .pwa-status button {
      flex: 1 1 96px;
    }
    .page-tip { grid-template-columns: auto 1fr auto; gap: 10px; }
    .page-tip-icon { width: 30px; height: 30px; }
  }
</style>
