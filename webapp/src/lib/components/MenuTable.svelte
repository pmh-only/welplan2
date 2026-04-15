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
  let showSelectionDetail = $state(false)
  let selectionFloatDismissed = $state(false)
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
    showSelectionDetail = false
    selectionFloatDismissed = false
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
    selectionFloatDismissed = false
    if (isSelected(menuId)) {
      selectedMenuIds = selectedMenuIds.filter((id) => id !== menuId)
    } else {
      selectedMenuIds = [...selectedMenuIds, menuId]
    }
  }

  function selectAllVisible () {
    selectionFloatDismissed = false
    selectedMenuIds = visibleMenus.map((menu) => menu.id)
  }

  function clearSelection () {
    showSelectionDetail = false
    selectionFloatDismissed = false
    selectedMenuIds = []
  }

  function menuContext (menu: Menu): string {
    const parentName = (menu as Menu & { parentName?: string }).parentName
    return [restaurantName(menu.restaurantId), parentName].filter(Boolean).join(' - ')
  }

  function formatMetric (value: number | undefined, unit = ''): string {
    if (value == null) return '—'
    const rounded = Math.round(value * 10) / 10
    const display = Number.isInteger(rounded) ? rounded.toLocaleString() : rounded.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    return `${display}${unit}`
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
  const hasAnyImage = $derived(visibleMenus.some((menu) => !!menu.imageUrl))
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
  const selectedItemsText = $derived(selectedMenus.map((menu) => menu.name).join(', '))

  function extractCoin (name: string): number {
    const coinMatch = name.match(/\[(\d+)Coin\]/)
    if (coinMatch) return parseInt(coinMatch[1], 10)
    const mainMatch = name.match(/\[Main(\d+)\]/)
    if (mainMatch) return parseInt(mainMatch[1], 10)
    return 0
  }

  const selectedCoinTotal = $derived(selectedMenus.reduce((sum, menu) => sum + extractCoin(menu.name), 0))

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
          {#if hasAnyImage}<th class="col-img"></th>{/if}
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
            {#if hasAnyImage}
              <td class="col-img" data-label="이미지">
                {#if imgSrc}
                  <button type="button" class="thumb-btn" onclick={(e) => openLightbox(imgSrc, menu.name, e)} aria-label={`${menu.name} 이미지 확대`}>
                    <img class="thumb thumb-clickable" src={imgSrc} alt={menu.name} loading="lazy" />
                  </button>
                {/if}
              </td>
            {/if}
            <td class="col-rest hide-sm" data-label="식당">
              <span class="rest-tag">{restaurantName(menu.restaurantId)}</span>
            </td>
            <td class="col-name" data-label="메뉴">
              {#if parentName}
                <span class="menu-parent">{parentName}</span>
              {/if}
              <span class="menu-name">{menu.name}</span>
              {#if menu.isTakeOut}<span class="badge">포장</span>{/if}
              {#if preferInlineComponents && menu.components.length > 0}
                <span class="menu-desc">{menu.components.map((c) => c.name).join(' · ')}</span>
              {/if}
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

{#if enableSelection && selectedMenus.length > 0}
  <div class="mobile-nutrition-toolbar">
    <div class="toolbar-content">
      <div class="selected-info">
        <div class="selected-count-mobile">📊 {selectedMenus.length}개 항목 선택</div>
        <div class="selected-items-mobile">{selectedItemsText}</div>
      </div>
      <button type="button" class="toolbar-button" onclick={() => { showSelectionDetail = true }}>영양성분 보기</button>
    </div>
  </div>
{/if}

{#if enableSelection && selectedMenus.length > 0 && !selectionFloatDismissed}
  <aside class="aggregated-nutrition-float">
    <div class="float-header">
      <h3 class="float-title">📊 선택된 {selectedMenus.length}개 항목</h3>
      <button type="button" class="float-close" onclick={() => { selectionFloatDismissed = true }} aria-label="요약 닫기">×</button>
    </div>
    <div class="float-content">
      <div class="selected-items-count">{selectedItemsText}</div>

      <div class="coin-total" class:coin-over={selectedCoinTotal > 4}>🪙 {selectedCoinTotal}/4{selectedCoinTotal > 4 ? ' ⚠️ 초과' : ''}</div>

      <div class="nutrition-summary">
        <div class="nutrition-item pscore-item">
          <div class="nutrition-label">P-Score</div>
          <div class="nutrition-value pscore-value">{selectedPScore ?? '—'}</div>
        </div>
        <div class="nutrition-item">
          <div class="nutrition-label">칼로리</div>
          <div class="nutrition-value">{formatMetric(selectedNutrition.calories, ' kcal')}</div>
        </div>
        <div class="nutrition-item">
          <div class="nutrition-label">탄수화물</div>
          <div class="nutrition-value">{formatMetric(selectedNutrition.carbohydrates, 'g')}</div>
        </div>
        <div class="nutrition-item">
          <div class="nutrition-label">당분</div>
          <div class="nutrition-value">{formatMetric(selectedNutrition.sugar, 'g')}</div>
        </div>
        <div class="nutrition-item">
          <div class="nutrition-label">지방</div>
          <div class="nutrition-value">{formatMetric(selectedNutrition.fat, 'g')}</div>
        </div>
        <div class="nutrition-item">
          <div class="nutrition-label">단백질</div>
          <div class="nutrition-value">{formatMetric(selectedNutrition.protein, 'g')}</div>
        </div>
      </div>

      <div class="float-actions">
        <button type="button" class="btn-float" onclick={clearSelection}>선택 해제</button>
        <button type="button" class="btn-float btn-primary" onclick={() => { showSelectionDetail = true }}>상세보기</button>
      </div>
    </div>
  </aside>
{/if}

{#if showSelectionDetail}
  <div
    class="selection-modal-overlay"
    role="button"
    tabindex="0"
    aria-label="선택 영양성분 닫기"
    onclick={() => { showSelectionDetail = false }}
    onkeydown={(e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        showSelectionDetail = false
      }
    }}
  >
    <div class="selection-modal" role="dialog" aria-modal="true" aria-label="선택 항목 영양성분" tabindex="0" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <div class="selection-modal-head">
        <h3>📊 선택된 {selectedMenus.length}개 항목 통합 영양성분</h3>
        <button type="button" class="float-close" onclick={() => { showSelectionDetail = false }} aria-label="상세 닫기">×</button>
      </div>

      <div class="coin-total modal-coin-total" class:coin-over={selectedCoinTotal > 4}>🪙 {selectedCoinTotal}/4{selectedCoinTotal > 4 ? ' ⚠️ 초과' : ''}</div>

      <div class="selection-total-grid">
        <div class="selection-total-card pscore-card">
          <span class="selection-total-label">P-Score</span>
          <span class="selection-total-value">{selectedPScore ?? '—'}</span>
        </div>
        <div class="selection-total-card">
          <span class="selection-total-label">칼로리</span>
          <span class="selection-total-value">{formatMetric(selectedNutrition.calories, ' kcal')}</span>
        </div>
        <div class="selection-total-card">
          <span class="selection-total-label">탄수화물</span>
          <span class="selection-total-value">{formatMetric(selectedNutrition.carbohydrates, 'g')}</span>
        </div>
        <div class="selection-total-card">
          <span class="selection-total-label">당분</span>
          <span class="selection-total-value">{formatMetric(selectedNutrition.sugar, 'g')}</span>
        </div>
        <div class="selection-total-card">
          <span class="selection-total-label">지방</span>
          <span class="selection-total-value">{formatMetric(selectedNutrition.fat, 'g')}</span>
        </div>
        <div class="selection-total-card">
          <span class="selection-total-label">단백질</span>
          <span class="selection-total-value">{formatMetric(selectedNutrition.protein, 'g')}</span>
        </div>
      </div>

      <div class="selection-detail-wrap">
        <table class="selection-detail-table">
          <thead>
            <tr>
              <th>메뉴</th>
              <th>칼로리</th>
              <th>탄수화물</th>
              <th>당분</th>
              <th>지방</th>
              <th>단백질</th>
            </tr>
          </thead>
          <tbody>
            {#each selectedMenus as menu (menu.id)}
              <tr>
                <td>
                  <strong>{menu.name}</strong>
                  <div class="selection-item-context">{menuContext(menu)}</div>
                </td>
                <td>{formatMetric(menu.nutrition?.calories)}</td>
                <td>{formatMetric(menu.nutrition?.carbohydrates, 'g')}</td>
                <td>{formatMetric(menu.nutrition?.sugar, 'g')}</td>
                <td>{formatMetric(menu.nutrition?.fat, 'g')}</td>
                <td>{formatMetric(menu.nutrition?.protein, 'g')}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
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
  .selection-actions { display: flex; gap: 8px; }
  .selection-btn { padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-muted); font-size: 12px; cursor: pointer; }
  .mobile-nutrition-toolbar { display: none; }
  .aggregated-nutrition-float {
    position: fixed;
    right: 20px;
    bottom: 20px;
    width: min(360px, calc(100vw - 32px));
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22);
    z-index: 40;
  }
  .float-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
  }
  .float-title { font-size: 15px; font-weight: 700; color: var(--text); }
  .float-close {
    background: none;
    border: 0;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    color: var(--text-dim);
    font-size: 18px;
    cursor: pointer;
  }
  .float-close:hover { background: var(--surface); color: var(--text); }
  .float-content { padding: 16px; }
  .selected-items-count {
    margin-bottom: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--surface);
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .coin-total {
    margin-bottom: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    background: #fef9c3;
    color: #92400e;
    font-size: 14px;
    font-weight: 700;
    text-align: center;
  }
  .coin-over {
    background: #fee2e2;
    color: #dc2626;
  }
  .modal-coin-total {
    margin-bottom: 14px;
    font-size: 16px;
  }
  .nutrition-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }
  .nutrition-item {
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--surface);
    text-align: center;
  }
  .nutrition-label {
    font-size: 11px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 4px;
  }
  .nutrition-value {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--font-mono);
  }
  .pscore-item { grid-column: span 2; }
  .pscore-value { color: #16a34a; font-size: 16px; }
  .float-actions { display: flex; gap: 8px; }
  .btn-float {
    flex: 1;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
  }
  .btn-float.btn-primary {
    background: #10b981;
    border-color: #10b981;
    color: #fff;
  }
  .selection-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgba(15, 23, 42, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .selection-modal {
    width: min(920px, 100%);
    max-height: min(85vh, 900px);
    overflow: auto;
    background: #fff;
    border-radius: 14px;
    border: 1px solid var(--border);
    box-shadow: 0 20px 50px rgba(15, 23, 42, 0.35);
  }
  .selection-modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--border);
  }
  .selection-modal-head h3 { font-size: 18px; font-weight: 700; color: var(--text); }
  .selection-total-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
    padding: 18px;
  }
  .selection-total-card {
    padding: 12px;
    border-radius: 10px;
    background: var(--surface);
    text-align: center;
  }
  .selection-total-label {
    display: block;
    font-size: 12px;
    color: var(--text-dim);
    margin-bottom: 6px;
  }
  .selection-total-value {
    font-size: 18px;
    font-weight: 700;
    font-family: var(--font-mono);
    color: var(--text);
  }
  .pscore-card .selection-total-value { color: #16a34a; }
  .selection-detail-wrap { padding: 0 18px 18px; overflow-x: auto; }
  .selection-detail-table { width: 100%; border-collapse: collapse; }
  .selection-detail-table th,
  .selection-detail-table td {
    padding: 10px 12px;
    border: 1px solid var(--border);
    font-size: 13px;
  }
  .selection-detail-table th { background: var(--surface); text-align: left; color: var(--text-muted); }
  .selection-item-context { margin-top: 4px; font-size: 11px; color: var(--text-dim); }
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
  .menu-desc { display: block; font-size: 11px; color: var(--text-dim); margin-top: 3px; line-height: 1.5; }
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

    .selection-bar { padding-top: 0; }
    .selection-actions { width: 100%; }
    .selection-btn { flex: 1; }
    .aggregated-nutrition-float { display: none; }
    .mobile-nutrition-toolbar {
      display: block;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 45;
      background: #fff;
      border-top: 1px solid var(--border);
      box-shadow: 0 -8px 20px rgba(15, 23, 42, 0.15);
      padding: 12px 16px;
    }
    .toolbar-content { display: flex; align-items: center; gap: 12px; }
    .selected-info { min-width: 0; flex: 1; }
    .selected-count-mobile { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 2px; }
    .selected-items-mobile {
      font-size: 11px;
      color: var(--text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .toolbar-button {
      flex-shrink: 0;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid #10b981;
      background: #10b981;
      color: #fff;
      font-size: 12px;
      cursor: pointer;
    }
    .selection-modal-overlay { align-items: flex-end; padding: 0; }
    .selection-modal {
      width: 100%;
      max-height: 85vh;
      border-radius: 16px 16px 0 0;
      border-left: 0;
      border-right: 0;
      border-bottom: 0;
    }
    .selection-total-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .selection-detail-wrap { padding-bottom: 90px; }

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
