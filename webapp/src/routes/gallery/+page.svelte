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

{#if zoomedMenu}
  {@const ps = pScore(zoomedMenu.nutrition, app.pWeights)}
  <div class="lightbox" role="dialog" aria-modal="true" onclick={closeZoom}>
    <div class="lightbox-inner" onclick={(e) => e.stopPropagation()}>
      <img class="lightbox-img" src={proxyImg(zoomedMenu.imageUrl)} alt={zoomedMenu.name} />
      <div class="lightbox-info">
        <span class="lightbox-name">{zoomedMenu.name}</span>
        <div class="lightbox-meta">
          {#if ps !== null}
            <span class="ps-badge {pScoreColor(ps)}">{ps}</span>
          {/if}
          <span class="lightbox-restaurant">{restaurantNames(zoomedMenu.restaurantIds)}</span>
        </div>
      </div>
      <button class="lightbox-close" onclick={closeZoom} aria-label="닫기">✕</button>
    </div>
  </div>
{/if}

<div class="section">
  <div class="section-head">
    <h2>📸 메뉴 갤러리</h2>
    <div class="controls">
      <span class="count">{galleryMenus.length}개 이미지</span>
      <select class="sort-select" bind:value={sortBy}>
        <option value="pscore-asc">P-Score 낮은순</option>
        <option value="pscore-desc">P-Score 높은순</option>
        <option value="name-asc">메뉴명 A-Z</option>
        <option value="name-desc">메뉴명 Z-A</option>
        <option value="restaurant-asc">식당명 A-Z</option>
      </select>
      <label class="check-label">
        <input type="checkbox" bind:checked={showLabels} />
        메뉴명 표시
      </label>
    </div>
  </div>

  {#if data.restaurants.length === 0}
    <p class="hint"><a href="/restaurants">식당 설정</a>에서 식당을 추가하면 갤러리가 표시됩니다</p>
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
      <p class="hint">이미지가 있는 메뉴가 없습니다.</p>
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

<style>
  .section {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    margin-bottom: 16px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 10px; }
  .section-head h2 { font-size: 1rem; font-weight: 600; color: #374151; display: flex; align-items: center; gap: 6px; }
  .section-head h2::before { content: ''; width: 4px; height: 18px; background: #10b981; border-radius: 2px; flex-shrink: 0; }

  .controls { display: flex; align-items: center; gap: 16px; }
  .count { font-size: 13px; color: var(--text-muted); }
  .check-label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted); cursor: pointer; }
  .sort-select,
  .select-input,
  .date-input {
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 13px;
    font-family: var(--font-sans);
    color: var(--text);
    background: var(--bg);
    outline: none;
  }

  .gallery-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }

  .hint { font-size: 13px; color: var(--text-dim); font-style: italic; margin-top: 8px; }
  .hint a { color: var(--accent); }

  .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }

  .gallery-card { position: relative; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: white; transition: box-shadow 0.15s; cursor: zoom-in; }
  .gallery-card:hover { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); }

  .lightbox { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .lightbox-inner { position: relative; max-width: 640px; width: 100%; border-radius: var(--radius); overflow: hidden; background: white; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  .lightbox-img { width: 100%; max-height: 70vh; object-fit: contain; display: block; background: white }
  .lightbox-info { padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .lightbox-name { font-size: 15px; font-weight: 600; color: var(--text); }
  .lightbox-meta { display: flex; align-items: center; gap: 8px; }
  .lightbox-restaurant { font-size: 12px; color: var(--text-dim); }
  .lightbox-close { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border-radius: 50%; border: none; background: rgba(0,0,0,0.5); color: white; font-size: 16px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; }

  .medal { position: absolute; top: 6px; left: 6px; font-size: 20px; line-height: 1; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4)); z-index: 1; }

  .gallery-img-wrap { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; background: white; }
  .gallery-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }

  .gallery-info { padding: 8px 10px; background: white; border-top: 1px solid var(--border); }
  .gallery-name { display: block; font-size: 12px; font-weight: 500; color: var(--text); margin-bottom: 6px; line-height: 1.4; }
  .gallery-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .gallery-restaurant { font-size: 11px; color: var(--text-dim); }

  .ps-badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; font-family: var(--font-mono); }
  .ps-green { background: #dcfce7; color: #16a34a; }
  .ps-yellow { background: #fef9c3; color: #ca8a04; }
  .ps-red { background: #fee2e2; color: #dc2626; }

  @media (max-width: 640px) {
    .controls { width: 100%; flex-wrap: wrap; }
    .gallery-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  }
</style>
