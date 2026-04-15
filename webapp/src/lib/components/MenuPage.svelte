<script lang="ts">
  import { goto } from '$app/navigation'
  import MenuTable from '$lib/components/MenuTable.svelte'
  import type { MealTime, Menu, Restaurant } from '$lib/types'
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

  const pageLabel = $derived(kind === 'takeout' ? '테이크 아웃' : '테이크 인')
  const visibleMenus = $derived(data.menus.filter((menu: Menu) => kind === 'takeout' ? menu.isTakeOut : !menu.isTakeOut))

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
