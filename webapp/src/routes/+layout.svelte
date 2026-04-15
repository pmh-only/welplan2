<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { app } from '$lib/state.svelte'

  let { children } = $props()

  const navLinks = [
    { href: '/menu', label: '🍴 메뉴' },
    { href: '/gallery', label: '📸 갤러리' },
    { href: '/restaurants', label: '🏪 식당 설정' },
    { href: '/settings', label: '⚙️ 설정' }
  ]

  onMount(() => {
    app.loadFromStorage()
  })

  // Fetch meal times when restaurants change
  $effect(() => {
    const _r = app.restaurants
    app.fetchMealTimes()
  })

</script>

<svelte:head>
  <title>Welplan</title>
</svelte:head>

<div class="app">
  <header>
    <div class="header-left">
      <h1>🍽️ Welplan</h1>
      <p>웰스토리 메뉴보기</p>
    </div>
    <nav class="header-nav">
      {#each navLinks as link}
        <a href={link.href} class="tab-btn" class:active={page.url.pathname.startsWith(link.href) && (link.href !== '/' || page.url.pathname === '/')}>
          {link.label}
        </a>
      {/each}
    </nav>
  </header>

  <div class="content">
    {@render children()}
  </div>
</div>

<style>
  .app { min-height: 100vh; background: var(--bg); }

  header {
    background: #1f2937;
    border-bottom: 1px solid #374151;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  }

  .header-left { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .header-left h1 { font-size: 1.25rem; font-weight: 600; color: #f9fafb; }
  .header-left p { font-size: 0.8rem; color: #9ca3af; }

  .header-nav { display: flex; gap: 4px; flex-wrap: wrap; }

  .tab-btn {
    padding: 7px 14px;
    border-radius: 6px;
    color: #9ca3af;
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    transition: background 0.15s, color 0.15s;
    white-space: nowrap;
  }

  .tab-btn:hover { color: #e5e7eb; background: rgba(255, 255, 255, 0.08); }
  .tab-btn.active { color: #f9fafb; background: rgba(255, 255, 255, 0.15); }

  .content { max-width: 1200px; margin: 0 auto; padding: 16px; }

  @media (max-width: 640px) {
    header { flex-direction: column; align-items: flex-start; gap: 10px; }
    .header-nav { width: 100%; overflow-x: auto; scrollbar-width: none; flex-wrap: nowrap; }
  }
</style>
