<script lang="ts">
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import MenuTable from '$lib/components/MenuTable.svelte'
  import type { MealTime, Menu, MenuComponent, NutritionInfo, Restaurant } from '$lib/types'
  import { ALL_MEAL_TIME_ID, toInputDate, fromInputDate, formatKoreanDate, shiftDate } from '$lib/utils'
  import { Check, ChevronLeft, ChevronRight, Store } from '@lucide/svelte'

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
  let selectedTakeoutRestaurantId = $state('')
  let takeOutFilterDrinks = $state(true)

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
    data.menus
      .filter((menu: Menu) => kind === 'takeout' ? menu.isTakeOut : !menu.isTakeOut)
      .filter((menu: Menu) => kind !== 'takeout' || !selectedTakeoutRestaurantId || menu.restaurantId === selectedTakeoutRestaurantId)
      .filter((menu: Menu) => kind !== 'takeout' || !takeOutFilterDrinks || !isDrinkMenu(menu))
      .filter((menu: Menu) => (menu.nutrition?.calories ?? 1) !== 0)
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

  function routeFor (date: string, time: string): string {
    return `/${kind}/${date}/${time}`
  }

  function navigate (date: string, time: string) {
    goto(routeFor(date, time))
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
          <span class="menu-count">{visibleMenus.length}개 · {data.restaurants.length}개 식당</span>
        {/if}
      </div>
      <div class="controls-row">
        <div class="form-group">
          <div class="date-row">
            <button class="date-nav-btn" onclick={() => navigate(shiftDate(data.date, -1), data.time)} aria-label="이전 날">
              <ChevronLeft class="date-nav-icon" aria-hidden="true" />
            </button>
            <input
              id="date-input"
              class="date-input"
              type="date"
              value={toInputDate(data.date)}
              oninput={(e) => navigate(fromInputDate(e.currentTarget.value), data.time)}
            />
            <button class="date-nav-btn" onclick={() => navigate(shiftDate(data.date, 1), data.time)} aria-label="다음 날">
              <ChevronRight class="date-nav-icon" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div class="form-group">
          <select
            id="meal-time-select"
            class="select-input"
            value={data.time}
            onchange={(e) => navigate(data.date, e.currentTarget.value)}
          >
            {#if kind === 'takein'}
              <option value={ALL_MEAL_TIME_ID}>전체</option>
            {/if}
            {#each data.mealTimes as mealTime (mealTime.id)}
              <option value={mealTime.id}>{mealTime.name}</option>
            {/each}
          </select>
        </div>
        {#if kind === 'takein'}
          <div class="chip-group">
            <button
              type="button"
              class="chip"
              class:chip-active={takeInFilterMainOnly}
              aria-pressed={takeInFilterMainOnly}
              onclick={() => { takeInFilterMainOnly = !takeInFilterMainOnly }}
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
              onclick={() => { takeInFilterExcludeOptional = !takeInFilterExcludeOptional }}
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
          <div class="chip-group">
            <button
              type="button"
              class="chip"
              class:chip-active={takeOutFilterDrinks}
              aria-pressed={takeOutFilterDrinks}
              onclick={() => { takeOutFilterDrinks = !takeOutFilterDrinks }}
            >
              <span class="chip-checkbox" aria-hidden="true">
                {#if takeOutFilterDrinks}<Check class="chip-check-icon" />{/if}
              </span>
              음료수 제외
            </button>
          </div>
        {/if}
      </div>
    </div>

    <MenuTable
      menus={visibleMenus}
      restaurants={data.restaurants}
      mealTimes={data.mealTimes}
      date={data.date}
      time={data.time}
      emptyMessage={`${pageLabel} 메뉴가 없습니다`}
      preferInlineComponents={kind === 'takein'}
      enableSelection={kind === 'takeout'}
      groupByMealTime={isAllMealTime}
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

  .takeout-restaurant-group { min-width: min(100%, 260px); }

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

  .select-input {
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
  .select-input:focus { border-color: var(--border-focus); }

  @media (max-width: 640px) {
    .controls-row { width: 100%; }
  }
</style>
