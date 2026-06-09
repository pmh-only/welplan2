<script lang="ts">
  import { untrack } from 'svelte'
  import { autoSelectMealTime, proxyImg } from '$lib/utils'
  import type { MealTime, Menu, MenuComponent, NutritionInfo, Restaurant } from '$lib/types'
  import { BarChart3, ChevronDown, ChevronRight, Coins, TriangleAlert, X } from '@lucide/svelte'

  let {
    menus,
    restaurants,
    mealTimes = [],
    date,
    time,
    emptyMessage,
    preferInlineComponents = false,
    enableSelection = false,
    groupByMealTime = false,
    hideRestaurantLabels = false
  }: {
    menus: Menu[]
    restaurants: Restaurant[]
    mealTimes?: MealTime[]
    date: string
    time: string
    emptyMessage: string
    preferInlineComponents?: boolean
    enableSelection?: boolean
    groupByMealTime?: boolean
    hideRestaurantLabels?: boolean
  } = $props()

  let expandedMenuId = $state<string | null>(null)
  let detail = $state<MenuComponent[]>([])
  let loadingDetail = $state(false)
  let lightboxSrc = $state<string | null>(null)
  let lightboxAlt = $state('')
  let showSelectionDetail = $state(false)
  let selectionFloatDismissed = $state(false)
  let selectedMenuIds = $state<string[]>([])
  let expandedMealTimeIds = $state<string[]>(
    untrack(() =>
      groupByMealTime ? [autoSelectMealTime(mealTimes)].filter((id): id is string => id != null) : []
    )
  )
  let sortKey = $state<SortKey | null>(null)
  let sortDirection = $state<'asc' | 'desc'>('asc')

  type SortKey =
    | 'restaurant'
    | 'name'
    | 'calories'
    | 'carbohydrates'
    | 'sugar'
    | 'fat'
    | 'protein'
    | 'sodium'

  type SortValue = number | string | null
  type NutritionKey = keyof NutritionInfo
  type MenuRow =
    | { type: 'mealTime', mealTime: MealTime, count: number }
    | { type: 'menu', menu: Menu }
  type DetailMetric = {
    key: NutritionKey
    label: string
    unit?: string
  }

  const detailMetricDefs: DetailMetric[] = [
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
    { key: 'calcium', label: '칼슘', unit: 'mg' }
  ]

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
    expandedMealTimeIds = groupByMealTime ? defaultExpandedMealTimeIds() : []
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

  function menuKey (menu: Menu): string {
    return `${menu.mealTimeId}:${menu.id}`
  }

  function defaultExpandedMealTimeIds (): string[] {
    const currentMealTimeId = autoSelectMealTime(mealTimes)
    return currentMealTimeId ? [currentMealTimeId] : []
  }

  function isMealTimeExpanded (mealTimeId: string): boolean {
    return expandedMealTimeIds.includes(mealTimeId)
  }

  function toggleMealTime (mealTimeId: string) {
    if (isMealTimeExpanded(mealTimeId)) {
      expandedMealTimeIds = expandedMealTimeIds.filter((id) => id !== mealTimeId)
    } else {
      expandedMealTimeIds = [...expandedMealTimeIds, mealTimeId]
    }
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
    selectedMenuIds = visibleMenus.map(menuKey)
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
  const visibleRows = $derived.by<MenuRow[]>(() => {
    if (!groupByMealTime) return visibleMenus.map((menu) => ({ type: 'menu', menu }))

    return mealTimes.flatMap((mealTime) => {
      const sectionMenus = visibleMenus.filter((menu) => menu.mealTimeId === mealTime.id)
      if (sectionMenus.length === 0) return []
      if (!isMealTimeExpanded(mealTime.id)) {
        return [{ type: 'mealTime' as const, mealTime, count: sectionMenus.length }]
      }
      return [
        { type: 'mealTime' as const, mealTime, count: sectionMenus.length },
        ...sectionMenus.map((menu) => ({ type: 'menu' as const, menu }))
      ]
    })
  })
  const hasAnyImage = $derived(visibleMenus.some((menu) => !!menu.imageUrl))
  const selectedMenus = $derived(visibleMenus.filter((menu) => isSelected(menuKey(menu))))
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
    return menu.vendor === 'shinsegae' || (menu.hallNo != null && menu.courseType != null) || menu.components.length > 0
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

  function detailMetricsFor (rows: MenuComponent[]): DetailMetric[] {
    return detailMetricDefs.filter(({ key }) => rows.some((row) => row.nutrition?.[key] != null))
  }

  function showDetailedNutrients (rows: MenuComponent[]): boolean {
    return detailMetricsFor(rows).some(({ key }) => key !== 'calories')
  }

  async function toggleMenu (menu: Menu) {
    const key = menuKey(menu)
    if (expandedMenuId === key) {
      expandedMenuId = null
      return
    }

    expandedMenuId = key
    detail = []

    if (menu.vendor === 'shinsegae') {
      loadingDetail = false
    } else if (preferInlineComponents && menu.components.length > 0) {
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
        params.set('mealTimeId', menu.mealTimeId)
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
  <div class={enableSelection ? 'table-wrap selection-mode' : 'table-wrap'}>
    <table class={enableSelection ? 'menu-table selection-mode' : 'menu-table'}>
      <thead>
        <tr>
          {#if enableSelection}<th class="col-check"></th>{/if}
          {#if hasAnyImage}<th class="col-img"></th>{/if}
          {#if !hideRestaurantLabels}<th class="col-rest hide-sm"><button type="button" class="sort-btn" onclick={() => toggleSort('restaurant')}>식당 {sortArrow('restaurant')}</button></th>{/if}
          <th class="col-name"><button type="button" class="sort-btn" onclick={() => toggleSort('name')}>메뉴 {sortArrow('name')}</button></th>
          <th class="col-num"><button type="button" class="sort-btn sort-btn-right" onclick={() => toggleSort('calories')}>칼로리 {sortArrow('calories')}</button></th>
          <th class="col-num hide-sm"><button type="button" class="sort-btn sort-btn-right" onclick={() => toggleSort('carbohydrates')}>탄수화물 {sortArrow('carbohydrates')}</button></th>
          <th class="col-num hide-sm"><button type="button" class="sort-btn sort-btn-right" onclick={() => toggleSort('sugar')}>당 {sortArrow('sugar')}</button></th>
          <th class="col-num"><button type="button" class="sort-btn sort-btn-right" onclick={() => toggleSort('fat')}>지방 {sortArrow('fat')}</button></th>
          <th class="col-num"><button type="button" class="sort-btn sort-btn-right" onclick={() => toggleSort('protein')}>단백질 {sortArrow('protein')}</button></th>
          <th class="col-num hide-sm"><button type="button" class="sort-btn sort-btn-right" onclick={() => toggleSort('sodium')}>나트륨 {sortArrow('sodium')}</button></th>
        </tr>
      </thead>
      <tbody>
        {#each visibleRows as row (`${row.type}:${row.type === 'menu' ? menuKey(row.menu) : row.mealTime.id}`)}
          {#if row.type === 'mealTime'}
            {@const isExpanded = isMealTimeExpanded(row.mealTime.id)}
            <tr class="meal-time-row">
              <th colspan={(enableSelection ? 10 : 9) - (hideRestaurantLabels ? 1 : 0)}>
                <button
                  type="button"
                  class="meal-time-toggle"
                  aria-expanded={isExpanded}
                  onclick={() => toggleMealTime(row.mealTime.id)}
                >
                  {#if isExpanded}
                    <ChevronDown class="meal-time-caret" aria-hidden="true" />
                  {:else}
                    <ChevronRight class="meal-time-caret" aria-hidden="true" />
                  {/if}
                  <span class="meal-time-title">{row.mealTime.name}</span>
                  <span class="meal-time-count">{row.count}개</span>
                </button>
              </th>
            </tr>
          {:else}
          {@const menu = row.menu}
          {@const key = menuKey(menu)}
          {@const isExpanded = expandedMenuId === key}
          {@const canExpand = isExpandable(menu)}
          {@const selected = isSelected(key)}
          {@const restaurant = restaurantName(menu.restaurantId)}
          {@const parentName = (menu as Menu & { parentName?: string }).parentName}
          {@const n = menu.nutrition}
          {@const imgSrc = proxyImg(menu.imageUrl)}
          <tr class="menu-row" class:selected={selected} class:expanded={isExpanded} class:expandable={canExpand} class:clickable={enableSelection || canExpand} onclick={() => { if (enableSelection) toggleSelection(key); else if (canExpand) toggleMenu(menu) }}>
            {#if enableSelection}
              <td class="col-check" data-label="선택">
                <input type="checkbox" checked={selected} onclick={(e) => e.stopPropagation()} onchange={() => toggleSelection(key)} />
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
            {#if !hideRestaurantLabels}
              <td class="col-rest hide-sm" data-label="식당">
                <span class="rest-tag">{restaurant}</span>
              </td>
            {/if}
            <td class="col-name" data-label="메뉴">
              {#if (preferInlineComponents || enableSelection) && !hideRestaurantLabels && !parentName}
                <span class="rest-tag rest-tag-mobile">{restaurant}</span>
              {/if}
              {#if parentName && !hideRestaurantLabels}
                <span class="menu-parent">{parentName}</span>
              {/if}
              <span class="menu-name">{menu.name}</span>
              {#if menu.isTakeOut}<span class="badge">포장</span>{/if}
              {#if enableSelection && canExpand}
                <button type="button" class="detail-toggle-btn" onclick={(e) => { e.stopPropagation(); toggleMenu(menu) }}>
                  {isExpanded ? '상세 닫기' : '상세'}
                </button>
              {/if}
              {#if preferInlineComponents && menu.components.length > 0}
                <span class="menu-desc">{menu.components.map((c) => c.name).join(' · ')}</span>
              {:else if preferInlineComponents && menu.vendor === 'shinsegae'}
                <span class="menu-desc menu-desc-unavailable">(신세계푸드 식당은 상세 메뉴 정보를 제공하지 않습니다)</span>
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
              <td colspan={enableSelection ? 10 : 9}>
                {#if loadingDetail}
                  <div class="detail-loading">
                    {#each Array(4) as _}
                      <div class="shimmer" style="height:13px; margin-bottom:6px; border-radius:3px"></div>
                    {/each}
                  </div>
                {:else if detail.length === 0}
                  <p class="detail-empty">{menu.vendor === 'shinsegae' ? '(신세계푸드 식당은 상세 메뉴 정보를 제공하지 않습니다)' : '구성 정보 없음'}</p>
                {:else}
                  {@const detailRows = detailRowsFor(menu)}
                  {@const detailMetrics = detailMetricsFor(detailRows)}
                  {#if showDetailedNutrients(detailRows)}
                    <div class="detail-table-wrap">
                      <table class="detail-table">
                        <thead>
                          <tr>
                            <th class="detail-col-name">항목</th>
                            {#each detailMetrics as metric}
                              <th class="detail-col-num">{metric.label}</th>
                            {/each}
                          </tr>
                        </thead>
                        <tbody>
                          {#each detailRows as dish}
                            {@const dn = dish.nutrition}
                            <tr>
                              <td class="detail-col-name dish-name">{dish.name}</td>
                              {#each detailMetrics as metric}
                                <td class="detail-col-num" data-label={metric.label}>
                                  {formatMetric(dn?.[metric.key], metric.unit)}
                                </td>
                              {/each}
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
                            <td class="dish-num">{formatMetric(dish.nutrition?.calories, ' kcal')}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  {/if}
                {/if}
              </td>
            </tr>
          {/if}
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
        <div class="selected-count-mobile">
          <BarChart3 class="inline-icon" aria-hidden="true" />
          {selectedCoinTotal}/4 Coin · {selectedMenus.length}개 항목 선택
        </div>
        <div class="selected-items-mobile">{selectedItemsText}</div>
      </div>
      <button type="button" class="toolbar-button" onclick={() => { showSelectionDetail = true }}>영양성분 보기</button>
    </div>
  </div>
{/if}

{#if enableSelection && selectedMenus.length > 0 && !selectionFloatDismissed}
  <aside class="aggregated-nutrition-float">
    <div class="float-header">
      <h3 class="float-title">
        <BarChart3 class="float-title-icon" aria-hidden="true" />
        선택된 {selectedMenus.length}개 항목
      </h3>
      <button type="button" class="float-close" onclick={() => { selectionFloatDismissed = true }} aria-label="요약 닫기">
        <X class="float-close-icon" aria-hidden="true" />
      </button>
    </div>
    <div class="float-content">
      <div class="selected-items-count">{selectedItemsText}</div>

      <div class="coin-total" class:coin-over={selectedCoinTotal > 4}>
        <span class="coin-total-main">
          <Coins class="coin-icon" aria-hidden="true" />
          {selectedCoinTotal}/4
        </span>
        {#if selectedCoinTotal > 4}
          <span class="coin-warning">
            <TriangleAlert class="warning-icon" aria-hidden="true" />
            초과
          </span>
        {/if}
      </div>

      <div class="nutrition-summary">
        <div class="nutrition-item calorie-item">
          <div class="nutrition-label">칼로리</div>
          <div class="nutrition-value calorie-value">{formatMetric(selectedNutrition.calories, ' kcal')}</div>
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
        <h3>
          <BarChart3 class="float-title-icon" aria-hidden="true" />
          선택된 {selectedMenus.length}개 항목 통합 영양성분
        </h3>
        <button type="button" class="float-close" onclick={() => { showSelectionDetail = false }} aria-label="상세 닫기">
          <X class="float-close-icon" aria-hidden="true" />
        </button>
      </div>

      <div class="modal-coin-panel" role="group" aria-label="선택 코인 합계">
        <span class="modal-coin-label">포장 코인 합계</span>
        <div class="coin-total modal-coin-total" class:coin-over={selectedCoinTotal > 4}>
          <span class="coin-total-main">
            <Coins class="coin-icon" aria-hidden="true" />
            {selectedCoinTotal}/4 Coin
          </span>
          {#if selectedCoinTotal > 4}
            <span class="modal-coin-warning">
              <TriangleAlert class="warning-icon" aria-hidden="true" />
              초과
            </span>
          {/if}
        </div>
      </div>

      <div class="selection-total-grid">
        <div class="selection-total-card calorie-card">
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
                <td data-label="칼로리">{formatMetric(menu.nutrition?.calories, ' kcal')}</td>
                <td data-label="탄수화물">{formatMetric(menu.nutrition?.carbohydrates, 'g')}</td>
                <td data-label="당분">{formatMetric(menu.nutrition?.sugar, 'g')}</td>
                <td data-label="지방">{formatMetric(menu.nutrition?.fat, 'g')}</td>
                <td data-label="단백질">{formatMetric(menu.nutrition?.protein, 'g')}</td>
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
  .table-wrap { overflow-x: auto; }
  .menu-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .menu-table thead tr { background: var(--surface); border-bottom: 2px solid var(--border); }
  .menu-table th { padding: 9px 12px; text-align: left; font-weight: 600; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
  .meal-time-row th {
    padding: 0;
    background: #f8fafc;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    color: var(--text);
    font-size: 12px;
    letter-spacing: 0;
    text-transform: none;
  }
  .meal-time-toggle {
    width: 100%;
    padding: 10px 14px;
    border: 0;
    background: transparent;
    color: inherit;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    text-align: left;
  }
  .meal-time-toggle:hover { background: var(--surface-hover); }
  :global(.meal-time-caret) {
    width: 14px;
    height: 14px;
    color: var(--text-dim);
    flex-shrink: 0;
  }
  .meal-time-title { font-weight: 700; }
  .meal-time-count { color: var(--text-dim); font-weight: 600; }
  .selection-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--surface); flex-wrap: wrap; }
  .selection-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .selection-count { font-size: 12px; font-weight: 700; color: var(--text); }
  .selection-actions { display: flex; gap: 6px; }
  .selection-btn { padding: 5px 12px; border: 1px solid var(--border); border-radius: 20px; background: var(--bg); color: var(--text-muted); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.12s; }
  .selection-btn:hover { border-color: #94a3b8; color: var(--text); }
  .mobile-nutrition-toolbar { display: none; }
  .aggregated-nutrition-float {
    position: fixed;
    right: 20px;
    bottom: 20px;
    width: min(340px, calc(100vw - 32px));
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow-lg), 0 0 0 1px rgba(15,23,42,0.04);
    z-index: 40;
  }
  .float-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    border-radius: 14px 14px 0 0;
  }
  .float-title { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--text); }
  :global(.float-title-icon) { width: 15px; height: 15px; color: #059669; flex-shrink: 0; }
  .float-close {
    background: none;
    border: 0;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    color: var(--text-dim);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  :global(.float-close-icon) { width: 16px; height: 16px; }
  .float-close:hover { background: var(--surface-hover); color: var(--text); }
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
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .coin-total-main,
  .coin-warning,
  .modal-coin-warning {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
  }
  :global(.coin-icon) { width: 16px; height: 16px; flex-shrink: 0; }
  :global(.warning-icon) { width: 15px; height: 15px; flex-shrink: 0; }
  .coin-over {
    background: #fee2e2;
    color: #dc2626;
  }
  .modal-coin-panel {
    margin: 16px 18px 0;
    padding: 12px;
    border: 1px solid #fde68a;
    border-radius: 12px;
    background: linear-gradient(180deg, #fffbeb 0%, #fff7ed 100%);
  }
  .modal-coin-label {
    display: block;
    margin-bottom: 6px;
    color: #92400e;
    font-size: 12px;
    font-weight: 700;
  }
  .modal-coin-total {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 0;
    font-size: 18px;
  }
  .modal-coin-warning { white-space: nowrap; }
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
    font-family: var(--font-sans);
  }
  .calorie-item { grid-column: span 2; }
  .calorie-value { color: #16a34a; font-size: 16px; }
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
  .selection-modal-head h3 { display: inline-flex; align-items: center; gap: 7px; font-size: 18px; font-weight: 700; color: var(--text); }
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
    font-family: var(--font-sans);
    color: var(--text);
  }
  .calorie-card .selection-total-value { color: #16a34a; }
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
  .sort-btn { width: 100%; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; transition: color 0.1s; }
  .sort-btn:hover { color: var(--text); }
  .sort-btn-right { text-align: right; }

  .col-check { width: 40px; text-align: center; }
  .col-img { width: 60px; padding: 0 8px; }
  .col-rest { width: 90px; }
  .col-name { min-width: 140px; }
  .col-num { width: 90px; text-align: right; font-family: var(--font-sans); }

  .menu-row { border-bottom: 1px solid var(--border); transition: background 0.1s; }
  .menu-row.selected { background: #f0fdf4; }
  .menu-row.clickable { cursor: pointer; }
  .menu-row.clickable:not(.selected):hover { background: var(--surface-hover); }
  .menu-row.expanded { background: var(--surface); border-bottom-color: transparent; }
  .menu-row td { padding: 10px 12px; vertical-align: middle; }
  .menu-row .col-img { padding: 6px 8px; }

  .thumb { width: 52px; height: 52px; object-fit: cover; border-radius: 6px; display: block; }
  .thumb-btn { display: block; padding: 0; border: 0; background: transparent; border-radius: 6px; }
  .thumb-placeholder { width: 52px; height: 52px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); }

  .rest-tag { font-size: 11px; color: var(--text-dim); }
  .rest-tag-mobile { display: none; margin-bottom: 4px; }
  .menu-parent { display: block; font-size: 11px; color: var(--text-dim); margin-bottom: 4px; }
  .menu-name { font-weight: 500; color: var(--text); line-height: 1.4; }
  .menu-desc { display: block; font-size: 11px; color: var(--text-dim); margin-top: 3px; line-height: 1.5; }
  .menu-desc-unavailable { font-style: italic; }
  .badge { display: inline-block; font-size: 9px; padding: 1px 5px; border-radius: 3px; background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); font-family: var(--font-sans); letter-spacing: 0.5px; margin-left: 6px; vertical-align: middle; }
  .detail-toggle-btn {
    display: inline-flex;
    align-items: center;
    margin-left: 6px;
    padding: 2px 7px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    vertical-align: middle;
  }
  .detail-toggle-btn:hover { border-color: #94a3b8; color: var(--text); background: var(--surface-hover); }

  .detail-row td { padding: 0 12px 14px 76px; background: var(--surface); border-bottom: 1px solid var(--border); }
  .detail-table-wrap { overflow-x: auto; }
  .detail-table { width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 12px; }
  .detail-table thead tr { border-bottom: 1px solid var(--border); }
  .detail-table th { padding: 7px 8px; text-align: left; font-weight: 600; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; }
  .detail-table td { padding: 8px 8px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .detail-table tbody tr:last-child td { border-bottom: none; }
  .detail-col-name { min-width: 220px; }
  .detail-col-num { width: 88px; text-align: right; font-family: var(--font-sans); white-space: nowrap; }
  .dish-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .dish-table tr { border-bottom: 1px solid var(--border); }
  .dish-table tr:last-child { border-bottom: none; }
  .dish-table td { padding: 5px 8px 5px 0; font-size: 12px; }
  .dish-name { color: var(--text-muted); }
  .dish-num { text-align: right; font-family: var(--font-sans); font-size: 11px; color: var(--text-dim); white-space: nowrap; padding-left: 16px; }
  .detail-loading { padding: 12px 0; }
  .detail-empty { font-size: 12px; color: var(--text-dim); font-style: italic; padding: 8px 0; }

  .shimmer { background: linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 50%, var(--surface) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .empty-state { text-align: center; padding: 48px 20px; color: var(--text-dim); font-size: 13px; }

  @media (max-width: 640px) {
    .hide-sm { display: none; }
    .rest-tag-mobile { display: block; }
    .detail-row td { padding-left: 12px; }

    .table-wrap.selection-mode { overflow-x: visible; }
    .menu-table.selection-mode,
    .menu-table.selection-mode thead,
    .menu-table.selection-mode tbody { display: block; }
    .menu-table.selection-mode thead tr {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0 0 10px;
      background: transparent;
      border-bottom: 0;
    }
    .menu-table.selection-mode th {
      display: block;
      width: auto;
      padding: 0;
    }
    .menu-table.selection-mode th.col-check,
    .menu-table.selection-mode th.col-img,
    .menu-table.selection-mode th.hide-sm { display: none; }
    .menu-table.selection-mode th .sort-btn {
      width: auto;
      padding: 5px 10px;
      border: 1px solid var(--border);
      border-radius: 20px;
      background: var(--surface);
      color: var(--text-muted);
      font-size: 10px;
      text-align: left;
    }
    .menu-table.selection-mode .menu-row {
      display: grid;
      grid-template-columns: auto repeat(3, minmax(0, 1fr));
      gap: 8px 10px;
      margin-bottom: 8px;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--bg);
      cursor: pointer;
    }
    .menu-table.selection-mode .menu-row.selected { background: #f0fdf4; border-color: #bbf7d0; }
    .menu-table.selection-mode .menu-row.expanded { margin-bottom: 0; border-radius: 12px 12px 0 0; }
    .menu-table.selection-mode .menu-row td {
      display: block;
      padding: 0;
      border: 0;
    }
    .menu-table.selection-mode .menu-row .col-check {
      grid-column: 1;
      grid-row: 1 / 4;
      width: auto;
      padding-top: 2px;
    }
    .menu-table.selection-mode .menu-row .col-check input {
      width: 20px;
      height: 20px;
      accent-color: #10b981;
    }
    .menu-table.selection-mode .menu-row .col-img { display: none; }
    .menu-table.selection-mode .menu-row .col-rest {
      grid-column: 2 / -1;
      grid-row: 1;
      width: auto;
    }
    .menu-table.selection-mode .menu-row .col-name {
      grid-column: 2 / -1;
      grid-row: 2;
      min-width: 0;
    }
    .menu-table.selection-mode .menu-row .col-num {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      grid-column: auto;
      grid-row: 3;
      width: auto;
      min-width: 0;
      padding: 3px 8px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface);
      color: var(--text-muted);
      font-family: var(--font-sans);
      font-size: 10px;
      line-height: 1.2;
      white-space: nowrap;
    }
    .menu-table.selection-mode .menu-row .col-num.hide-sm { display: none; }
    .menu-table.selection-mode .menu-row .col-num::before {
      content: attr(data-label);
      color: var(--text-dim);
      font-family: var(--font-sans);
    }
    .menu-table.selection-mode .detail-row {
      display: block;
      margin: 0 0 10px;
      border: 1px solid var(--border);
      border-top: 0;
      border-radius: 0 0 12px 12px;
      background: var(--surface);
    }
    .menu-table.selection-mode .detail-row > td {
      display: block;
      padding: 12px;
      border-bottom: 0;
      background: transparent;
    }
    .menu-table.selection-mode .detail-table-wrap { overflow-x: visible; }
    .menu-table.selection-mode .detail-table,
    .menu-table.selection-mode .detail-table tbody,
    .menu-table.selection-mode .detail-table tr { display: block; }
    .menu-table.selection-mode .detail-table thead { display: none; }
    .menu-table.selection-mode .detail-table tr {
      margin-bottom: 8px;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--bg);
    }
    .menu-table.selection-mode .detail-table tr:last-child { margin-bottom: 0; }
    .menu-table.selection-mode .detail-table td {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 4px 0;
      border-bottom: 0;
    }
    .menu-table.selection-mode .detail-table td::before {
      content: attr(data-label);
      color: var(--text-dim);
      font-family: var(--font-sans);
      font-size: 11px;
    }
    .menu-table.selection-mode .detail-table .detail-col-name {
      display: block;
      min-width: 0;
      padding-bottom: 8px;
      font-weight: 600;
    }
    .menu-table.selection-mode .detail-table .detail-col-name::before { display: none; }
    .menu-table.selection-mode .detail-col-num {
      width: auto;
      text-align: right;
    }

    .selection-bar { padding-top: 0; }
    .selection-actions { width: 100%; }
    .selection-btn { flex: 1; }
    .aggregated-nutrition-float { display: none; }
    .mobile-nutrition-toolbar {
      display: block;
      position: fixed;
      left: 0;
      right: 0;
      bottom: calc(62px + env(safe-area-inset-bottom, 0px));
      z-index: 45;
      background: #fff;
      border-top: 1px solid var(--border);
      box-shadow: 0 -8px 20px rgba(15, 23, 42, 0.15);
      padding: 12px 16px;
    }
    .toolbar-content { display: flex; align-items: center; gap: 12px; }
    .selected-info { min-width: 0; flex: 1; }
    .selected-count-mobile { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 2px; }
    :global(.inline-icon) { width: 15px; height: 15px; color: #059669; flex-shrink: 0; }
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
    .modal-coin-panel {
      margin: 12px 16px 0;
      padding: 14px;
      box-shadow: 0 8px 18px rgba(146, 64, 14, 0.12);
    }
    .modal-coin-label { font-size: 13px; }
    .modal-coin-total {
      padding: 12px 14px;
      font-size: 20px;
    }
    .selection-total-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .selection-detail-wrap { overflow-x: visible; padding-bottom: 90px; }
    .selection-detail-table,
    .selection-detail-table tbody,
    .selection-detail-table tr { display: block; }
    .selection-detail-table thead { display: none; }
    .selection-detail-table tr {
      margin-bottom: 10px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
    }
    .selection-detail-table tr:last-child { margin-bottom: 0; }
    .selection-detail-table td {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 5px 0;
      border: 0;
      text-align: right;
    }
    .selection-detail-table td:first-child {
      display: block;
      padding-bottom: 8px;
      text-align: left;
    }
    .selection-detail-table td:not(:first-child)::before {
      content: attr(data-label);
      color: var(--text-dim);
      font-size: 11px;
    }
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
