<script lang="ts">
  import { goto } from '$app/navigation'
  import { app } from '$lib/state.svelte'
  import { pScore, pScoreColor, proxyImg, toInputDate, fromInputDate } from '$lib/utils'
  import type { Menu, MenuComponent, NutritionInfo } from '$lib/types'
  import type { PageData } from './$types'

  type NutritionKey = keyof NutritionInfo
  type NutrientDef = { key: NutritionKey; label: string; unit: string }

  const nutrientDefs: NutrientDef[] = [
    { key: 'calories', label: '칼로리', unit: ' kcal' },
    { key: 'carbohydrates', label: '탄수화물', unit: 'g' },
    { key: 'sugar', label: '당', unit: 'g' },
    { key: 'fiber', label: '식이섬유', unit: 'g' },
    { key: 'fat', label: '지방', unit: 'g' },
    { key: 'protein', label: '단백질', unit: 'g' },
    { key: 'sodium', label: '나트륨', unit: 'mg' },
    { key: 'cholesterol', label: '콜레스테롤', unit: 'mg' },
    { key: 'saturatedFat', label: '포화지방', unit: 'g' },
    { key: 'transFat', label: '트랜스지방', unit: 'g' },
    { key: 'calcium', label: '칼슘', unit: 'mg' },
  ]

  function formatMetric (value: number | undefined, unit = ''): string {
    if (value == null) return '—'
    const rounded = Math.round(value * 10) / 10
    const display = Number.isInteger(rounded)
      ? rounded.toLocaleString()
      : rounded.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    return `${display}${unit}`
  }

  function activeNutrients (n: NutritionInfo | undefined): NutrientDef[] {
    if (!n) return []
    return nutrientDefs.filter(({ key }) => n[key] != null)
  }

  let { data }: { data: PageData } = $props()

  let showLabels = $state(true)
  let sortBy = $state<'pscore-asc' | 'pscore-desc' | 'name-asc' | 'name-desc' | 'restaurant-asc'>('pscore-asc')
  let zoomedMenu = $state<(Menu & { restaurantIds: string[] }) | null>(null)
  let detail = $state<MenuComponent[]>([])
  let loadingDetail = $state(false)

  function normalizeMenuName (name: string): string {
    return name.replace(/\s*포장$/, '').trim()
  }

  function detailRowsFor (menu: Menu): MenuComponent[] {
    if (detail.length <= 1) return detail
    const normalizedMenuName = normalizeMenuName(menu.name)
    const rows = detail.filter((dish) => !(normalizeMenuName(dish.name) === normalizedMenuName && dish.nutrition?.calories === 0))
    return rows.length > 0 ? rows : detail
  }

  function sortedByPScore (components: MenuComponent[]): MenuComponent[] {
    return [...components].sort((a, b) => {
      const aScore = pScore(a.nutrition, app.pWeights)
      const bScore = pScore(b.nutrition, app.pWeights)
      if (aScore === null && bScore === null) return 0
      if (aScore === null) return 1
      if (bScore === null) return -1
      return bScore - aScore
    })
  }

  function activeDetailNutrients (rows: MenuComponent[]): NutrientDef[] {
    return nutrientDefs.filter(({ key }) => rows.some((row) => row.nutrition?.[key] != null))
  }

  async function openZoom (menu: Menu & { restaurantIds: string[] }) {
    zoomedMenu = menu
    detail = []
    loadingDetail = false

    if (menu.vendor === 'welstory' && menu.hallNo && menu.courseType) {
      loadingDetail = true
      try {
        const params = new URLSearchParams({
          date: selectedDate,
          mealTimeId: selectedTime,
          hallNo: menu.hallNo,
          courseType: menu.courseType,
          nutrient: '1'
        })
        const res = await fetch(`/proxy/${menu.restaurantId}/menus/detail?${params}`)
        if (res.ok) detail = await res.json()
      } finally {
        loadingDetail = false
      }
    }
  }

  function closeZoom () { zoomedMenu = null; detail = [] }

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
                {#if menu.components.length > 0}
                  <span class="gallery-components">{sortedByPScore(menu.components).map((c) => c.name).join(' · ')}</span>
                {/if}
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
      <div class="lightbox-left">
        <img class="lightbox-img" src={proxyImg(zoomedMenu.imageUrl)} alt={zoomedMenu.name} />
        <div class="lightbox-info">
          <div class="lightbox-text">
            <span class="lightbox-name">{zoomedMenu.name}</span>
            {#if zoomedMenu.components.length > 0}
              <span class="lightbox-components">{sortedByPScore(zoomedMenu.components).map((c) => c.name).join(' · ')}</span>
            {/if}
            <span class="lightbox-restaurant">{restaurantNames(zoomedMenu.restaurantIds)}</span>
          </div>
          {#if ps !== null}
            <span class="ps-badge {pScoreColor(ps)}">{ps}</span>
          {/if}
        </div>
      </div>
      <div class="lightbox-right">
        {#if activeNutrients(zoomedMenu.nutrition).length > 0}
          <div class="lightbox-nutrition">
            {#each activeNutrients(zoomedMenu.nutrition) as { key, label, unit }}
              <div class="nutr-cell">
                <span class="nutr-label">{label}</span>
                <span class="nutr-value">{formatMetric(zoomedMenu.nutrition?.[key], unit)}</span>
              </div>
            {/each}
          </div>
        {/if}
        {#if loadingDetail}
          <div class="detail-loading">
            {#each Array(3) as _}
              <div class="shimmer"></div>
            {/each}
          </div>
        {:else if detail.length > 0}
          {@const detailRows = detailRowsFor(zoomedMenu)}
          {@const detailMetrics = activeDetailNutrients(detailRows)}
          <div class="detail-table-wrap">
            <table class="detail-table">
              <thead>
                <tr>
                  <th class="detail-col-name">항목</th>
                  <th class="detail-col-ps">P-Score</th>
                  {#each detailMetrics as { label }}
                    <th class="detail-col-num">{label}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each detailRows as dish}
                  {@const dn = dish.nutrition}
                  {@const dps = pScore(dn, app.pWeights)}
                  <tr>
                    <td class="detail-col-name dish-name">{dish.name}</td>
                    <td class="detail-col-ps">
                      {#if dps !== null}
                        <span class="ps-badge {pScoreColor(dps)}">{dps}</span>
                      {:else}
                        <span class="ps-na">—</span>
                      {/if}
                    </td>
                    {#each detailMetrics as { key, unit }}
                      <td class="detail-col-num">{formatMetric(dn?.[key], unit)}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
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
    display: flex;
    flex-direction: column;
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
    padding: 24px;
  }
  .lightbox-inner {
    position: relative;
    width: calc(100vw - 48px);
    max-width: 960px;
    max-height: calc(100vh - 48px);
    border-radius: var(--radius);
    background: white;
    box-shadow: 0 24px 64px rgba(0,0,0,0.5);
    display: flex;
    overflow: hidden;
  }
  .lightbox-left {
    width: 45%;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    overflow-y: auto;
  }
  .lightbox-right {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }
  .lightbox-img { width: 100%; aspect-ratio: 1; object-fit: contain; display: block; background: var(--surface); }
  .lightbox-info {
    padding: 12px 16px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    border-top: 1px solid var(--border);
    flex: 1;
  }
  .lightbox-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .lightbox-name { font-size: 15px; font-weight: 600; color: var(--text); }
  .lightbox-components { display: block; font-size: 11px; color: var(--text-dim); line-height: 1.5; margin-top: 2px; }
  .lightbox-restaurant { font-size: 12px; color: var(--text-dim); }
  .lightbox-nutrition {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 6px;
    padding: 10px 16px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .nutr-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 7px 6px;
    border-radius: 8px;
    background: #fff;
    border: 1px solid var(--border);
    text-align: center;
  }
  .nutr-label {
    font-size: 10px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 3px;
  }
  .nutr-value {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--font-sans);
    white-space: nowrap;
  }

  .detail-loading { padding: 10px 16px 14px; display: flex; flex-direction: column; gap: 6px; background: var(--surface); border-top: 1px solid var(--border); }
  .shimmer { height: 13px; border-radius: 3px; background: linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 50%, var(--surface) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  .detail-table-wrap { overflow-x: auto; border-top: 1px solid var(--border); background: var(--surface); }
  .detail-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .detail-table thead tr { border-bottom: 1px solid var(--border); }
  .detail-table th { padding: 7px 8px; text-align: left; font-weight: 600; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; }
  .detail-table td { padding: 8px 8px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .detail-table tbody tr:last-child td { border-bottom: none; }
  .detail-col-name { min-width: 140px; }
  .detail-col-ps { width: 72px; text-align: center; }
  .detail-col-num { width: 80px; text-align: right; font-family: var(--font-sans); white-space: nowrap; }
  .dish-name { color: var(--text-muted); }
  .ps-na { color: var(--text-dim); font-size: 12px; }

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

  .gallery-info { padding: 9px 10px; background: white; border-top: 1px solid var(--border); display: flex; flex-direction: column; flex: 1; }
  .gallery-name { display: block; font-size: 12px; font-weight: 500; color: var(--text); margin-bottom: 3px; line-height: 1.4; }
  .gallery-components { display: block; font-size: 10px; color: var(--text-dim); line-height: 1.4; margin-bottom: 5px; }
  .gallery-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: auto; padding-top: 6px; }
  .gallery-restaurant { font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .ps-badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
  .ps-green { background: #dcfce7; color: #16a34a; }
  .ps-yellow { background: #fef9c3; color: #ca8a04; }
  .ps-red { background: #fee2e2; color: #dc2626; }

  @media (max-width: 640px) {
    .controls { width: 100%; }
    .gallery-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; padding: 12px; }
    .lightbox-inner { flex-direction: column; width: calc(100vw - 32px); max-height: calc(100vh - 32px); overflow-y: auto; }
    .lightbox-left { width: 100%; border-right: none; border-bottom: 1px solid var(--border); overflow-y: visible; }
    .lightbox-right { overflow-y: visible; }
  }
</style>
