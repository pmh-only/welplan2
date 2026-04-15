<script lang="ts">
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import MenuTable from '$lib/components/MenuTable.svelte'
  import type { MealTime, Menu, MenuComponent, NutritionInfo, Restaurant } from '$lib/types'
  import { toInputDate, fromInputDate, formatKoreanDate, shiftDate } from '$lib/utils'

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
  let viewMode = $state<'scroll' | 'card'>('scroll')

  const pageLabel = $derived(kind === 'takeout' ? '테이크 아웃' : '테이크 인')

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
    <div class="empty-icon">🏪</div>
    <p class="empty-title">식당이 없습니다</p>
    <p class="empty-sub"><a href="/restaurants">식당 설정</a>에서 식당을 추가하면 메뉴가 표시됩니다</p>
  </div>
{:else}
  <div class="section">
    <div class="controls-row">
      <div class="form-group">
        <label for="date-input">날짜</label>
        <div class="date-row">
          <button class="date-nav-btn" onclick={() => navigate(shiftDate(data.date, -1), data.time)} aria-label="이전 날">‹</button>
          <input
            id="date-input"
            class="date-input"
            type="date"
            value={toInputDate(data.date)}
            oninput={(e) => navigate(fromInputDate(e.currentTarget.value), data.time)}
          />
          <button class="date-nav-btn" onclick={() => navigate(shiftDate(data.date, 1), data.time)} aria-label="다음 날">›</button>
        </div>
      </div>
      <div class="form-group">
        <label for="meal-time-select">식사 시간</label>
        <select
          id="meal-time-select"
          class="select-input"
          value={data.time}
          onchange={(e) => navigate(data.date, e.currentTarget.value)}
        >
          {#each data.mealTimes as mealTime (mealTime.id)}
            <option value={mealTime.id}>{mealTime.name}</option>
          {/each}
        </select>
      </div>
      <div class="date-label">{formatKoreanDate(data.date)}</div>
    </div>

    <div class="filter-row">
      {#if kind === 'takein'}
        <div class="chip-group">
          <button
            type="button"
            class="chip"
            class:chip-active={takeInFilterMainOnly}
            onclick={() => { takeInFilterMainOnly = !takeInFilterMainOnly }}
          >
            메인 메뉴만
          </button>
          <button
            type="button"
            class="chip"
            class:chip-active={takeInFilterExcludeOptional}
            onclick={() => { takeInFilterExcludeOptional = !takeInFilterExcludeOptional }}
          >
            추가찬 제외
          </button>
        </div>
      {:else if kind === 'takeout'}
        <div class="form-group takeout-restaurant-group">
          <label for="takeout-restaurant-select">식당</label>
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
            onclick={() => { takeOutFilterDrinks = !takeOutFilterDrinks }}
          >
            음료수 제외
          </button>
        </div>
      {/if}

      <div class="view-toggle" title="화면 레이아웃">
        <button
          type="button"
          class="view-btn"
          class:view-btn-active={viewMode === 'scroll'}
          onclick={() => { viewMode = 'scroll' }}
          aria-label="테이블 보기"
        >
          ☰ 테이블
        </button>
        <button
          type="button"
          class="view-btn"
          class:view-btn-active={viewMode === 'card'}
          onclick={() => { viewMode = 'card' }}
          aria-label="카드 보기"
        >
          ⊞ 카드
        </button>
      </div>
    </div>
  </div>

  <div class="section no-padding">
    <div class="section-head">
      <div class="section-head-left">
        <h2>{pageLabel}</h2>
        {#if visibleMenus.length > 0}
          <span class="menu-count">{visibleMenus.length}개 · {data.restaurants.length}개 식당</span>
        {/if}
      </div>
    </div>

    <MenuTable
      menus={visibleMenus}
      restaurants={data.restaurants}
      date={data.date}
      time={data.time}
      emptyMessage={`${pageLabel} 메뉴가 없습니다`}
      preferInlineComponents={kind === 'takein'}
      enableSelection={kind === 'takeout'}
      viewMode={viewMode}
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
  .empty-icon { font-size: 2.5rem; margin-bottom: 12px; }
  .empty-title { font-size: 1rem; font-weight: 600; color: var(--text); margin-bottom: 6px; }
  .empty-sub { font-size: 13px; color: var(--text-muted); }
  .empty-sub a { color: var(--accent); text-decoration: none; }
  .empty-sub a:hover { text-decoration: underline; }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--border);
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

  .controls-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .chip-group { display: flex; gap: 6px; flex-wrap: wrap; flex: 1; }
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

  .view-toggle {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    flex-shrink: 0;
  }
  .view-btn {
    padding: 5px 11px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    background: var(--bg);
    border: none;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
  }
  .view-btn:first-child { border-right: 1px solid var(--border); }
  .view-btn:hover { background: var(--surface); color: var(--text); }
  .view-btn-active { background: var(--surface-hover); color: var(--text); font-weight: 600; }

  .takeout-restaurant-group { min-width: min(100%, 260px); }

  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .form-group label { font-size: 11px; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.4px; }
  .date-row { display: flex; align-items: center; gap: 4px; }

  .date-nav-btn {
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text-muted);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    transition: all 0.12s;
  }
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

  .date-label { font-size: 12px; color: var(--text-dim); align-self: flex-end; padding-bottom: 1px; }

  @media (max-width: 640px) {
    .filter-row { gap: 8px; }
    .view-toggle { margin-left: auto; }
  }
</style>
