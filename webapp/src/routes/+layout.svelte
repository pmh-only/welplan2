<script lang="ts">
  import { goto } from '$app/navigation'
  import '../app.css'
  import type { Snippet } from 'svelte'
  import { onMount } from 'svelte'
  import { navigating, page } from '$app/state'
  import {
    AGENT_SKILLS_INDEX_PATH,
    API_CATALOG_PATH,
    API_DOC_PATH,
    OPENAPI_PATH,
    WEB_MCP_TOOLS
  } from '$lib/agent'
  import { app } from '$lib/state.svelte'
  import type { MealTime, Restaurant } from '$lib/types'
  import { ALL_MEAL_TIME_ID, formatKoreanDate } from '$lib/utils'

  type RouteMeta = {
    title: string
    ogTitle: string
    description: string
    robots: string
    keywords: string
  }

  type PageTip = {
    title: string
    items: string[]
  }

  type LayoutData = {
    mealTimes?: MealTime[]
    isFirstVisit: boolean
  }

  const INDEXABLE_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
  const NOINDEX_ROBOTS = 'noindex, follow'
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
        description: '웰스토리 식단 조회와 삼성웰스토리 식단표를 한 곳에서 확인하세요. 날짜·식사 시간별 메뉴 사진, P-Score 영양 점수, 상세 영양정보를 빠르게 볼 수 있습니다.'
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

    if (pathname.startsWith('/restaurants')) {
      return {
        ...baseMeta,
        title: '식당 선택 | Welplan',
        description: 'Welplan에서 조회할 삼성웰스토리·신세계푸드 식당을 추가하고 관리합니다.',
        robots: NOINDEX_ROBOTS
      }
    }

    if (pathname.startsWith('/settings')) {
      return {
        ...baseMeta,
        title: '설정 | Welplan',
        description: 'Welplan의 메뉴 점수와 캐시 상태를 관리합니다.',
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
          '테이블 헤더를 클릭하여 영양소 별로 정렬할 수 있습니다'
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

    if (pathname.startsWith('/settings')) {
      return {
        title: '설정 팁',
        items: [
          'P-Score는 영양소의 따른 선호 점수로 가중치를 바꾸며 내 기준에 맞게 조정할 수 있습니다.'
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
    { href: '/takein', label: '테이크 인', icon: '🍽️' },
    { href: '/takeout', label: '테이크 아웃', icon: '📦' },
    { href: '/', label: '갤러리', icon: '📸' },
    { href: '/restaurants', label: '식당 선택', icon: '🏪' },
    { href: '/settings', label: '설정', icon: '⚙️' }
  ]

  const isNavigating = $derived(navigating.to !== null)
  let showLoading = $state(false)
  let loadingTimer: ReturnType<typeof setTimeout> | undefined
  let pageTipDismissed = $state(false)

  function dismissPageTip () {
    pageTipDismissed = true
    localStorage.setItem(PAGE_TIP_DISMISSED_STORAGE_KEY, '1')
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
    app.loadFromStorage()
    pageTipDismissed = localStorage.getItem(PAGE_TIP_DISMISSED_STORAGE_KEY) === '1'
    if (page.url.pathname === '/' && page.url.search === '' && app.startPage !== '/') {
      goto(app.startPage, { replaceState: true })
    }

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
    if (!modelContext?.registerTool) return

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
    }
  })

  const restaurantMeta = $derived(restaurantFromPageData(page.data))
  const routeMeta = $derived.by(() => {
    const base = routeMetaFor(page.url.pathname, data.mealTimes ?? [], restaurantMeta)
    const pageDescription = (page.data as { pageDescription?: string }).pageDescription
    return pageDescription ? { ...base, description: pageDescription } : base
  })
  const pageTip = $derived(routeTipFor(page.url.pathname))
  const pageCanonicalPath = $derived(canonicalPathFromPageData(page.data))
  const isRestaurantDetailPage = $derived((page.url.pathname.startsWith('/restaurant/') || page.url.pathname.startsWith('/restaurants/')) && restaurantMeta !== undefined)
  const showGlobalChrome = $derived(!isRestaurantDetailPage)
  const showFirstVisitGuide = $derived(showGlobalChrome && data.isFirstVisit && !page.url.pathname.startsWith('/restaurants'))
  const showPageTip = $derived(showGlobalChrome && !pageTipDismissed)
  const canonicalUrl = $derived(new URL(pageCanonicalPath ?? page.url.pathname, page.url.origin).toString())
  const rssUrl = $derived(new URL('/rss.xml', page.url.origin).toString())
</script>

<svelte:head>
  <title>{routeMeta.title}</title>
  <meta name="application-name" content="Welplan" />
  <meta name="description" content={routeMeta.description} />
  <meta name="keywords" content={routeMeta.keywords} />
  <meta name="robots" content={routeMeta.robots} />
  <meta name="theme-color" content="#0f172a" />
  <meta property="og:locale" content="ko_KR" />
  <meta property="og:site_name" content="Welplan" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={routeMeta.ogTitle} />
  <meta property="og:description" content={routeMeta.description} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content={new URL('/og-image.png', page.url.origin).toString()} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={routeMeta.ogTitle} />
  <meta name="twitter:description" content={routeMeta.description} />
  <meta name="twitter:image" content={new URL('/og-image.png', page.url.origin).toString()} />
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
  {#if page.url.pathname === '/' || page.url.pathname.startsWith('/gallery')}
    {@html `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Welplan',
      url: page.url.origin,
      description: '웰스토리·신세계푸드 사내 식당 메뉴 조회 서비스',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${page.url.origin}/proxy/search?q={search_term_string}`
        },
        'query-input': 'required name=search_term_string'
      }
    })}</script>`}
  {/if}
</svelte:head>

<div class="app">
  {#if showGlobalChrome}
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

    <header>
      <div class="header-inner">
        <a href="/" class="brand">
          <span class="brand-icon">🍽️</span>
          <div class="brand-text">
            <span class="brand-name">Welplan</span>
            <span class="brand-sub">웰스토리 · 신세계푸드</span>
          </div>
        </a>
        <nav class="header-nav">
          {#each navLinks as link}
            <a href={link.href} class="tab-btn" class:active={page.url.pathname.startsWith(link.href) && (link.href !== '/' || page.url.pathname === '/')}>
              <span class="tab-icon">{link.icon}</span>
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
        <div class="setup-banner-icon" aria-hidden="true">🏪</div>
        <div class="setup-banner-body">
          <p class="setup-banner-title">처음 방문하셨다면 먼저 식당 선택을 해주세요</p>
        </div>
        <a class="setup-banner-link" href="/restaurants">식당 선택으로 이동</a>
      </section>
    {/if}

    {#if showPageTip}
      <aside class="page-tip" aria-label={pageTip.title}>
        <div class="page-tip-icon" aria-hidden="true">💡</div>
        <div class="page-tip-body">
          <p class="page-tip-title">{pageTip.title}</p>
          <ul class="page-tip-list">
            {#each pageTip.items as item}
              <li>{item}</li>
            {/each}
          </ul>
        </div>
        <button type="button" class="page-tip-close" aria-label="팁 닫기" onclick={dismissPageTip}>×</button>
      </aside>
    {/if}

    {@render children()}
  </main>
</div>

<style>
  .app { min-height: 100vh; }

  .notice-bar {
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
  }

  .notice-bar-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.25);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
    flex-shrink: 0;
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
  .brand-icon { font-size: 1.4rem; line-height: 1; }
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

  .tab-icon { font-size: 14px; line-height: 1; }
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
    font-size: 18px;
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

  .setup-banner-text {
    color: var(--text-muted);
    font-size: 13px;
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
    font-size: 16px;
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
    .github-ribbon {
      display: none;
    }

    .setup-banner {
      grid-template-columns: 1fr;
      gap: 10px;
      padding: 14px;
    }

    .setup-banner-link {
      width: 100%;
    }

    .header-inner { height: auto; padding: 10px 16px; flex-direction: column; align-items: flex-start; gap: 8px; }
    .header-nav { width: 100%; overflow-x: auto; scrollbar-width: none; gap: 2px; }
    .header-nav::-webkit-scrollbar { display: none; }
    .tab-btn { padding: 5px 10px; }
    .tab-btn.active::after { bottom: -9px; }
    .brand-sub { display: none; }
    .content { padding: 14px 12px; }
    .page-tip { grid-template-columns: auto 1fr auto; gap: 10px; }
    .page-tip-icon { width: 30px; height: 30px; }
  }
</style>
