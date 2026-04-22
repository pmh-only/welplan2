<script lang="ts">
  import { invalidateAll } from '$app/navigation'
  import type { Restaurant } from '$lib/types'

  type RestaurantsPageData = {
    restaurants: Restaurant[]
    isFirstVisit: boolean
  }

  let { data }: { data: RestaurantsPageData } = $props()

  // Local copy for immediate UI updates; syncs from server data when it changes
  let restaurants = $state<Restaurant[]>([])
  $effect(() => { restaurants = data.restaurants })

  let query = $state('')
  let searchResults = $state<Restaurant[]>([])
  let searching = $state(false)
  let searchError = $state('')

  const myIds = $derived(new Set(restaurants.map((r: Restaurant) => r.id)))

  function pathText (restaurant: Restaurant) {
    return restaurant.path?.filter(Boolean).join(' / ') ?? ''
  }

  function saveRestaurants (next: Restaurant[]) {
    restaurants = next
    document.cookie = `welplan_restaurants=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=31536000; SameSite=Lax`
    invalidateAll()
  }

  function addRestaurant (r: Restaurant) {
    if (!myIds.has(r.id)) saveRestaurants([...restaurants, r])
  }

  function removeRestaurant (r: Restaurant) {
    saveRestaurants(restaurants.filter((x: Restaurant) => x.id !== r.id))
  }

  async function search () {
    const q = query.trim()
    if (!q) { searchResults = []; return }
    searching = true
    searchError = ''
    try {
      const res = await fetch(`/proxy/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('검색 실패')
      searchResults = await res.json()
    } catch (e) {
      searchError = `검색 중 오류가 발생했습니다: ${e instanceof Error ? e.message : e}`
      searchResults = []
    } finally {
      searching = false
    }
  }
</script>

{#if data.isFirstVisit}
  <div class="welcome-guide">
    <div class="welcome-guide-head">
      <div>
        <p class="welcome-guide-eyebrow">첫 방문 안내</p>
        <h2>먼저 내 식당을 추가해 주세요</h2>
      </div>
      <span class="welcome-guide-badge">1분 설정</span>
    </div>

    <ol class="welcome-guide-steps">
      <li>아래 검색창에 자주 이용하는 식당 이름을 입력합니다.</li>
      <li>검색 결과에서 원하는 웰스토리 또는 신세계푸드 식당의 <code>+ 추가</code> 버튼을 누릅니다.</li>
      <li>설정이 끝나면 갤러리, 테이크 인, 테이크 아웃 화면이 내 식당 기준으로 표시됩니다.</li>
    </ol>

    <p class="welcome-guide-note">
      기본 추천 식당이 보일 수 있지만, 내 식당을 직접 추가하거나 정리해 두면 이후 조회가 더 정확해집니다.
    </p>
  </div>
{/if}

<div class="section">
  <div class="section-head">
    <div class="section-head-left">
      <h2>내 식당</h2>
      <span class="count-badge">{restaurants.length}개</span>
    </div>
  </div>

  {#if restaurants.length === 0}
    <div class="hint-block">
      <p class="hint">추가된 식당이 없습니다. 아래에서 검색해 추가하세요.</p>
    </div>
  {:else}
    <ul class="rest-list">
      {#each restaurants as r (r.id)}
        <li class="rest-item">
          <div class="rest-info">
            <div class="rest-copy">
              <span class="rest-name">{r.name}</span>
              {#if pathText(r)}
                <span class="rest-path">{pathText(r)}</span>
              {/if}
            </div>
            <span class="vendor-badge vendor-{r.vendor}">{r.vendor === 'welstory' ? '삼성 웰스토리' : '신세계푸드'}</span>
          </div>
          <button class="remove-btn" onclick={() => removeRestaurant(r)}>삭제</button>
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
      <span class="search-icon">🔍</span>
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
    {:else if searchResults.length === 0 && query.trim() && !searching}
      <div class="hint-block">
        <p class="hint">검색 결과가 없습니다.</p>
      </div>
    {:else if searchResults.length > 0}
      <ul class="rest-list">
        {#each searchResults as r (r.id)}
          {@const added = myIds.has(r.id)}
          <li class="rest-item" class:rest-item-added={added}>
            <div class="rest-info">
              <div class="rest-copy">
                <span class="rest-name">{r.name}</span>
                {#if pathText(r)}
                  <span class="rest-path">{pathText(r)}</span>
                {/if}
              </div>
              <span class="vendor-badge vendor-{r.vendor}">{r.vendor === 'welstory' ? '삼성 웰스토리' : '신세계푸드'}</span>
            </div>
            {#if added}
              <span class="added-tag">✓ 추가됨</span>
            {:else}
              <button class="add-btn" onclick={() => addRestaurant(r)}>+ 추가</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .welcome-guide {
    margin-bottom: 14px;
    padding: 18px;
    border: 1px solid #86efac;
    border-radius: var(--radius);
    background: linear-gradient(180deg, #ecfdf5 0%, #f8fafc 100%);
    box-shadow: var(--shadow-sm);
  }

  .welcome-guide-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .welcome-guide-eyebrow {
    margin-bottom: 4px;
    color: #047857;
    font-size: 12px;
    font-weight: 700;
  }

  .welcome-guide h2 {
    color: var(--text);
    font-size: 1.05rem;
    font-weight: 700;
  }

  .welcome-guide-badge {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    background: rgba(16, 185, 129, 0.12);
    color: #047857;
    font-size: 12px;
    font-weight: 700;
  }

  .welcome-guide-steps {
    margin: 0 0 10px;
    padding-left: 20px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.7;
  }

  .welcome-guide-note {
    color: var(--text-dim);
    font-size: 12px;
  }

  .section {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    margin-bottom: 14px;
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
  .error { font-size: 13px; color: #dc2626; padding: 8px 16px; }

  .rest-list { list-style: none; padding: 8px 16px 16px; margin: 0; display: flex; flex-direction: column; gap: 6px; }
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
  .rest-path { font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vendor-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 10px; flex-shrink: 0; }
  .vendor-welstory { background: #dbeafe; color: #1d4ed8; }
  .vendor-shinsegae { background: #fce7f3; color: #be185d; }

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

  .added-tag { flex-shrink: 0; font-size: 12px; color: #059669; font-weight: 600; }

  .search-area { padding: 14px 16px 8px; }
  .search-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0 12px; transition: border-color 0.12s; }
  .search-row:focus-within { border-color: var(--border-focus); background: #fff; }
  .search-icon { font-size: 14px; color: var(--text-dim); flex-shrink: 0; }
  .search-input {
    flex: 1; padding: 9px 4px; border: none;
    font-size: 13px; color: var(--text); background: transparent; outline: none;
  }
  .search-spinner { font-size: 12px; color: var(--text-dim); white-space: nowrap; }
</style>
