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
    WEB_MCP_TOOLS,
    routeForAgentPage
  } from '$lib/agent'
  import { app } from '$lib/state.svelte'
  import type { MealTime } from '$lib/types'
  import { formatKoreanDate } from '$lib/utils'

  type RouteMeta = {
    title: string
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
    '웰스토리 식단',
    '삼성웰스토리 메뉴',
    '웰스토리 메뉴 조회',
    '삼성웰스토리 식단',
    '삼성전자 식단 조회',
    '삼성전자 식단표',
    '삼성전자 웰스토리 메뉴',
    '신세계푸드 식단 조회',
    '신세계푸드 메뉴 조회',
    '신세계푸드 식단표'
  ].join(', ')

  function mealTimeName (mealTimes: MealTime[], id: string): string {
    return mealTimes.find((mealTime) => mealTime.id === id)?.name ?? id
  }

  function routeMetaFor (pathname: string, mealTimes: MealTime[]): RouteMeta {
    const baseMeta: RouteMeta = {
      title: 'Welplan | 웰스토리 식단 조회와 신세계푸드 메뉴 조회',
      description: '웰스토리 API | 웰스토리 식단 조회, 삼성웰스토리 메뉴 조회, 신세계푸드 식단 조회를 한 곳에서 빠르게 확인할 수 있는 사내 식당 메뉴 서비스입니다.',
      robots: INDEXABLE_ROBOTS,
      keywords: DEFAULT_KEYWORDS
    }

    if (pathname === '/' || pathname.startsWith('/gallery')) {
      return {
        ...baseMeta,
        title: '웰스토리 메뉴 갤러리 | 웰스토리·신세계푸드 식단 조회 | Welplan',
        description: '웰스토리 API | 웰스토리 식단 조회, 삼성웰스토리 메뉴 조회, 신세계푸드 식단 조회를 한 곳에서 빠르게 확인할 수 있는 사내 식당 메뉴 서비스입니다. 날짜와 식사 시간별 메뉴 사진과 영양정보를 빠르게 확인할 수 있습니다.'
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
        description: `${dateLabel} ${mealLabel} ${kindLabel} 메뉴를 Welplan에서 확인하세요. 삼성웰스토리와 신세계푸드 식단, 메뉴 구성, 영양정보를 한 번에 볼 수 있습니다.`
      }
    }

    if (pathname.startsWith('/restaurants')) {
      return {
        ...baseMeta,
        title: '식당 설정 | Welplan',
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
          '메뉴 이미지를 누르면 크게 확대해서 자세히 볼 수 있습니다.',
          '날짜와 식사 시간을 바꾸면 다른 날 식단 사진도 바로 확인할 수 있습니다.'
        ]
      }
    }

    if (pathname.startsWith('/takein/')) {
      return {
        title: '테이크인 팁',
        items: [
          '식당 설정 탭에서 웰스토리/신세계푸드 식당을 추가할 수 있습니다.',
          '테이블 헤더를 클릭하여 영양소 별로 정렬할 수 있습니다'
        ]
      }
    }

    if (pathname.startsWith('/takeout/')) {
      return {
        title: '테이크아웃 팁',
        items: [
          '식당 설정 탭에서 활성화한 식당을 여기서 볼 수 있습니다.',
          'NEW! 드실 테이크아웃 메뉴를 클릭하면 4코인 계산을 자동으로 지원합니다. (팔코 지원 예정)'
        ]
      }
    }

    if (pathname.startsWith('/restaurants')) {
      return {
        title: '식당 설정 팁',
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
          'P-Score는 낮을수록 좋은 점수라서 가중치를 바꾸며 내 기준에 맞게 조정할 수 있습니다.',
          '메뉴가 오래된 것 같으면 캐시 상태를 확인하고 캐시 삭제로 새로고침할 수 있습니다.'
        ]
      }
    }

    return {
      title: 'Welplan 팁',
      items: ['상단 탭으로 갤러리, 테이크인, 테이크아웃, 식당 설정 화면을 빠르게 이동할 수 있습니다.']
    }
  }

  let { data, children }: { data: LayoutData, children: Snippet } = $props()

  const navLinks = [
    { href: '/takein', label: '테이크 인', icon: '🍽️' },
    { href: '/takeout', label: '테이크 아웃', icon: '📦' },
    { href: '/', label: '갤러리', icon: '📸' },
    { href: '/restaurants', label: '식당 설정', icon: '🏪' },
    { href: '/settings', label: '설정', icon: '⚙️' }
  ]

  const isNavigating = $derived(navigating.to !== null)
  let showLoading = $state(false)
  let loadingTimer: ReturnType<typeof setTimeout> | undefined

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
              case 'welplan.open-page': {
                const pageName = typeof input.page === 'string' ? input.page : ''
                const date = typeof input.date === 'string' ? input.date : undefined
                const time = typeof input.time === 'string' ? input.time : undefined
                const target = routeForAgentPage(pageName, date, time)
                if (!target) throw new Error('Invalid page name')
                await goto(target)
                return { ok: true, url: new URL(target, window.location.origin).toString() }
              }
              case 'welplan.search-restaurants': {
                const query = typeof input.query === 'string' ? input.query.trim() : ''
                if (!query) throw new Error('query is required')

                const response = await fetch(`/proxy/search?q=${encodeURIComponent(query)}`)
                if (!response.ok) throw new Error(`Search failed with status ${response.status}`)
                return {
                  query,
                  results: await response.json()
                }
              }
              case 'welplan.get-current-page':
                return pageSummary()
              case 'welplan.get-cache-status': {
                const response = await fetch('/api/cache/status')
                if (!response.ok) throw new Error(`Cache status failed with status ${response.status}`)
                return {
                  ...pageSummary(),
                  cache: await response.json()
                }
              }
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

  const routeMeta = $derived.by(() => routeMetaFor(page.url.pathname, data.mealTimes ?? []))
  const pageTip = $derived(routeTipFor(page.url.pathname))
  const showFirstVisitGuide = $derived(data.isFirstVisit && !page.url.pathname.startsWith('/restaurants'))
  const canonicalUrl = $derived(`${page.url.origin}${page.url.pathname}`)
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
  <meta property="og:title" content={routeMeta.title} />
  <meta property="og:description" content={routeMeta.description} />
  <meta property="og:url" content={canonicalUrl} />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={routeMeta.title} />
  <meta name="twitter:description" content={routeMeta.description} />
  <link rel="canonical" href={canonicalUrl} />
  <link rel="alternate" hreflang="ko-KR" href={canonicalUrl} />
  <link rel="alternate" type="text/markdown" href={canonicalUrl} />
  <link rel="api-catalog" href={API_CATALOG_PATH} />
  <link rel="service-doc" href={API_DOC_PATH} />
  <link rel="service-desc" href={OPENAPI_PATH} />
  <link rel="describedby" href={AGENT_SKILLS_INDEX_PATH} />
</svelte:head>

<div class="app">
  <a
    class="github-ribbon"
    href="https://github.com/pmh-only/welplan2"
    target="_blank"
    rel="noreferrer"
    aria-label="Open the Welplan GitHub repository and star the project"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.25 14.4 9h7.1l-5.75 4.17 2.2 6.58L12 15.64 6.05 19.75l2.2-6.58L2.5 9h7.1z" />
    </svg>
    <span>Star on GitHub</span>
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

  <div class="notice-bar" role="banner" aria-label="서비스 업데이트 공지">
    <span class="notice-bar-badge">NEW</span>
    이제 신세계푸드 식당(패밀리홀 등) 도 지원합니다!
  </div>

  <div class="content" class:content-loading={showLoading} aria-busy={showLoading}>
    {#if showFirstVisitGuide}
      <section class="setup-banner" aria-label="첫 방문 안내">
        <div class="setup-banner-icon" aria-hidden="true">🏪</div>
        <div class="setup-banner-body">
          <p class="setup-banner-title">처음 방문하셨다면 먼저 식당 설정을 해주세요</p>
          <p class="setup-banner-text">
            갤러리와 메뉴 화면은 식당 설정에 추가한 식당 기준으로 표시됩니다. 먼저 자주 사용하는
            웰스토리 또는 신세계푸드 식당을 추가해 두면 더 정확하게 볼 수 있습니다.
          </p>
        </div>
        <a class="setup-banner-link" href="/restaurants">식당 설정으로 이동</a>
      </section>
    {/if}

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
    </aside>

    {@render children()}
  </div>
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
  .brand-sub { font-size: 0.7rem; color: #64748b; line-height: 1; }

  .header-nav { display: flex; gap: 2px; flex: 1; }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 7px;
    color: #64748b;
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
    display: grid;
    grid-template-columns: auto 1fr;
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
      top: auto;
      right: 12px;
      bottom: 12px;
      width: auto;
      padding: 10px 14px;
      border-radius: 999px;
      transform: none;
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
    .page-tip { grid-template-columns: 1fr; gap: 10px; }
    .page-tip-icon { width: 30px; height: 30px; }
  }
</style>
