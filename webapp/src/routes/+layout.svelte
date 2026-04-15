<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { app } from '$lib/state.svelte'

  let { data, children } = $props()

  const navLinks = [
    { href: '/takein', label: '테이크 인', icon: '🍽️' },
    { href: '/takeout', label: '테이크 아웃', icon: '📦' },
    { href: '/gallery', label: '갤러리', icon: '📸' },
    { href: '/restaurants', label: '식당 설정', icon: '🏪' },
    { href: '/settings', label: '설정', icon: '⚙️' }
  ]

  onMount(() => {
    app.loadFromStorage()
  })
</script>

<svelte:head>
  <title>Welplan</title>
</svelte:head>

<div class="app">
  <header>
    <div class="header-inner">
      <a href="/gallery" class="brand">
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
  </header>

  <div class="content">
    {@render children()}
  </div>
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

  .content { max-width: 1200px; margin: 0 auto; padding: 20px 16px; }

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
