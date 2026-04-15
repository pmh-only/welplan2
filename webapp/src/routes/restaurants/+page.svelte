<script lang="ts">
  import { app } from '$lib/state.svelte'
  import type { Restaurant } from '$lib/types'

  let query = $state('')
  let searchResults = $state<Restaurant[]>([])
  let searching = $state(false)
  let searchError = $state('')

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

  function onKeydown (e: KeyboardEvent) {
    if (e.key === 'Enter') search()
  }
</script>

<div class="section">
  <div class="section-head">
    <h2>🏪 내 식당</h2>
    <span class="count">{app.restaurants.length}개</span>
  </div>

  {#if app.restaurants.length === 0}
    <p class="hint">추가된 식당이 없습니다. 아래에서 검색해 추가하세요.</p>
  {:else}
    <ul class="rest-list">
      {#each app.restaurants as r (r.id)}
        <li class="rest-item">
          <div class="rest-info">
            <span class="rest-name">{r.name}</span>
            <span class="rest-id">{r.id}</span>
          </div>
          <button class="remove-btn" onclick={() => app.removeRestaurant(r)}>삭제</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<div class="section">
  <div class="section-head">
    <h2>🔍 식당 검색</h2>
  </div>

  <div class="search-row">
    <input
      class="search-input"
      type="text"
      placeholder="식당 이름 또는 ID 검색..."
      bind:value={query}
      onkeydown={onKeydown}
    />
    <button class="search-btn" onclick={search} disabled={searching}>
      {searching ? '검색 중...' : '검색'}
    </button>
  </div>

  {#if searchError}
    <p class="error">{searchError}</p>
  {:else if searchResults.length === 0 && query.trim() && !searching}
    <p class="hint">검색 결과가 없습니다.</p>
  {:else if searchResults.length > 0}
    <ul class="rest-list">
      {#each searchResults as r (r.id)}
        {@const added = app.myIds.has(r.id)}
        <li class="rest-item">
          <div class="rest-info">
            <span class="rest-name">{r.name}</span>
            <span class="rest-id">{r.id}</span>
          </div>
          {#if added}
            <span class="added-tag">추가됨</span>
          {:else}
            <button class="add-btn" onclick={() => app.addRestaurant(r)}>추가</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .section {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    margin-bottom: 16px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .section-head h2 { font-size: 1rem; font-weight: 600; color: #374151; display: flex; align-items: center; gap: 6px; }
  .section-head h2::before { content: ''; width: 4px; height: 18px; background: #10b981; border-radius: 2px; flex-shrink: 0; }
  .count { font-size: 13px; color: var(--text-muted); }

  .hint { font-size: 13px; color: var(--text-dim); font-style: italic; }
  .error { font-size: 13px; color: #dc2626; margin-top: 8px; }

  .rest-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .rest-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; gap: 12px; }
  .rest-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .rest-name { font-size: 13px; font-weight: 500; color: var(--text); }
  .rest-id { font-size: 11px; color: var(--text-dim); font-family: var(--font-mono); }

  .remove-btn {
    flex-shrink: 0; padding: 5px 12px; border: 1px solid #fca5a5; border-radius: 5px;
    background: #fff1f2; color: #dc2626; font-size: 12px; cursor: pointer; transition: background 0.15s;
  }
  .remove-btn:hover { background: #fee2e2; }

  .add-btn {
    flex-shrink: 0; padding: 5px 12px; border: 1px solid #6ee7b7; border-radius: 5px;
    background: #ecfdf5; color: #059669; font-size: 12px; cursor: pointer; transition: background 0.15s;
  }
  .add-btn:hover { background: #d1fae5; }

  .added-tag { flex-shrink: 0; font-size: 11px; color: #059669; font-weight: 500; }

  .search-row { display: flex; gap: 8px; margin-bottom: 12px; }
  .search-input {
    flex: 1; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;
    font-size: 13px; font-family: var(--font-sans); color: var(--text); background: var(--bg); outline: none;
  }
  .search-input:focus { border-color: #9ca3af; }
  .search-btn {
    padding: 8px 16px; border: 1px solid var(--border); border-radius: 6px;
    background: #1f2937; color: #f9fafb; font-size: 13px; cursor: pointer; transition: background 0.15s; white-space: nowrap;
  }
  .search-btn:hover:not(:disabled) { background: #374151; }
  .search-btn:disabled { opacity: 0.6; cursor: default; }
</style>
