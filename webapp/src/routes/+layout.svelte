<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { browser } from '$app/environment'
  import '../app.css'
  import type { Snippet } from 'svelte'
  import { onMount } from 'svelte'
  import { navigating, page } from '$app/state'
  import { trackEvent } from '$lib/analytics'
  import { Camera, Check, Lightbulb, Megaphone, Package, Search, Store, Utensils, X } from '@lucide/svelte'
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
    restaurants?: Restaurant[]
    mealTimes?: MealTime[]
    isFirstVisit: boolean
    notice?: NoticeSettings
    hasTakeOutMenu?: boolean
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

  function restaurantPathText (restaurant: Restaurant): string {
    return restaurant.path?.filter(Boolean).join(' / ') ?? ''
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
  const visibleNavLinks = $derived(navLinks.filter((link) => link.href !== '/takeout' || data.hasTakeOutMenu === true))

  const isNavigating = $derived(navigating.to !== null)
  let showLoading = $state(false)
  let loadingTimer: ReturnType<typeof setTimeout> | undefined
  let pageTipDismissed = $state(false)
  let noticeOpen = $state(false)
  let firstVisitDialogOpen = $state(false)
  let dialogRestaurants = $state<Restaurant[]>([])
  let restaurantQuery = $state('')
  let allDialogRestaurants = $state<Restaurant[]>([])
  let restaurantSearchResults = $state<Restaurant[]>([])
  let restaurantSearching = $state(false)
  let restaurantSearchError = $state('')
  let updateAvailable = $state(false)
  let offlineReady = $state(false)
  let installAvailable = $state(false)
  let installPromptEvent = $state<BeforeInstallPromptEvent | undefined>()
  let waitingServiceWorker: ServiceWorker | undefined

  const dialogRestaurantIds = $derived(new Set(dialogRestaurants.map((restaurant) => restaurantKey(restaurant))))
  const visibleRestaurantSearchResults = $derived(restaurantQuery.trim() ? restaurantSearchResults : allDialogRestaurants)

  function restaurantKey (restaurant: Restaurant): string {
    return `${restaurant.vendor}:${restaurant.id}:${restaurant.name}:${restaurantPathText(restaurant)}`
  }

  $effect(() => {
    if (!firstVisitDialogOpen) dialogRestaurants = data.restaurants ?? []
  })

  $effect(() => {
    if (!browser) return
    document.body.classList.toggle('first-visit-modal-open', showFirstVisitDialog)

    return () => {
      document.body.classList.remove('first-visit-modal-open')
    }
  })

  $effect(() => {
    if (!browser || !showFirstVisitDialog || restaurantQuery.trim() || restaurantSearching || allDialogRestaurants.length) return
    loadAllDialogRestaurants()
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

  function persistDialogRestaurants (next: Restaurant[]) {
    dialogRestaurants = next
    document.cookie = `welplan_restaurants=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=31536000; SameSite=Lax`
    invalidateAll()
  }

  function addDialogRestaurant (restaurant: Restaurant) {
    if (dialogRestaurantIds.has(restaurantKey(restaurant))) return
    trackEvent('Restaurant Added', { vendor: restaurant.vendor, restaurantId: restaurant.id, source: 'first_visit_dialog' })
    persistDialogRestaurants([...dialogRestaurants, restaurant])
  }

  function removeDialogRestaurant (restaurant: Restaurant) {
    trackEvent('Restaurant Removed', { vendor: restaurant.vendor, restaurantId: restaurant.id, source: 'first_visit_dialog' })
    persistDialogRestaurants(dialogRestaurants.filter((item) => restaurantKey(item) !== restaurantKey(restaurant)))
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
    } finally {
      restaurantSearching = false
    }
  }

  function closeFirstVisitDialog () {
    trackEvent('First Visit Dialog Closed', { restaurantCount: dialogRestaurants.length })
    persistDialogRestaurants(dialogRestaurants)
    firstVisitDialogOpen = false
  }

  function dismissPageTip () {
    trackEvent('Page Tip Dismissed', { path: page.url.pathname })
    pageTipDismissed = true
    localStorage.setItem(PAGE_TIP_DISMISSED_STORAGE_KEY, '1')
  }

  function applyAppUpdate () {
    trackEvent('PWA Update Applied')
    waitingServiceWorker?.postMessage({ type: 'SKIP_WAITING' })
  }

  function clearInstallPrompt (trackDismissal = true) {
    if (trackDismissal) trackEvent('PWA Install Dismissed')
    installPromptEvent = undefined
    installAvailable = false
  }

  async function installApp () {
    if (!installPromptEvent) return
    const promptEvent = installPromptEvent
    clearInstallPrompt(false)
    trackEvent('PWA Install Prompted')
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
    firstVisitDialogOpen = data.isFirstVisit
    dialogRestaurants = data.restaurants ?? []
    if (firstVisitDialogOpen) loadAllDialogRestaurants()

    requestPersistentStorage()

    registerServiceWorker().catch(() => {})

    function handleBeforeInstallPrompt (event: Event) {
      if (isInstalledDisplayMode()) return
      event.preventDefault()
      installPromptEvent = event as BeforeInstallPromptEvent
      installAvailable = true
    }

    function handleAppInstalled () {
      clearInstallPrompt(false)
      trackEvent('PWA Installed')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

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
        window.removeEventListener('appinstalled', handleAppInstalled)
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
      window.removeEventListener('appinstalled', handleAppInstalled)
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
  const showFirstVisitDialog = $derived(firstVisitDialogOpen && !isAdminPage && !page.url.pathname.startsWith('/restaurants'))
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
      <button type="button" class="notice-bar" aria-expanded={noticeOpen} onclick={() => { noticeOpen = !noticeOpen; trackEvent('Notice Toggled', { expanded: noticeOpen ? 1 : 0 }) }}>
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
          <button type="button" class="pwa-status-secondary" onclick={() => clearInstallPrompt()}>나중에</button>
        {:else}
          <button type="button" onclick={() => { offlineReady = false; trackEvent('PWA Offline Ready Confirmed') }}>확인</button>
        {/if}
      </div>
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
          <button type="button" class="first-visit-close" aria-label="첫 방문 설정 닫기" onclick={closeFirstVisitDialog}>
            <X class="first-visit-close-icon" aria-hidden="true" />
          </button>
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
                  <li class="first-visit-item" class:first-visit-item-added={added}>
                    <div class="first-visit-restaurant">
                      <p>{restaurant.name}</p>
                      {#if restaurantPathText(restaurant)}
                        <span>{restaurantPathText(restaurant)}</span>
                      {/if}
                    </div>
                    <span class="first-visit-vendor vendor-{restaurant.vendor}">{vendorName(restaurant.vendor)}</span>
                    {#if added}
                      <span class="first-visit-added">
                        <Check class="first-visit-added-icon" aria-hidden="true" />
                        추가됨
                      </span>
                    {:else}
                      <button type="button" class="first-visit-add" onclick={() => addDialogRestaurant(restaurant)}>+ 추가</button>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        </div>

        <div class="first-visit-actions">
          <button type="button" onclick={closeFirstVisitDialog}>이대로 시작하기</button>
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
            <a href={link.href} class="tab-btn" class:active={page.url.pathname.startsWith(link.href) && (link.href !== '/' || page.url.pathname === '/')} onclick={() => trackEvent('Navigation Tab Clicked', { href: link.href, label: link.label })}>
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
    background: #f8fafc;
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
    background: #fff;
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
    background: #dbeafe;
    color: #1d4ed8;
  }

  .vendor-shinsegae {
    background: #fce7f3;
    color: #be185d;
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
    background: #fff1f2;
    color: #dc2626;
  }

  .first-visit-remove:hover {
    background: #fee2e2;
  }

  .first-visit-add {
    border: 1px solid #6ee7b7;
    background: #ecfdf5;
    color: #059669;
  }

  .first-visit-add:hover {
    background: #d1fae5;
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
    background: #fff;
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
    background: #fff;
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
      grid-template-rows: auto minmax(0, 1fr);
      gap: 12px;
      padding: 12px;
      overflow: hidden;
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
