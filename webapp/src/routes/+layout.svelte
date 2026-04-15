<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { navigating, page } from '$app/state'
  import { app } from '$lib/state.svelte'
  import { buildJsonLd, buildSeo } from '$lib/seo'

  let { data, children } = $props()

  const navLinks = [
    { href: '/takein', label: '테이크 인', icon: '🍽️' },
    { href: '/takeout', label: '테이크 아웃', icon: '📦' },
    { href: '/gallery', label: '갤러리', icon: '📸' },
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
  })

  const seo = $derived.by(() => buildSeo(page.url, data.mealTimes))
  const jsonLd = $derived.by(() => JSON.stringify(buildJsonLd(page.url, seo)))
</script>

<svelte:head>
  <title>{seo.title}</title>
  <meta name="description" content={seo.description} />
  <meta name="keywords" content={seo.keywords} />
  <meta name="robots" content={seo.robots} />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <meta name="format-detection" content="telephone=no" />
  <meta name="application-name" content="Welplan" />
  <meta name="apple-mobile-web-app-title" content="Welplan" />
  <link rel="canonical" href={seo.canonical} />
  <link rel="alternate" hreflang="ko-KR" href={seo.canonical} />

  <meta property="og:locale" content="ko_KR" />
  <meta property="og:site_name" content="Welplan" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={seo.title} />
  <meta property="og:description" content={seo.description} />
  <meta property="og:url" content={seo.canonical} />
  <meta property="og:image" content={seo.image} />
  <meta property="og:image:type" content="image/svg+xml" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={seo.ogAlt} />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={seo.title} />
  <meta name="twitter:description" content={seo.description} />
  <meta name="twitter:image" content={seo.image} />
  <meta name="twitter:image:alt" content={seo.ogAlt} />

  <script type="application/ld+json">{@html jsonLd}</script>
</svelte:head>

<div class="app">
  <header>
    <div class="header-inner">
      <a href="/" class="brand">
        <span class="brand-icon">🍽️</span>
        <div class="brand-text">
          <span class="brand-name">Welplan</span>
          <span class="brand-sub">웰스토리 메뉴</span>
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

  <main class="content" class:content-loading={showLoading} aria-busy={showLoading}>
    <h1 class="sr-only">{seo.heading}</h1>
    {@render children()}
  </main>
</div>

<style>
  .app { min-height: 100vh; }

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

  .content-loading {
    opacity: 0.88;
    filter: saturate(0.96);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
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
  }

  @media (max-width: 640px) {
    .header-inner { height: auto; padding: 10px 16px; flex-direction: column; align-items: flex-start; gap: 8px; }
    .header-nav { width: 100%; overflow-x: auto; scrollbar-width: none; gap: 2px; }
    .header-nav::-webkit-scrollbar { display: none; }
    .tab-btn { padding: 5px 10px; }
    .tab-btn.active::after { bottom: -9px; }
    .brand-sub { display: none; }
    .content { padding: 14px 12px; }
  }
</style>
