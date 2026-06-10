<script lang="ts">
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { trackEvent } from '$lib/analytics'
  import MenuTable from '$lib/components/MenuTable.svelte'
  import type { MealTime, Menu, MenuComponent, NutritionInfo, Restaurant } from '$lib/types'
  import { ALL_MEAL_TIME_ID, fallbackMealTime, toInputDate, fromInputDate, formatKoreanDate, shiftDate } from '$lib/utils'
  import { Check, ChevronLeft, ChevronRight, Search, Store } from '@lucide/svelte'

  const LS_TAKEOUT_RESTAURANT = 'welplan_takeout_restaurant'

  type MenuPageData = {
    restaurants: Restaurant[]
    mealTimes: MealTime[]
    menus: Menu[]
    date: string
    time: string
  }

  let {
    data,
    kind
  }: {
    data: MenuPageData
    kind: 'takein' | 'takeout'
  } = $props()

  let takeInFilterMainOnly = $state(false)
  let takeInFilterExcludeOptional = $state(true)
  let selectedTakeInRestaurantId = $state('')
  let selectedTakeoutRestaurantId = $state('')
  let takeOutFilterDrinks = $state(true)
  let takeOutSearch = $state('')
  let menuSort = $state('calories-asc')

  const pageLabel = $derived(kind === 'takeout' ? '테이크 아웃' : '테이크 인')
  const isAllMealTime = $derived(kind === 'takein' && data.time === ALL_MEAL_TIME_ID)

  function isOptionalComponent(component: MenuComponent): boolean {
    return component.name.includes('추가찬') || component.name.includes('택1')
  }

  function hasDetailedComponents(menu: Menu): boolean {
    return menu.components.some((component) => component.nutrition)
  }

  function componentIsMain(component: MenuComponent): boolean | undefined {
    return (component as MenuComponent & { isMain?: boolean }).isMain
  }

  function sumNutrition(components: MenuComponent[]): NutritionInfo | undefined {
    const withNutrition = components.filter((component) => component.nutrition)
    if (withNutrition.length === 0) return undefined

    return withNutrition.reduce<NutritionInfo>((totals, component) => ({
      calories: (totals.calories ?? 0) + (component.nutrition?.calories ?? 0),
      carbohydrates: (totals.carbohydrates ?? 0) + (component.nutrition?.carbohydrates ?? 0),
      sugar: (totals.sugar ?? 0) + (component.nutrition?.sugar ?? 0),
      fiber: (totals.fiber ?? 0) + (component.nutrition?.fiber ?? 0),
      fat: (totals.fat ?? 0) + (component.nutrition?.fat ?? 0),
      protein: (totals.protein ?? 0) + (component.nutrition?.protein ?? 0),
      sodium: (totals.sodium ?? 0) + (component.nutrition?.sodium ?? 0),
      cholesterol: (totals.cholesterol ?? 0) + (component.nutrition?.cholesterol ?? 0),
      transFat: (totals.transFat ?? 0) + (component.nutrition?.transFat ?? 0),
      saturatedFat: (totals.saturatedFat ?? 0) + (component.nutrition?.saturatedFat ?? 0),
      calcium: (totals.calcium ?? 0) + (component.nutrition?.calcium ?? 0)
    }), {})
  }

  function isDrinkMenu(menu: Menu): boolean {
    const parentName = (menu as Menu & { parentName?: string }).parentName
    const text = `${parentName ?? ''} ${menu.name}`
    return text.includes('음료') || text.includes('드링킹') || text.includes('음료 Zone')
  }

  function matchesTakeOutSearch(menu: Menu): boolean {
    const query = takeOutSearch.trim().toLocaleLowerCase()
    if (!query) return true
    return menu.name.toLocaleLowerCase().includes(query)
  }

  function menuDedupeKey(menu: Menu): string {
    const parentName = (menu as Menu & { parentName?: string }).parentName ?? ''
    const componentNames = menu.components.map((component) => component.name).join('|')
    return [
      menu.restaurantId,
      menu.mealTimeId,
      menu.name,
      parentName,
      componentNames,
      menu.nutrition?.calories ?? '',
      menu.nutrition?.carbohydrates ?? '',
      menu.nutrition?.sugar ?? '',
      menu.nutrition?.fat ?? '',
      menu.nutrition?.protein ?? '',
      menu.nutrition?.sodium ?? ''
    ].join('\u001f')
  }

  function dedupeMenus(menus: Menu[]): Menu[] {
    const seen = new Set<string>()
    return menus.filter((menu) => {
      const key = menuDedupeKey(menu)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  function menuSortKey (): 'restaurant' | 'name' | 'calories' {
    if (menuSort.startsWith('restaurant')) return 'restaurant'
    return menuSort.startsWith('name') ? 'name' : 'calories'
  }

  function menuSortDirection (): 'asc' | 'desc' {
    return menuSort.endsWith('desc') ? 'desc' : 'asc'
  }

  function filterTakeInComponents(menu: Menu): MenuComponent[] {
    if (!hasDetailedComponents(menu)) return menu.components

    let components: MenuComponent[] = menu.components

    if (takeInFilterMainOnly && components.some((component) => componentIsMain(component) != null)) {
      components = components.filter((component) => componentIsMain(component) === true)
    }

    if (takeInFilterExcludeOptional) {
      components = components.filter((component) => !isOptionalComponent(component))
    }

    return components
  }

  const takeOutRestaurants = $derived(
    data.restaurants.filter((restaurant: Restaurant) =>
      data.menus.some((menu: Menu) => menu.isTakeOut && menu.restaurantId === restaurant.id)
    )
  )
  const takeInRestaurants = $derived(
    data.restaurants.filter((restaurant: Restaurant) =>
      data.menus.some((menu: Menu) =>
        !menu.isTakeOut &&
        menu.restaurantId === restaurant.id &&
        (menu.vendor === 'shinsegae' || (menu.nutrition?.calories ?? 1) !== 0)
      )
    )
  )
  const takeInRestaurantOptions = $derived.by<Restaurant[]>(() => {
    if (!selectedTakeInRestaurantId || takeInRestaurants.some((restaurant: Restaurant) => restaurant.id === selectedTakeInRestaurantId)) return takeInRestaurants
    const selectedRestaurant = data.restaurants.find((restaurant: Restaurant) => restaurant.id === selectedTakeInRestaurantId)
    return selectedRestaurant ? [selectedRestaurant, ...takeInRestaurants] : takeInRestaurants
  })

  $effect(() => {
    if (kind !== 'takein') return
    const restaurantId = page.url.searchParams.get('restaurant') ?? ''
    if (selectedTakeInRestaurantId !== restaurantId) selectedTakeInRestaurantId = restaurantId
  })

  $effect(() => {
    if (!browser || kind !== 'takeout') return

    const availableIds = new Set(takeOutRestaurants.map((restaurant: Restaurant) => restaurant.id))
    if (!selectedTakeoutRestaurantId) {
      const saved = localStorage.getItem(LS_TAKEOUT_RESTAURANT)
      if (saved && availableIds.has(saved)) {
        selectedTakeoutRestaurantId = saved
        return
      }
    }

    if (!availableIds.has(selectedTakeoutRestaurantId)) {
      selectedTakeoutRestaurantId = takeOutRestaurants[0]?.id ?? ''
    }
  })

  $effect(() => {
    if (!browser || kind !== 'takeout' || !selectedTakeoutRestaurantId) return
    localStorage.setItem(LS_TAKEOUT_RESTAURANT, selectedTakeoutRestaurantId)
  })

  const visibleMenus = $derived(
    dedupeMenus(data.menus
      .filter((menu: Menu) => kind === 'takeout' ? menu.isTakeOut : !menu.isTakeOut)
      .filter((menu: Menu) => kind !== 'takein' || !selectedTakeInRestaurantId || menu.restaurantId === selectedTakeInRestaurantId)
      .filter((menu: Menu) => kind !== 'takeout' || !selectedTakeoutRestaurantId || menu.restaurantId === selectedTakeoutRestaurantId)
      .filter((menu: Menu) => kind !== 'takeout' || !takeOutFilterDrinks || !isDrinkMenu(menu))
      .filter((menu: Menu) => kind !== 'takeout' || matchesTakeOutSearch(menu))
      .filter((menu: Menu) => menu.vendor === 'shinsegae' || (menu.nutrition?.calories ?? 1) !== 0)
      .map((menu: Menu) => {
        if (kind !== 'takein') return menu

        const components = filterTakeInComponents(menu)
        return {
          ...menu,
          components,
          nutrition: sumNutrition(components) ?? menu.nutrition
        }
      })
    )
  )
  const visibleMealTimes = $derived.by<MealTime[]>(() => {
    const ids = [
      ...data.mealTimes.map((mealTime: MealTime) => mealTime.id),
      ...visibleMenus.map((menu: Menu) => menu.mealTimeId)
    ]

    return [...new Set(ids)].map((id) => data.mealTimes.find((mealTime: MealTime) => mealTime.id === id) ?? fallbackMealTime(id))
  })

  function takeInRestaurantQuery (restaurantId = selectedTakeInRestaurantId): string {
    if (kind !== 'takein' || !restaurantId) return ''
    return `?${new URLSearchParams({ restaurant: restaurantId })}`
  }

  function routeFor (date: string, time: string, restaurantId = selectedTakeInRestaurantId): string {
    return `/${kind}/${date}/${time}${takeInRestaurantQuery(restaurantId)}`
  }

  function navigate (date: string, time: string, source: string) {
    trackEvent('Menu Navigation Changed', { kind, date, mealTimeId: time, source })
    goto(routeFor(date, time))
  }

  function toggleTakeInMainOnly () {
    takeInFilterMainOnly = !takeInFilterMainOnly
    trackEvent('Menu Filter Changed', { kind, filter: 'main_only', enabled: takeInFilterMainOnly ? 1 : 0 })
  }

  function toggleTakeInExcludeOptional () {
    takeInFilterExcludeOptional = !takeInFilterExcludeOptional
    trackEvent('Menu Filter Changed', { kind, filter: 'exclude_optional', enabled: takeInFilterExcludeOptional ? 1 : 0 })
  }

  function selectTakeInRestaurant (restaurantId: string) {
    selectedTakeInRestaurantId = restaurantId
    trackEvent('Menu Filter Changed', { kind, filter: 'restaurant', restaurantId: restaurantId || 'all' })
    goto(routeFor(data.date, data.time, restaurantId), { replaceState: true, noScroll: true, keepFocus: true })
  }

  function toggleTakeOutDrinks () {
    takeOutFilterDrinks = !takeOutFilterDrinks
    trackEvent('Menu Filter Changed', { kind, filter: 'exclude_drinks', enabled: takeOutFilterDrinks ? 1 : 0 })
  }
</script>

{#if data.restaurants.length === 0}
  <div class="empty-page">
    <div class="empty-icon" aria-hidden="true">
      <Store />
    </div>
    <p class="empty-title">식당이 없습니다</p>
    <p class="empty-sub"><a href="/restaurants">식당 선택</a>에서 식당을 추가하면 메뉴가 표시됩니다</p>
  </div>
{:else}
  <div class="section no-padding">
    <div class="section-head">
      <div class="section-head-left">
        <h2>{pageLabel}</h2>
        {#if visibleMenus.length > 0}
          <span class="menu-count">{visibleMenus.length}개</span>
        {/if}
      </div>
      <div class="controls-row">
        <div class="form-group">
          <div class="date-row">
            <button class="date-nav-btn" onclick={() => navigate(shiftDate(data.date, -1), data.time, 'previous_day')} aria-label="이전 날">
              <ChevronLeft class="date-nav-icon" aria-hidden="true" />
            </button>
            <input
              id="date-input"
              class="date-input"
              type="date"
              value={toInputDate(data.date)}
              oninput={(e) => navigate(fromInputDate(e.currentTarget.value), data.time, 'date_input')}
            />
            <button class="date-nav-btn" onclick={() => navigate(shiftDate(data.date, 1), data.time, 'next_day')} aria-label="다음 날">
              <ChevronRight class="date-nav-icon" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div class="form-group">
          <select
            id="meal-time-select"
            class="select-input"
            value={data.time}
            onchange={(e) => navigate(data.date, e.currentTarget.value, 'meal_time_select')}
          >
            {#if kind === 'takein'}
              <option value={ALL_MEAL_TIME_ID}>전체</option>
            {/if}
            {#each visibleMealTimes as mealTime (mealTime.id)}
              <option value={mealTime.id}>{mealTime.name}</option>
            {/each}
          </select>
        </div>
        {#if kind === 'takein'}
          <div class="form-group takein-restaurant-group">
            <select
              id="takein-restaurant-select"
              class="select-input"
              value={selectedTakeInRestaurantId}
              aria-label="식당 필터"
              onchange={(e) => selectTakeInRestaurant(e.currentTarget.value)}
            >
              <option value="">전체 식당</option>
              {#each takeInRestaurantOptions as restaurant (restaurant.id)}
                <option value={restaurant.id}>{restaurant.name}</option>
              {/each}
            </select>
          </div>
          <div class="chip-group">
            <button
              type="button"
              class="chip"
              class:chip-active={takeInFilterMainOnly}
              aria-pressed={takeInFilterMainOnly}
              onclick={toggleTakeInMainOnly}
            >
              <span class="chip-checkbox" aria-hidden="true">
                {#if takeInFilterMainOnly}<Check class="chip-check-icon" />{/if}
              </span>
              메인 메뉴만
            </button>
            <button
              type="button"
              class="chip"
              class:chip-active={takeInFilterExcludeOptional}
              aria-pressed={takeInFilterExcludeOptional}
              onclick={toggleTakeInExcludeOptional}
            >
              <span class="chip-checkbox" aria-hidden="true">
                {#if takeInFilterExcludeOptional}<Check class="chip-check-icon" />{/if}
              </span>
              추가찬 제외
            </button>
          </div>
        {:else if kind === 'takeout'}
          <div class="form-group takeout-restaurant-group">
            <select id="takeout-restaurant-select" class="select-input" bind:value={selectedTakeoutRestaurantId}>
              {#each takeOutRestaurants as restaurant (restaurant.id)}
                <option value={restaurant.id}>{restaurant.name}</option>
              {/each}
            </select>
          </div>
          <div class="search-field">
            <Search class="search-icon" aria-hidden="true" />
            <input
              class="search-input"
              type="search"
              placeholder="메뉴 검색"
              aria-label="테이크아웃 메뉴 검색"
              bind:value={takeOutSearch}
            />
          </div>
          <div class="chip-group">
            <button
              type="button"
              class="chip"
              class:chip-active={takeOutFilterDrinks}
              aria-pressed={takeOutFilterDrinks}
              onclick={toggleTakeOutDrinks}
            >
              <span class="chip-checkbox" aria-hidden="true">
                {#if takeOutFilterDrinks}<Check class="chip-check-icon" />{/if}
              </span>
              음료수 제외
            </button>
          </div>
        {/if}
        <select class="sort-select" bind:value={menuSort} aria-label="정렬 기준" onchange={() => trackEvent('Menu Sort Changed', { kind, sort: menuSort })}>
          <option value="calories-asc">칼로리 낮은순</option>
          <option value="calories-desc">칼로리 높은순</option>
          <option value="name-asc">메뉴명 A-Z</option>
          <option value="name-desc">메뉴명 Z-A</option>
          {#if kind === 'takein'}
            <option value="restaurant-asc">식당명 A-Z</option>
          {/if}
        </select>
      </div>
    </div>

    <MenuTable
      menus={visibleMenus}
      restaurants={data.restaurants}
      mealTimes={visibleMealTimes}
      date={data.date}
      time={data.time}
      emptyMessage={`${pageLabel} 메뉴가 없습니다`}
      preferInlineComponents={kind === 'takein'}
      enableSelection={kind === 'takeout'}
      groupByMealTime={isAllMealTime}
      hideRestaurantLabels={kind === 'takeout'}
      sortKey={menuSortKey()}
      sortDirection={menuSortDirection()}
    />
  </div>
{/if}

<style>
  .section {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    margin-bottom: 14px;
    box-shadow: var(--shadow-sm);
  }
  .section.no-padding { padding: 0; }

  .empty-page {
    text-align: center;
    padding: 64px 24px;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
  }
  .empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; margin-bottom: 12px; border-radius: 999px; background: rgba(16, 185, 129, 0.12); color: #059669; }
  .empty-icon :global(svg) { width: 26px; height: 26px; }
  .empty-title { font-size: 1rem; font-weight: 600; color: var(--text); margin-bottom: 6px; }
  .empty-sub { font-size: 13px; color: var(--text-muted); }
  .empty-sub a { color: var(--accent); text-decoration: none; }
  .empty-sub a:hover { text-decoration: underline; }

  .section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
    gap: 10px;
  }
  .section-head-left { display: flex; align-items: center; gap: 10px; }
  .section-head h2 {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    padding-left: 10px;
    border-left: 3px solid var(--green);
  }
  .menu-count { font-size: 12px; color: var(--text-dim); background: var(--surface); padding: 2px 8px; border-radius: 20px; border: 1px solid var(--border); }

  .controls-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; width: 100%; }

  .chip-group { display: flex; gap: 6px; flex-wrap: wrap; flex: 1; }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
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
  .chip-checkbox {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    border: 1px solid #cbd5e1;
    border-radius: 3px;
    background: #fff;
    color: #047857;
    line-height: 1;
    flex-shrink: 0;
  }
  :global(.chip-check-icon) { width: 11px; height: 11px; }
  .chip-active .chip-checkbox {
    border-color: var(--green);
    background: #dcfce7;
  }
  .chip:hover { border-color: var(--green); color: #059669; background: #f0fdf4; }
  .chip-active { border-color: var(--green); color: #059669; background: #f0fdf4; font-weight: 600; }

  .takein-restaurant-group,
  .takeout-restaurant-group { min-width: min(100%, 260px); }

  .search-field {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: min(100%, 220px);
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    transition: border-color 0.12s;
  }
  .search-field:focus-within { border-color: var(--border-focus); }
  :global(.search-icon) { width: 14px; height: 14px; color: var(--text-dim); flex-shrink: 0; }
  .search-input {
    width: 100%;
    min-width: 0;
    padding: 7px 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font-size: 13px;
    outline: none;
  }
  .search-input::placeholder { color: var(--text-dim); }

  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .date-row { display: flex; align-items: center; gap: 4px; }

  .date-nav-btn {
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text-muted);
    line-height: 1;
    cursor: pointer;
    transition: all 0.12s;
  }
  :global(.date-nav-icon) { width: 16px; height: 16px; }
  .date-nav-btn:hover { background: var(--surface-hover); color: var(--text); }

  .date-input {
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text);
    background: var(--bg);
    outline: none;
    transition: border-color 0.12s;
  }
  .date-input:focus { border-color: var(--border-focus); }

  .select-input,
  .sort-select {
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text);
    background: var(--bg);
    outline: none;
    min-width: 140px;
    transition: border-color 0.12s;
  }
  .select-input:focus, .sort-select:focus { border-color: var(--border-focus); }

  @media (max-width: 640px) {
    .section-head { padding: 12px; }
    .section-head-left { width: 100%; }
    .controls-row { width: 100%; gap: 6px; }
    .form-group { min-width: 0; }
    .date-row { width: 100%; }
    .date-input { flex: 1; min-width: 0; }
    .select-input { min-width: 0; }
    .sort-select { min-width: 0; }
    #meal-time-select { width: 96px; }
    .takein-restaurant-group,
    .takeout-restaurant-group { flex: 1 1 160px; min-width: 0; }
    #takein-restaurant-select,
    #takeout-restaurant-select { width: 100%; }
    .search-field { order: 10; flex: 1 0 100%; min-width: 0; }
    .chip-group { flex: 0 0 auto; }
  }
</style>
