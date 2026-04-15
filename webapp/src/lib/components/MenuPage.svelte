<script lang="ts">
  import { goto } from '$app/navigation'
  import MenuTable from '$lib/components/MenuTable.svelte'
  import type { MealTime, Menu, MenuComponent, NutritionInfo, Restaurant } from '$lib/types'
  import { toInputDate, fromInputDate, formatKoreanDate, shiftDate } from '$lib/utils'

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
      fat: (totals.fat ?? 0) + (component.nutrition?.fat ?? 0),
      protein: (totals.protein ?? 0) + (component.nutrition?.protein ?? 0),
      sodium: (totals.sodium ?? 0) + (component.nutrition?.sodium ?? 0),
      calcium: (totals.calcium ?? 0) + (component.nutrition?.calcium ?? 0)
    }), {})
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

  const visibleMenus = $derived(
    data.menus
      .filter((menu: Menu) => kind === 'takeout' ? menu.isTakeOut : !menu.isTakeOut)
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
  <div class="section empty-section">
    <p>👋 <a href="/restaurants">식당 설정</a>에서 식당을 추가하세요</p>
  </div>
{:else}
  <div class="section">
    <div class="controls-row">
      <div class="form-group">
        <label for="date-input">📅 날짜</label>
        <div class="date-row">
          <button class="date-nav-btn" onclick={() => navigate(shiftDate(data.date, -1), data.time)}>‹</button>
          <input
            id="date-input"
            class="date-input"
            type="date"
            value={toInputDate(data.date)}
            oninput={(e) => navigate(fromInputDate(e.currentTarget.value), data.time)}
          />
          <button class="date-nav-btn" onclick={() => navigate(shiftDate(data.date, 1), data.time)}>›</button>
        </div>
      </div>
      <div class="form-group">
        <label for="meal-time-select">🕐 식사 시간</label>
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

    {#if kind === 'takein'}
      <div class="filter-box">
        <div class="filter-title">🎯 필터 옵션</div>
        <div class="filter-options">
          <label class="filter-option">
            <input type="checkbox" bind:checked={takeInFilterMainOnly} />
            <span>메인 메뉴만</span>
          </label>
          <label class="filter-option">
            <input type="checkbox" bind:checked={takeInFilterExcludeOptional} />
            <span>추가찬 제외</span>
          </label>
        </div>
      </div>
    {/if}
  </div>

  <div class="section no-padding">
    <div class="section-head">
      <h2>🍴 {pageLabel}</h2>
      {#if visibleMenus.length > 0}
        <span class="menu-count">{visibleMenus.length}개 메뉴 · {data.restaurants.length}개 식당</span>
      {/if}
    </div>

    <MenuTable
      menus={visibleMenus}
      restaurants={data.restaurants}
      date={data.date}
      time={data.time}
      emptyMessage={`${pageLabel} 메뉴가 없습니다`}
      preferInlineComponents={kind === 'takein'}
    />
  </div>
{/if}

<style>
  .section {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    margin-bottom: 16px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
  .section.no-padding { padding: 0; }
  .section.empty-section { text-align: center; padding: 32px; color: var(--text-muted); }
  .section.empty-section a { color: var(--accent); }

  .section-head { display: flex; align-items: baseline; justify-content: space-between; padding: 14px 16px 0; }
  .section-head h2 { font-size: 1rem; font-weight: 600; color: #374151; display: flex; align-items: center; gap: 6px; }
  .section-head h2::before { content: ''; width: 4px; height: 18px; background: #10b981; border-radius: 2px; flex-shrink: 0; }
  .menu-count { font-size: 12px; color: var(--text-dim); }

  .controls-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end; }
  .filter-box { margin-top: 14px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
  .filter-title { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; }
  .filter-options { display: flex; gap: 14px; flex-wrap: wrap; }
  .filter-option { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text); cursor: pointer; }
  .form-group { display: flex; flex-direction: column; gap: 6px; }
  .form-group label { font-size: 12px; font-weight: 500; color: #4b5563; }
  .date-row { display: flex; align-items: center; gap: 4px; }

  .date-nav-btn {
    padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px;
    background: var(--surface); color: var(--text-muted); font-size: 16px;
    line-height: 1; cursor: pointer; transition: background 0.15s;
  }
  .date-nav-btn:hover { background: var(--surface-hover); }

  .date-input {
    padding: 7px 10px; border: 1px solid var(--border); border-radius: 6px;
    font-size: 13px; font-family: var(--font-sans); color: var(--text); background: var(--bg); outline: none;
  }
  .date-input:focus { border-color: #9ca3af; }

  .select-input {
    padding: 7px 10px; border: 1px solid var(--border); border-radius: 6px;
    font-size: 13px; font-family: var(--font-sans); color: var(--text);
    background: var(--bg); outline: none; min-width: 140px;
  }
  .select-input:focus { border-color: #9ca3af; }

  .date-label { font-size: 12px; color: var(--text-dim); font-family: var(--font-mono); align-self: flex-end; padding-bottom: 2px; }
</style>
