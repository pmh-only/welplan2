<script lang="ts">
  import { invalidateAll } from '$app/navigation'
  import { trackEvent } from '$lib/analytics'
  import { recordRestaurantSelection } from '$lib/restaurant-selection'
  import { restaurantDatedPath } from '$lib/restaurant-routes'
  import type { Restaurant } from '$lib/types'
  import { ALL_MEAL_TIME_ID, todayStr } from '$lib/utils'
  import { Check, Search, Store } from '@lucide/svelte'
  import { onMount } from 'svelte'

  type RestaurantsPageData = {
    restaurants: Restaurant[]
  }

  let { data }: { data: RestaurantsPageData } = $props()

  // Local copy for immediate UI updates; syncs from server data when it changes
  let restaurants = $state<Restaurant[]>([])
  $effect(() => { restaurants = data.restaurants })

  let query = $state('')
  let allRestaurants = $state<Restaurant[]>([])
  let searchResults = $state<Restaurant[]>([])
  let searching = $state(false)
  let searchError = $state('')

  const myIds = $derived(new Set(restaurants.map((r: Restaurant) => restaurantKey(r))))
  const visibleSearchResults = $derived(query.trim() ? searchResults : allRestaurants)

  function restaurantKey (restaurant: Restaurant) {
    return `${restaurant.vendor}:${restaurant.id}:${restaurant.name}:${pathText(restaurant)}`
  }

  function pathText (restaurant: Restaurant) {
    return restaurant.path?.filter(Boolean).join(' / ') ?? ''
  }

  function restaurantLink (restaurant: Restaurant) {
    return restaurantDatedPath(restaurant, todayStr())
  }

  function takeInLink (restaurant: Restaurant) {
    const params = new URLSearchParams({ restaurant: restaurant.id })
    return `/takein/${todayStr()}/${ALL_MEAL_TIME_ID}?${params}`
  }

  function saveRestaurants (next: Restaurant[]) {
    restaurants = next
    document.cookie = `welplan_restaurants=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=31536000; SameSite=Lax`
    invalidateAll()
  }

  function addRestaurant (r: Restaurant) {
    if (!myIds.has(restaurantKey(r))) {
      trackEvent('Restaurant Added', { vendor: r.vendor, restaurantId: r.id })
      saveRestaurants([...restaurants, r])
      void recordRestaurantSelection(r).catch(() => undefined)
    }
  }

  function removeRestaurant (r: Restaurant) {
    trackEvent('Restaurant Removed', { vendor: r.vendor, restaurantId: r.id })
    saveRestaurants(restaurants.filter((x: Restaurant) => restaurantKey(x) !== restaurantKey(r)))
  }

  async function loadAllRestaurants () {
    searching = true
    searchError = ''
    try {
      const res = await fetch('/proxy/search?q=')
      if (!res.ok) throw new Error('검색 실패')
      allRestaurants = await res.json()
    } catch (e) {
      searchError = `검색 중 오류가 발생했습니다: ${e instanceof Error ? e.message : e}`
      allRestaurants = []
    } finally {
      searching = false
    }
  }

  async function search () {
    const q = query.trim()
    if (!q) {
      if (allRestaurants.length === 0) loadAllRestaurants()
      return
    }
    searching = true
    searchError = ''
    try {
      const res = await fetch(`/proxy/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('검색 실패')
      searchResults = await res.json()
      trackEvent('Restaurant Search', { queryLength: q.length, resultCount: searchResults.length })
    } catch (e) {
      searchError = `검색 중 오류가 발생했습니다: ${e instanceof Error ? e.message : e}`
      searchResults = []
    } finally {
      searching = false
    }
  }

  onMount(() => {
    loadAllRestaurants()
  })
</script>

<div class="restaurants-layout">
  <div class="section">
    <div class="section-head">
      <div class="section-head-left">
        <h2>내 식당</h2>
        <span class="count-badge">{restaurants.length}개</span>
      </div>
    </div>

    {#if restaurants.length === 0}
      <div class="hint-block">
        <div class="empty-selected">
          <Store class="empty-selected-icon" aria-hidden="true" />
          <p class="hint">추가된 식당이 없습니다. 검색에서 식당을 추가하세요.</p>
        </div>
      </div>
    {:else}
      <ul class="rest-list">
        {#each restaurants as r (restaurantKey(r))}
          <li class="rest-item">
            <div class="rest-info">
              <div class="rest-copy">
                <p class="rest-name">{r.name}</p>
                {#if pathText(r)}
                  <span class="rest-path">{pathText(r)}</span>
                {/if}
              </div>
              <span class="vendor-badge vendor-{r.vendor}">{r.vendor === 'welstory' ? '삼성 웰스토리' : '신세계푸드'}</span>
            </div>
            <div class="rest-actions">
              <a class="move-btn" href={takeInLink(r)} onclick={() => trackEvent('Restaurant Take-In Opened', { vendor: r.vendor, restaurantId: r.id, source: 'restaurants_page' })}>이동</a>
              <button class="remove-btn" onclick={() => removeRestaurant(r)}>삭제</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="section">
    <div class="section-head">
      <div class="section-head-left">
        <h2>식당 검색</h2>
      </div>
    </div>

    <div class="search-area">
      <div class="search-row">
        <Search class="search-icon" aria-hidden="true" />
        <input
          class="search-input"
          type="text"
          placeholder="식당 이름을 입력하세요..."
          bind:value={query}
          oninput={search}
        />
        {#if searching}<span class="search-spinner">검색 중...</span>{/if}
      </div>

      {#if searchError}
        <p class="error">{searchError}</p>
      {:else if visibleSearchResults.length === 0 && query.trim() && !searching}
        <div class="hint-block">
          <p class="hint">검색 결과가 없습니다.</p>
        </div>
      {:else if visibleSearchResults.length > 0}
        <ul class="rest-list rest-search-list">
          {#each visibleSearchResults as r (restaurantKey(r))}
            {@const added = myIds.has(restaurantKey(r))}
            <li class="rest-item" class:rest-item-added={added}>
              <div class="rest-info">
                <div class="rest-copy">
                  <p class="rest-name">{r.name}</p>
                  {#if pathText(r)}
                    <span class="rest-path">{pathText(r)}</span>
                  {/if}
                </div>
                <span class="vendor-badge vendor-{r.vendor}">{r.vendor === 'welstory' ? '삼성 웰스토리' : '신세계푸드'}</span>
              </div>
              {#if added}
                <span class="added-tag">
                  <Check class="added-tag-icon" aria-hidden="true" />
                  추가됨
                </span>
              {:else}
                <button class="add-btn" onclick={() => addRestaurant(r)}>+ 추가</button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</div>

<style>
  .restaurants-layout {
    display: grid;
    gap: 14px;
  }

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

  .hint-block { padding: 20px 16px; }
  .hint { font-size: 13px; color: var(--text-dim); font-style: italic; }
  .empty-selected { min-height: 220px; display: grid; place-items: center; align-content: center; gap: 12px; text-align: center; }
  .empty-selected-icon { width: 44px; height: 44px; color: #94a3b8; stroke-width: 1.8; }
  .error { font-size: 13px; color: #dc2626; padding: 8px 16px; }

  .rest-list { list-style: none; padding: 8px 16px 16px; margin: 0; display: flex; flex-direction: column; gap: 6px; }
  .rest-search-list { max-height: min(620px, calc(100vh - 280px)); overflow: auto; }
  .rest-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 11px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    gap: 12px;
    transition: border-color 0.12s;
  }
  .rest-item:hover { border-color: #cbd5e1; }
  .rest-item-added { opacity: 0.65; }
  .rest-info { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
  .rest-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .rest-name { font-size: 13px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rest-link { text-decoration: none; }
  .rest-link:hover { color: var(--accent); text-decoration: underline; }
  .rest-path { font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vendor-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 10px; flex-shrink: 0; }
  .vendor-welstory { background: #dbeafe; color: #1d4ed8; }
  .vendor-shinsegae { background: #fce7f3; color: #be185d; }

  .rest-actions { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }

  .move-btn {
    flex-shrink: 0; padding: 5px 12px; border: 1px solid #6ee7b7; border-radius: 20px;
    background: #ecfdf5; color: #059669; font-size: 12px; font-weight: 500; text-decoration: none; transition: all 0.12s;
  }
  .move-btn:hover { background: #d1fae5; border-color: #34d399; }

  .remove-btn {
    flex-shrink: 0; padding: 5px 12px; border: 1px solid #fca5a5; border-radius: 20px;
    background: #fff1f2; color: #dc2626; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.12s;
  }
  .remove-btn:hover { background: #fee2e2; border-color: #f87171; }

  .add-btn {
    flex-shrink: 0; padding: 5px 12px; border: 1px solid #6ee7b7; border-radius: 20px;
    background: #ecfdf5; color: #059669; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.12s;
  }
  .add-btn:hover { background: #d1fae5; border-color: #34d399; }

  .added-tag { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; font-size: 12px; color: #059669; font-weight: 600; }
  .added-tag-icon { width: 13px; height: 13px; }

  .search-area { padding: 14px 16px 8px; }
  .search-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0 12px; transition: border-color 0.12s; }
  .search-row:focus-within { border-color: var(--border-focus); background: #fff; }
  .search-icon { width: 14px; height: 14px; color: var(--text-dim); flex-shrink: 0; }
  .search-input {
    flex: 1; padding: 9px 4px; border: none;
    font-size: 13px; color: var(--text); background: transparent; outline: none;
  }
  .search-spinner { font-size: 12px; color: var(--text-dim); white-space: nowrap; }

  @media (min-width: 900px) {
    .restaurants-layout {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: start;
    }

    .section:last-child {
      order: -1;
    }
  }
</style>
