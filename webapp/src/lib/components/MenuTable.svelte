<script lang="ts">
  import { app } from '$lib/state.svelte'
  import { pScore, pScoreColor, proxyImg } from '$lib/utils'
  import type { Menu, MenuComponent, NutritionInfo, Restaurant } from '$lib/types'

  let {
    menus,
    restaurants,
    date,
    time,
    emptyMessage,
    preferInlineComponents = false,
    enableSelection = false,
    viewMode = 'scroll'
  }: {
    menus: Menu[]
    restaurants: Restaurant[]
    date: string
    time: string
    emptyMessage: string
    preferInlineComponents?: boolean
    enableSelection?: boolean
    viewMode?: 'scroll' | 'card'
  } = $props()

  let expandedMenuId = $state<string | null>(null)
  let detail = $state<MenuComponent[]>([])
  let loadingDetail = $state(false)
  let lightboxSrc = $state<string | null>(null)
  let lightboxAlt = $state('')
  let selectedMenuIds = $state<string[]>([])
  let sortKey = $state<SortKey | null>(null)
  let sortDirection = $state<'asc' | 'desc'>('asc')

  type SortKey =
    | 'restaurant'
    | 'name'
    | 'pscore'
    | 'calories'
    | 'carbohydrates'
    | 'sugar'
    | 'fat'
    | 'protein'
    | 'sodium'

  type SortValue = number | string | null

  function openLightbox (src: string, alt: string, e: MouseEvent) {
    e.stopPropagation()
    lightboxSrc = src
    lightboxAlt = alt
  }

  function closeLightbox () { lightboxSrc = null }

  $effect(() => {
    const _menus = menus
    expandedMenuId = null
    detail = []
    loadingDetail = false
    selectedMenuIds = []
  })

  function restaurantName (id: string): string {
    return restaurants.find((restaurant) => restaurant.id === id)?.name ?? id
  }

  function sortArrow (key: SortKey): string {
    if (sortKey !== key) return ''
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  function toggleSort (key: SortKey) {
    if (sortKey === key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'
      return
    }

    sortKey = key
    sortDirection = 'asc'
  }

  function isSelected (menuId: string): boolean {
    return selectedMenuIds.includes(menuId)
  }

  function toggleSelection (menuId: string) {
    if (isSelected(menuId)) {
      selectedMenuIds = selectedMenuIds.filter((id) => id !== menuId)
    } else {
      selectedMenuIds = [...selectedMenuIds, menuId]
    }
  }

  function selectAllVisible () {
    selectedMenuIds = visibleMenus.map((menu) => menu.id)
  }

  function clearSelection () {
    selectedMenuIds = []
  }

  function sortValueFor (menu: Menu, key: SortKey): SortValue {
    const nutrition = menu.nutrition

    switch (key) {
      case 'restaurant': return restaurantName(menu.restaurantId)
      case 'name': return menu.name
      case 'pscore': return pScore(nutrition, app.pWeights)
      case 'calories': return nutrition?.calories ?? null
      case 'carbohydrates': return nutrition?.carbohydrates ?? null
      case 'sugar': return nutrition?.sugar ?? null
      case 'fat': return nutrition?.fat ?? null
      case 'protein': return nutrition?.protein ?? null
      case 'sodium': return nutrition?.sodium ?? null
    }
  }

  function compareMenus (a: Menu, b: Menu): number {
    if (!sortKey) return 0

    const aValue = sortValueFor(a, sortKey)
    const bValue = sortValueFor(b, sortKey)

    if (aValue == null && bValue == null) return 0
    if (aValue == null) return 1
    if (bValue == null) return -1

    const comparison = typeof aValue === 'string' && typeof bValue === 'string'
      ? aValue.localeCompare(bValue, 'ko')
      : Number(aValue) - Number(bValue)

    return sortDirection === 'asc' ? comparison : -comparison
  }

  const visibleMenus = $derived([...menus].sort(compareMenus))
  const selectedMenus = $derived(visibleMenus.filter((menu) => isSelected(menu.id)))
  const selectedNutrition = $derived(
    selectedMenus.reduce(
      (totals: NutritionInfo, menu) => ({
        calories: (totals.calories ?? 0) + (menu.nutrition?.calories ?? 0),
        carbohydrates: (totals.carbohydrates ?? 0) + (menu.nutrition?.carbohydrates ?? 0),
        sugar: (totals.sugar ?? 0) + (menu.nutrition?.sugar ?? 0),
        fat: (totals.fat ?? 0) + (menu.nutrition?.fat ?? 0),
        protein: (totals.protein ?? 0) + (menu.nutrition?.protein ?? 0),
        sodium: (totals.sodium ?? 0) + (menu.nutrition?.sodium ?? 0)
      }),
      {} as NutritionInfo
    )
  )
  const selectedPScore = $derived(selectedMenus.length > 0 ? pScore(selectedNutrition, app.pWeights) : null)

  function normalizeMenuName (name: string): string {
    return name.replace(/\s*포장$/, '').trim()
  }

  function isExpandable (menu: Menu): boolean {
    return (menu.hallNo != null && menu.courseType != null) || menu.components.length > 0
  }

  function isWelstoryTakeOutDetail (menu: Menu): boolean {
    return menu.vendor === 'welstory' && menu.isTakeOut
  }

  function detailRowsFor (menu: Menu): MenuComponent[] {
    if (!isWelstoryTakeOutDetail(menu) || detail.length <= 1) return detail

    const normalizedMenuName = normalizeMenuName(menu.name)
    const rows = detail.filter((dish) => !(normalizeMenuName(dish.name) === normalizedMenuName && dish.nutrition?.calories === 0))
    return rows.length > 0 ? rows : detail
  }

  async function toggleMenu (menu: Menu) {
    if (expandedMenuId === menu.id) {
      expandedMenuId = null
      return
    }

    expandedMenuId = menu.id
    detail = []

    if (preferInlineComponents && menu.components.length > 0) {
      detail = menu.components
    } else if (menu.hallNo && menu.courseType) {
      loadingDetail = true
      try {
        const params = new URLSearchParams({
          date,
          mealTimeId: time,
          hallNo: menu.hallNo,
          courseType: menu.courseType
        })
        if (isWelstoryTakeOutDetail(menu)) params.set('nutrient', '1')
        const res = await fetch(`/proxy/${menu.restaurantId}/menus/detail?${params}`)
        if (res.ok) detail = await res.json()
      } finally {
        loadingDetail = false
      }
    } else {
      detail = menu.components
    }
  }
</script>

{#if visibleMenus.length === 0}
  <div class="empty-state"><p>{emptyMessage}</p></div>
{:else}
  {#if enableSelection}
    <div class="selection-bar">
      <div class="selection-meta">
        <span class="selection-count">선택 {selectedMenus.length}개</span>
        {#if selectedMenus.length > 0}
          <span class="selection-score">합산 P-Score {selectedPScore ?? '—'}</span>
          <span class="selection-nutrition">{selectedNutrition.calories ?? 0} kcal · 탄 {selectedNutrition.carbohydrates ?? 0}g · 당 {selectedNutrition.sugar ?? 0}g · 지 {selectedNutrition.fat ?? 0}g · 단 {selectedNutrition.protein ?? 0}g</span>
        {/if}
      </div>
      <div class="selection-actions">
        <button type="button" class="selection-btn" onclick={selectAllVisible}>전체 선택</button>
        <button type="button" class="selection-btn" onclick={clearSelection}>선택 해제</button>
      </div>
    </div>
  {/if}

  <div class="table-wrap" class:card-view={viewMode === 'card'}>
    <table class="menu-table">
      <thead>
        <tr>
          {#if enableSelection}<th class="col-check"></th>{/if}
          <th class="col-img"></th>
          <th class="col-rest hide-sm"><button type="button" class="sort-btn" onclick={() => toggleSort('restaurant')}>식당 {sortArrow('restaurant')}</button></th>
          <th class="col-name"><button type="button" class="sort-btn" onclick={() => toggleSort('name')}>메뉴 {sortArrow('name')}</button></th>
          <th class="col-ps"><button type="button" class="sort-btn sort-btn-center" onclick={() => toggleSort('pscore')}>P-Score {sortArrow('pscore')}</button></th>
          <th class="col-num"><button type="button" class="sort-btn sort-btn-right" onclick={() => toggleSort('calories')}>칼로리 {sortArrow('calories')}</button></th>
          <th class="col-num hide-sm"><button type="button" class="sort-btn sort-btn-right" onclick={() => toggleSort('carbohydrates')}>탄수화물 {sortArrow('carbohydrates')}</button></th>
          <th class="col-num hide-sm"><button type="button" class="sort-btn sort-btn-right" onclick={() => toggleSort('sugar')}>당 {sortArrow('sugar')}</button></th>
          <th class="col-num"><button type="button" class="sort-btn sort-btn-right" onclick={() => toggleSort('fat')}>지방 {sortArrow('fat')}</button></th>
          <th class="col-num"><button type="button" class="sort-btn sort-btn-right" onclick={() => toggleSort('protein')}>단백질 {sortArrow('protein')}</button></th>
          <th class="col-num hide-sm"><button type="button" class="sort-btn sort-btn-right" onclick={() => toggleSort('sodium')}>나트륨 {sortArrow('sodium')}</button></th>
        </tr>
      </thead>
      <tbody>
        {#each visibleMenus as menu (menu.id)}
          {@const isExpanded = expandedMenuId === menu.id}
          {@const canExpand = isExpandable(menu)}
          {@const selected = isSelected(menu.id)}
          {@const parentName = (menu as Menu & { parentName?: string }).parentName}
          {@const n = menu.nutrition}
          {@const imgSrc = proxyImg(menu.imageUrl)}
          {@const ps = pScore(n, app.pWeights)}
          <tr class="menu-row" class:selected={selected} class:expanded={isExpanded} class:expandable={canExpand} onclick={() => { if (enableSelection && !canExpand) toggleSelection(menu.id); else if (canExpand) toggleMenu(menu) }}>
            {#if enableSelection}
              <td class="col-check" data-label="선택">
                <input type="checkbox" checked={selected} onclick={(e) => e.stopPropagation()} onchange={() => toggleSelection(menu.id)} />
              </td>
            {/if}
            <td class="col-img" data-label="이미지">
              {#if imgSrc}
                <button type="button" class="thumb-btn" onclick={(e) => openLightbox(imgSrc, menu.name, e)} aria-label={`${menu.name} 이미지 확대`}>
                  <img class="thumb thumb-clickable" src={imgSrc} alt={menu.name} loading="lazy" />
                </button>
              {:else}
                <div class="thumb-placeholder"></div>
              {/if}
            </td>
            <td class="col-rest hide-sm" data-label="식당">
              <span class="rest-tag">{restaurantName(menu.restaurantId)}</span>
            </td>
            <td class="col-name" data-label="메뉴">
              {#if parentName}
                <span class="menu-parent">{parentName}</span>
              {/if}
              <span class="menu-name">{menu.name}</span>
              {#if menu.isTakeOut}<span class="badge">포장</span>{/if}
            </td>
            <td class="col-ps" data-label="P-Score">
              {#if ps !== null}
                <span class="ps-badge {pScoreColor(ps)}">{ps}</span>
              {:else}
                <span class="ps-na">—</span>
              {/if}
            </td>
            <td class="col-num" data-label="칼로리">{n?.calories != null ? `${n.calories.toLocaleString()} kcal` : '—'}</td>
            <td class="col-num hide-sm" data-label="탄수화물">{n?.carbohydrates != null ? `${n.carbohydrates}g` : '—'}</td>
            <td class="col-num hide-sm" data-label="당">{n?.sugar != null ? `${n.sugar}g` : '—'}</td>
            <td class="col-num" data-label="지방">{n?.fat != null ? `${n.fat}g` : '—'}</td>
            <td class="col-num" data-label="단백질">{n?.protein != null ? `${n.protein}g` : '—'}</td>
            <td class="col-num hide-sm" data-label="나트륨">{n?.sodium != null ? `${n.sodium}mg` : '—'}</td>
          </tr>
          {#if isExpanded}
            <tr class="detail-row">
              <td colspan={enableSelection ? 11 : 10}>
                {#if loadingDetail}
                  <div class="detail-loading">
                    {#each Array(4) as _}
                      <div class="shimmer" style="height:13px; margin-bottom:6px; border-radius:3px"></div>
                    {/each}
                  </div>
                {:else if detail.length === 0}
                  <p class="detail-empty">구성 정보 없음</p>
                {:else}
                  {@const detailRows = detailRowsFor(menu)}
                  {#if isWelstoryTakeOutDetail(menu)}
                    <div class="detail-table-wrap">
                      <table class="detail-table">
                        <thead>
                          <tr>
                            <th class="detail-col-name">항목</th>
                            <th class="detail-col-ps">P-Score</th>
                            <th class="detail-col-num">칼로리</th>
                            <th class="detail-col-num hide-sm">탄수화물</th>
                            <th class="detail-col-num hide-sm">당</th>
                            <th class="detail-col-num">지방</th>
                            <th class="detail-col-num">단백질</th>
                            <th class="detail-col-num hide-sm">나트륨</th>
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
                              <td class="detail-col-num">{dn?.calories != null ? `${dn.calories} kcal` : '—'}</td>
                              <td class="detail-col-num hide-sm">{dn?.carbohydrates != null ? `${dn.carbohydrates}g` : '—'}</td>
                              <td class="detail-col-num hide-sm">{dn?.sugar != null ? `${dn.sugar}g` : '—'}</td>
                              <td class="detail-col-num">{dn?.fat != null ? `${dn.fat}g` : '—'}</td>
                              <td class="detail-col-num">{dn?.protein != null ? `${dn.protein}g` : '—'}</td>
                              <td class="detail-col-num hide-sm">{dn?.sodium != null ? `${dn.sodium}mg` : '—'}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  {:else}
                    <table class="dish-table">
                      <tbody>
                        {#each detailRows as dish}
                          <tr>
                            <td class="dish-name">{dish.name}</td>
                            <td class="dish-num">{dish.nutrition?.calories != null ? `${dish.nutrition.calories} kcal` : ''}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                    {#if detailRows[0]?.nutrition}
                      {@const dn = detailRows[0].nutrition}
                      <div class="detail-pills">
                        {#if dn?.carbohydrates != null}<span class="pill pill-carb">탄 {dn.carbohydrates}g</span>{/if}
                        {#if dn?.sugar != null}<span class="pill">당 {dn.sugar}g</span>{/if}
                        {#if dn?.fat != null}<span class="pill pill-fat">지 {dn.fat}g</span>{/if}
                        {#if dn?.protein != null}<span class="pill pill-protein">단 {dn.protein}g</span>{/if}
                        {#if dn?.sodium != null}<span class="pill">나트륨 {dn.sodium}mg</span>{/if}
                      </div>
                    {/if}
                  {/if}
                {/if}
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
{/if}

{#if lightboxSrc}
  <div
    class="lightbox-overlay"
    role="button"
    tabindex="0"
    aria-label="확대 이미지 닫기"
    onclick={closeLightbox}
    onkeydown={(e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        closeLightbox()
      }
    }}
  >
    <button type="button" class="lightbox-frame" aria-label="확대 이미지" onclick={(e) => e.stopPropagation()}>
      <img class="lightbox-img" src={lightboxSrc} alt={lightboxAlt} />
    </button>
  </div>
{/if}

<style>
  .table-wrap { overflow-x: auto; border-radius: var(--radius); }
  .menu-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .menu-table thead tr { background: var(--surface); border-bottom: 2px solid var(--border); }
  .menu-table th { padding: 9px 12px; text-align: left; font-weight: 600; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
  .selection-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px 0; flex-wrap: wrap; }
  .selection-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .selection-count { font-size: 12px; font-weight: 700; color: var(--text); }
  .selection-score, .selection-nutrition { font-size: 12px; color: var(--text-muted); }
  .selection-actions { display: flex; gap: 8px; }
  .selection-btn { padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-muted); font-size: 12px; cursor: pointer; }
  .sort-btn { width: 100%; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .sort-btn-center { text-align: center; }
  .sort-btn-right { text-align: right; }

  .col-check { width: 40px; text-align: center; }
  .col-img { width: 60px; padding: 0 8px; }
  .col-rest { width: 90px; }
  .col-name { min-width: 140px; }
  .col-ps { width: 80px; text-align: center; }
  .col-num { width: 90px; text-align: right; font-family: var(--font-mono); }

  .menu-row { border-bottom: 1px solid var(--border); transition: background 0.1s; }
  .menu-row.selected { background: #f0fdf4; }
  .menu-row.expandable { cursor: pointer; }
  .menu-row.expandable:hover { background: var(--surface); }
  .menu-row.expanded { background: var(--surface); border-bottom-color: transparent; }
  .menu-row td { padding: 10px 12px; vertical-align: middle; }
  .menu-row .col-img { padding: 6px 8px; }

  .thumb { width: 52px; height: 52px; object-fit: cover; border-radius: 6px; display: block; }
  .thumb-btn { display: block; padding: 0; border: 0; background: transparent; border-radius: 6px; }
  .thumb-placeholder { width: 52px; height: 52px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); }

  .rest-tag { font-size: 11px; color: var(--text-dim); }
  .menu-parent { display: block; font-size: 11px; color: var(--text-dim); margin-bottom: 4px; }
  .menu-name { font-weight: 500; color: var(--text); line-height: 1.4; }
  .badge { display: inline-block; font-size: 9px; padding: 1px 5px; border-radius: 3px; background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); font-family: var(--font-mono); letter-spacing: 0.5px; margin-left: 6px; vertical-align: middle; }

  .ps-badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; font-family: var(--font-mono); }
  .ps-green { background: #dcfce7; color: #16a34a; }
  .ps-yellow { background: #fef9c3; color: #ca8a04; }
  .ps-red { background: #fee2e2; color: #dc2626; }
  .ps-na { color: var(--text-dim); font-size: 12px; }

  .detail-row td { padding: 0 12px 14px 76px; background: var(--surface); border-bottom: 1px solid var(--border); }
  .detail-table-wrap { overflow-x: auto; }
  .detail-table { width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 12px; }
  .detail-table thead tr { border-bottom: 1px solid var(--border); }
  .detail-table th { padding: 7px 8px; text-align: left; font-weight: 600; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; }
  .detail-table td { padding: 8px 8px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .detail-table tbody tr:last-child td { border-bottom: none; }
  .detail-col-name { min-width: 220px; }
  .detail-col-ps { width: 80px; text-align: center; }
  .detail-col-num { width: 88px; text-align: right; font-family: var(--font-mono); white-space: nowrap; }
  .dish-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .dish-table tr { border-bottom: 1px solid var(--border); }
  .dish-table tr:last-child { border-bottom: none; }
  .dish-table td { padding: 5px 8px 5px 0; font-size: 12px; }
  .dish-name { color: var(--text-muted); }
  .dish-num { text-align: right; font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); white-space: nowrap; padding-left: 16px; }
  .detail-pills { display: flex; gap: 6px; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid var(--border); }
  .pill { font-family: var(--font-mono); font-size: 10px; padding: 2px 7px; border-radius: 10px; background: var(--bg); border: 1px solid var(--border); color: var(--text-dim); }
  .pill-carb { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
  .pill-fat { background: #fff1f2; border-color: #fecdd3; color: #be123c; }
  .pill-protein { background: #fff7ed; border-color: #fed7aa; color: #c2410c; }
  .detail-loading { padding: 12px 0; }
  .detail-empty { font-size: 12px; color: var(--text-dim); font-style: italic; padding: 8px 0; }

  .shimmer { background: linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 50%, var(--surface) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .empty-state { text-align: center; padding: 48px 20px; color: var(--text-dim); font-size: 13px; }

  @media (max-width: 640px) {
    .hide-sm { display: none; }
    .detail-row td { padding-left: 12px; }

    .table-wrap.card-view .menu-table thead { display: none; }
    .table-wrap.card-view .menu-table,
    .table-wrap.card-view .menu-table tbody,
    .table-wrap.card-view .menu-table tr,
    .table-wrap.card-view .menu-table td { display: block; width: 100%; }
    .table-wrap.card-view .hide-sm { display: block; }
    .table-wrap.card-view .menu-row {
      margin: 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: #fff;
      overflow: hidden;
    }
    .table-wrap.card-view .menu-row td {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      text-align: left;
    }
    .table-wrap.card-view .menu-row td::before {
      content: attr(data-label);
      font-size: 11px;
      color: var(--text-dim);
      min-width: 72px;
      font-family: var(--font-mono);
    }
    .table-wrap.card-view .menu-row .col-img,
    .table-wrap.card-view .menu-row .col-name { align-items: flex-start; }
    .table-wrap.card-view .menu-row .col-img::before { display: none; }
    .table-wrap.card-view .menu-row .col-check { justify-content: flex-start; }
    .table-wrap.card-view .menu-row .col-check::before { min-width: 40px; }
    .table-wrap.card-view .menu-row .col-num,
    .table-wrap.card-view .menu-row .col-ps { text-align: left; }
    .table-wrap.card-view .menu-row.expandable:hover { background: #fff; }
    .table-wrap.card-view .detail-row td { padding: 0 12px 14px 12px; }
    .table-wrap.card-view .selection-bar { padding-top: 0; }
  }

  .thumb-clickable { cursor: zoom-in; }

  .lightbox-overlay {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(0, 0, 0, 0.8);
    display: flex; align-items: center; justify-content: center;
    cursor: zoom-out;
  }
  .lightbox-img {
    max-width: min(90vw, 600px); max-height: 90vh;
    object-fit: contain; border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    cursor: default;
  }
  .lightbox-frame { padding: 0; border: 0; background: transparent; cursor: default; }
</style>
