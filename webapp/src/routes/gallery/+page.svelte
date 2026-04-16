<script lang="ts">
  import { goto } from '$app/navigation'
  import { app } from '$lib/state.svelte'
  import { pScore, pScoreColor, proxyImg, toInputDate, fromInputDate } from '$lib/utils'
  import type { Menu } from '$lib/types'

  let { data } = $props()

  let showLabels = $state(true)
  let sortBy = $state<'pscore-asc' | 'pscore-desc' | 'name-asc' | 'name-desc' | 'restaurant-asc'>('pscore-asc')
  let zoomedMenu = $state<(Menu & { restaurantIds: string[] }) | null>(null)

  function openZoom (menu: Menu) { zoomedMenu = menu }
  function closeZoom () { zoomedMenu = null }

  function onKeydown (e: KeyboardEvent) {
    if (zoomedMenu && e.key === 'Escape') closeZoom()
  }
  const selectedDate = $derived((data as typeof data & { date: string }).date)
  const selectedTime = $derived((data as typeof data & { time: string }).time)

  function navigate (date: string, time: string) {
    const params = new URLSearchParams({ date, time })
    goto(`/gallery?${params}`)
  }

  function restaurantName (id: string): string {
    return data.restaurants.find((r: { id: string }) => r.id === id)?.name ?? id
  }

  function compareMenus (a: Menu, b: Menu): number {
    const aScore = pScore(a.nutrition, app.pWeights) ?? 999999
    const bScore = pScore(b.nutrition, app.pWeights) ?? 999999

    switch (sortBy) {
      case 'pscore-asc': return aScore - bScore
      case 'pscore-desc': return bScore - aScore
      case 'name-asc': return a.name.localeCompare(b.name, 'ko')
      case 'name-desc': return b.name.localeCompare(a.name, 'ko')
      case 'restaurant-asc': return restaurantName(a.restaurantId).localeCompare(restaurantName(b.restaurantId), 'ko')
    }
  }

  const galleryMenus = $derived.by(() => {
    const uniqueMenus = new Map<string, Menu>()
    const allRestaurantIds = new Map<string, Set<string>>()

    for (const menu of data.menus as Menu[]) {
      if (!menu.imageUrl) continue
      if (menu.name.includes('죽')) continue
      if (menu.isTakeOut && !menu.name.includes('도시락')) continue

      const key = menu.name.trim().toLowerCase()
      const existing = uniqueMenus.get(key)
      if (!existing || (menu.imageUrl?.length ?? 0) > (existing.imageUrl?.length ?? 0)) {
        uniqueMenus.set(key, menu)
      }
      if (!allRestaurantIds.has(key)) allRestaurantIds.set(key, new Set())
      allRestaurantIds.get(key)!.add(menu.restaurantId)
    }

    return [...uniqueMenus.values()].sort(compareMenus).map((menu) => {
      const key = menu.name.trim().toLowerCase()
      return { ...menu, restaurantIds: [...(allRestaurantIds.get(key) ?? [menu.restaurantId])] }
    })
  })

  function restaurantNames (ids: string[]): string {
    return ids.map(restaurantName).join(', ')
  }

  const showRanking = $derived(sortBy.startsWith('pscore'))

</script>

<svelte:window onkeydown={onKeydown} />

<div class="section">
  <div class="section-head">
    <div class="section-head-left">
      <h2>갤러리</h2>
      <span class="count-badge">{galleryMenus.length}개</span>
    </div>
    <div class="controls">
      <select class="sort-select" bind:value={sortBy}>
        <option value="pscore-asc">P-Score 낮은순</option>
        <option value="pscore-desc">P-Score 높은순</option>
        <option value="name-asc">메뉴명 A-Z</option>
        <option value="name-desc">메뉴명 Z-A</option>
        <option value="restaurant-asc">식당명 A-Z</option>
      </select>
      <button
        type="button"
        class="chip"
        class:chip-active={showLabels}
        onclick={() => { showLabels = !showLabels }}
      >
        메뉴명 표시
      </button>
    </div>
  </div>

  {#if data.restaurants.length === 0}
    <div class="hint-block">
      <p class="hint"><a href="/restaurants">식당 설정</a>에서 식당을 추가하면 갤러리가 표시됩니다</p>
    </div>
  {:else}
    <div class="gallery-filters">
      <input
        class="date-input"
        type="date"
        value={toInputDate(selectedDate)}
        oninput={(e) => navigate(fromInputDate(e.currentTarget.value), selectedTime)}
      />
      <select class="select-input" value={selectedTime} onchange={(e) => navigate(selectedDate, e.currentTarget.value)}>
        {#each data.mealTimes as mealTime (mealTime.id)}
          <option value={mealTime.id}>{mealTime.name}</option>
        {/each}
      </select>
    </div>

    {#if galleryMenus.length === 0}
      <div class="hint-block">
        <p class="hint">이미지가 있는 메뉴가 없습니다.</p>
      </div>
    {:else}
      <div class="gallery-grid">
        {#each galleryMenus as menu, i (menu.id)}
          {@const ps = pScore(menu.nutrition, app.pWeights)}
          <div class="gallery-card" role="button" tabindex="0" onclick={() => openZoom(menu)} onkeydown={(e) => e.key === 'Enter' && openZoom(menu)}>
            {#if showRanking && i < 3}
              <span class="medal">{(['🥇', '🥈', '🥉'])[i]}</span>
            {/if}
            <div class="gallery-img-wrap">
              <img class="gallery-img" src={proxyImg(menu.imageUrl)} alt={menu.name} loading="lazy" />
            </div>
            {#if showLabels}
              <div class="gallery-info">
                <span class="gallery-name">{menu.name}</span>
                <div class="gallery-meta">
                  {#if ps !== null}
                    <span class="ps-badge {pScoreColor(ps)}">{ps}</span>
                  {/if}
                  <span class="gallery-restaurant">{restaurantNames(menu.restaurantIds)}</span>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

{#if zoomedMenu}
  {@const ps = pScore(zoomedMenu.nutrition, app.pWeights)}
  <div
    class="lightbox"
    role="button"
    tabindex="0"
    aria-label="닫기"
    onclick={closeZoom}
    onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && closeZoom()}
  >
    <div
      class="lightbox-inner"
      role="presentation"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <img class="lightbox-img" src={proxyImg(zoomedMenu.imageUrl)} alt={zoomedMenu.name} />
      <div class="lightbox-info">
        <div class="lightbox-text">
          <span class="lightbox-name">{zoomedMenu.name}</span>
          <span class="lightbox-restaurant">{restaurantNames(zoomedMenu.restaurantIds)}</span>
        </div>
        {#if ps !== null}
          <span class="ps-badge {pScoreColor(ps)}">{ps}</span>
        {/if}
      </div>
      <button class="lightbox-close" onclick={closeZoom} aria-label="닫기">✕</button>
    </div>
  </div>
{/if}

<style>
  .section {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
    gap: 10px;
    background: #fff;
  }
  .section-head-left { display: flex; align-items: center; gap: 10px; }
  .section-head h2 {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    padding-left: 10px;
    border-left: 3px solid var(--green);
  }
  .count-badge { font-size: 12px; color: var(--text-dim); background: var(--surface); padding: 2px 8px; border-radius: 20px; border: 1px solid var(--border); }

  .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

  .chip {
    padding: 5px 12px;
    border-radius: 20px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
  }
  .chip:hover { border-color: var(--green); color: #059669; background: #f0fdf4; }
  .chip-active { border-color: var(--green); color: #059669; background: #f0fdf4; font-weight: 600; }

  .sort-select,
  .select-input,
  .date-input {
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text);
    background: var(--bg);
    outline: none;
    transition: border-color 0.12s;
  }
  .sort-select:focus, .select-input:focus, .date-input:focus { border-color: var(--border-focus); }

  .gallery-filters { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--surface); }

  .hint-block { padding: 32px 16px; text-align: center; }
  .hint { font-size: 13px; color: var(--text-dim); font-style: italic; }
  .hint a { color: var(--accent); text-decoration: none; }
  .hint a:hover { text-decoration: underline; }

  .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; padding: 16px; }

  .gallery-card {
    position: relative;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background: white;
    cursor: zoom-in;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .gallery-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
    border-color: #cbd5e1;
  }

  .lightbox {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.88);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .lightbox-inner {
    position: relative;
    max-width: 640px;
    width: 100%;
    border-radius: var(--radius);
    overflow: hidden;
    background: white;
    box-shadow: 0 24px 64px rgba(0,0,0,0.5);
  }
  .lightbox-img { width: 100%; max-height: 70vh; object-fit: contain; display: block; background: white; }
  .lightbox-info {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-top: 1px solid var(--border);
  }
  .lightbox-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .lightbox-name { font-size: 15px; font-weight: 600; color: var(--text); }
  .lightbox-restaurant { font-size: 12px; color: var(--text-dim); }
  .lightbox-close {
    position: absolute; top: 10px; right: 10px;
    width: 32px; height: 32px;
    border-radius: 50%;
    background: rgba(0,0,0,0.55);
    color: white;
    font-size: 14px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.12s;
  }
  .lightbox-close:hover { background: rgba(0,0,0,0.75); }

  .medal { position: absolute; top: 7px; left: 7px; font-size: 20px; line-height: 1; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.4)); z-index: 1; }

  .gallery-img-wrap { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; background: var(--surface); }
  .gallery-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; transition: transform 0.2s; }
  .gallery-card:hover .gallery-img { transform: scale(1.04); }

  .gallery-info { padding: 9px 10px; background: white; border-top: 1px solid var(--border); }
  .gallery-name { display: block; font-size: 12px; font-weight: 500; color: var(--text); margin-bottom: 5px; line-height: 1.4; }
  .gallery-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .gallery-restaurant { font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .ps-badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
  .ps-green { background: #dcfce7; color: #16a34a; }
  .ps-yellow { background: #fef9c3; color: #ca8a04; }
  .ps-red { background: #fee2e2; color: #dc2626; }

  @media (max-width: 640px) {
    .controls { width: 100%; }
    .gallery-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; padding: 12px; }
  }
</style>
