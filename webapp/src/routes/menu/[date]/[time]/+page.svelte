<script lang="ts">
  import { goto } from '$app/navigation'
  import { app } from '$lib/state.svelte'
  import { pScore, pScoreColor, proxyImg, toInputDate, fromInputDate, formatKoreanDate, shiftDate } from '$lib/utils'
  import type { MenuComponent } from '$lib/types'

  let { data } = $props()

  let expandedMenuId = $state<string | null>(null)
  let detail = $state<MenuComponent[]>([])
  let loadingDetail = $state(false)
  let lightboxSrc = $state<string | null>(null)
  let lightboxAlt = $state('')

  function openLightbox (src: string, alt: string, e: MouseEvent) {
    e.stopPropagation()
    lightboxSrc = src
    lightboxAlt = alt
  }

  function closeLightbox () { lightboxSrc = null }

  // Re-run whenever URL params OR restaurants change (restaurants load async from localStorage)
  $effect(() => {
    const _r = app.restaurants
    app.date = data.date
    app.selectedMealTimeId = data.time
    app.fetchMenus()
  })

  function navigate (date: string, time: string | null) {
    if (date && time) goto(`/menu/${date}/${time}`)
  }

  async function toggleMenu (menu: ReturnType<typeof app.menus>[number]) {
    if (expandedMenuId === menu.id) { expandedMenuId = null; return }
    expandedMenuId = menu.id
    detail = []
    if (menu.hallNo && menu.courseType && app.selectedMealTimeId) {
      loadingDetail = true
      try {
        const params = new URLSearchParams({
          date: app.date,
          mealTimeId: app.selectedMealTimeId,
          hallNo: menu.hallNo,
          courseType: menu.courseType
        })
        const res = await fetch(`/proxy/${menu.restaurantId}/menus/detail?${params}`)
        if (res.ok) detail = await res.json()
      } finally {
        loadingDetail = false
      }
    } else {
      detail = menu.components
    }
  }

  $effect(() => {
    const _m = app.menus
    expandedMenuId = null
    detail = []
  })
</script>

{#if app.restaurants.length === 0}
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
        {#if app.loadingMealTimes}
          <div class="shimmer" style="height:36px; border-radius:6px; width:160px"></div>
        {:else}
          <select
            id="meal-time-select"
            class="select-input"
            value={data.time}
            onchange={(e) => navigate(data.date, e.currentTarget.value)}
          >
            {#each app.allMealTimes as mt (mt.id)}
              <option value={mt.id}>{mt.name}</option>
            {/each}
          </select>
        {/if}
      </div>
      <div class="date-label">{formatKoreanDate(data.date)}</div>
    </div>
  </div>

  <div class="section no-padding">
    <div class="section-head">
      <h2>🍴 메뉴</h2>
      {#if !app.loadingMenus && app.menus.length > 0}
        <span class="menu-count">{app.menus.length}개 메뉴 · {app.restaurants.length}개 식당</span>
      {/if}
    </div>

    {#if app.loadingMenus}
      <div class="table-shimmer">
        {#each Array(5) as _}
          <div class="shimmer table-shimmer-row"></div>
        {/each}
      </div>
    {:else if app.menus.length === 0}
      <div class="empty-state"><p>메뉴가 없습니다</p></div>
    {:else}
      <div class="table-wrap">
        <table class="menu-table">
          <thead>
            <tr>
              <th class="col-img"></th>
              <th class="col-rest hide-sm">식당</th>
              <th class="col-name">메뉴</th>
              <th class="col-ps">P-Score</th>
              <th class="col-num">칼로리</th>
              <th class="col-num hide-sm">탄수화물</th>
              <th class="col-num hide-sm">당</th>
              <th class="col-num">지방</th>
              <th class="col-num">단백질</th>
              <th class="col-num hide-sm">나트륨</th>
            </tr>
          </thead>
          <tbody>
            {#each app.menus as menu (menu.id)}
              {@const isExpanded = expandedMenuId === menu.id}
              {@const n = menu.nutrition}
              {@const imgSrc = proxyImg(menu.imageUrl)}
              {@const ps = pScore(n, app.pWeights)}
              <tr class="menu-row" class:expanded={isExpanded} onclick={() => toggleMenu(menu)}>
                <td class="col-img">
                  {#if imgSrc}
                    <img class="thumb thumb-clickable" src={imgSrc} alt={menu.name} loading="lazy" onclick={(e) => openLightbox(imgSrc, menu.name, e)} />
                  {:else}
                    <div class="thumb-placeholder"></div>
                  {/if}
                </td>
                <td class="col-rest hide-sm">
                  <span class="rest-tag">{app.restaurantName(menu.restaurantId)}</span>
                </td>
                <td class="col-name">
                  <span class="menu-name">{menu.name}</span>
                  {#if menu.isTakeOut}<span class="badge">포장</span>{/if}
                </td>
                <td class="col-ps">
                  {#if ps !== null}
                    <span class="ps-badge {pScoreColor(ps)}">{ps}</span>
                  {:else}
                    <span class="ps-na">—</span>
                  {/if}
                </td>
                <td class="col-num">{n?.calories != null ? `${n.calories.toLocaleString()} kcal` : '—'}</td>
                <td class="col-num hide-sm">{n?.carbohydrates != null ? `${n.carbohydrates}g` : '—'}</td>
                <td class="col-num hide-sm">{n?.sugar != null ? `${n.sugar}g` : '—'}</td>
                <td class="col-num">{n?.fat != null ? `${n.fat}g` : '—'}</td>
                <td class="col-num">{n?.protein != null ? `${n.protein}g` : '—'}</td>
                <td class="col-num hide-sm">{n?.sodium != null ? `${n.sodium}mg` : '—'}</td>
              </tr>
              {#if isExpanded}
                <tr class="detail-row">
                  <td colspan="10">
                    {#if loadingDetail}
                      <div class="detail-loading">
                        {#each Array(4) as _}
                          <div class="shimmer" style="height:13px; margin-bottom:6px; border-radius:3px"></div>
                        {/each}
                      </div>
                    {:else if detail.length === 0}
                      <p class="detail-empty">구성 정보 없음</p>
                    {:else}
                      <table class="dish-table">
                        <tbody>
                          {#each detail as dish}
                            <tr>
                              <td class="dish-name">{dish.name}</td>
                              <td class="dish-num">{dish.nutrition?.calories != null ? `${dish.nutrition.calories} kcal` : ''}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                      {#if detail[0]?.nutrition}
                        {@const dn = detail[0].nutrition}
                        <div class="detail-pills">
                          {#if dn?.carbohydrates != null}<span class="pill pill-carb">탄 {dn.carbohydrates}g</span>{/if}
                          {#if dn?.sugar != null}<span class="pill">당 {dn.sugar}g</span>{/if}
                          {#if dn?.fat != null}<span class="pill pill-fat">지 {dn.fat}g</span>{/if}
                          {#if dn?.protein != null}<span class="pill pill-protein">단 {dn.protein}g</span>{/if}
                          {#if dn?.sodium != null}<span class="pill">나트륨 {dn.sodium}mg</span>{/if}
                        </div>
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
  </div>
{/if}

{#if lightboxSrc}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="lightbox-overlay" onclick={closeLightbox}>
    <img class="lightbox-img" src={lightboxSrc} alt={lightboxAlt} onclick={(e) => e.stopPropagation()} />
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

  .table-wrap { overflow-x: auto; border-radius: var(--radius); }
  .menu-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .menu-table thead tr { background: var(--surface); border-bottom: 2px solid var(--border); }
  .menu-table th { padding: 9px 12px; text-align: left; font-weight: 600; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }

  .col-img { width: 60px; padding: 0 8px; }
  .col-rest { width: 90px; }
  .col-name { min-width: 140px; }
  .col-ps { width: 80px; text-align: center; }
  .col-num { width: 90px; text-align: right; font-family: var(--font-mono); }

  .menu-row { border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.1s; }
  .menu-row:hover { background: var(--surface); }
  .menu-row.expanded { background: var(--surface); border-bottom-color: transparent; }
  .menu-row td { padding: 10px 12px; vertical-align: middle; }
  .menu-row .col-img { padding: 6px 8px; }

  .thumb { width: 52px; height: 52px; object-fit: cover; border-radius: 6px; display: block; }
  .thumb-placeholder { width: 52px; height: 52px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); }

  .rest-tag { font-size: 11px; color: var(--text-dim); }
  .menu-name { font-weight: 500; color: var(--text); line-height: 1.4; }
  .badge { display: inline-block; font-size: 9px; padding: 1px 5px; border-radius: 3px; background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); font-family: var(--font-mono); letter-spacing: 0.5px; margin-left: 6px; vertical-align: middle; }

  .ps-badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; font-family: var(--font-mono); }
  .ps-green { background: #dcfce7; color: #16a34a; }
  .ps-yellow { background: #fef9c3; color: #ca8a04; }
  .ps-red { background: #fee2e2; color: #dc2626; }
  .ps-na { color: var(--text-dim); font-size: 12px; }

  .detail-row td { padding: 0 12px 14px 76px; background: var(--surface); border-bottom: 1px solid var(--border); }
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
  .table-shimmer { overflow: hidden; }
  .table-shimmer-row { height: 62px; border-bottom: 1px solid var(--border); }
  .empty-state { text-align: center; padding: 48px 20px; color: var(--text-dim); font-size: 13px; }

  @media (max-width: 640px) {
    .hide-sm { display: none; }
    .detail-row td { padding-left: 12px; }
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
</style>
