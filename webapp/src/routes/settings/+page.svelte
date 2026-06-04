<script lang="ts">
  import { app, START_PAGE_OPTIONS } from '$lib/state.svelte'

  let cacheStatus = $state<Record<string, number | boolean> | null>(null)
  let cacheMessage = $state('')
  let cacheLoading = $state(false)

  async function loadCacheStatus () {
    cacheLoading = true
    cacheMessage = ''
    try {
      const res = await fetch('/api/cache/status')
      if (!res.ok) throw new Error('캐시 상태 조회 실패')
      cacheStatus = await res.json()
    } catch (error) {
      cacheMessage = error instanceof Error ? error.message : String(error)
    } finally {
      cacheLoading = false
    }
  }

  async function clearCache () {
    cacheLoading = true
    cacheMessage = ''
    try {
      const res = await fetch('/api/cache/clear', { method: 'POST' })
      if (!res.ok) throw new Error('캐시 삭제 실패')
      const payload = await res.json()
      cacheStatus = payload.status
      cacheMessage = payload.message
    } catch (error) {
      cacheMessage = error instanceof Error ? error.message : String(error)
    } finally {
      cacheLoading = false
    }
  }
</script>

<div class="settings-layout">
  <div class="section">
    <div class="section-head">
      <div class="section-head-left">
        <h2>시작 페이지</h2>
      </div>
    </div>

    <div class="section-body">
      <div class="field">
        <div class="field-head">
          <label for="start-page-select">처음 열 화면</label>
        </div>
        <select
          id="start-page-select"
          class="select-input"
          bind:value={app.startPage}
          onchange={() => app.saveStartPage()}
        >
          {#each START_PAGE_OPTIONS as option (option.path)}
            <option value={option.path}>{option.label}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

</div>


<style>
  .settings-layout {
    display: grid;
    gap: 14px;
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
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    gap: 12px;
    flex-wrap: wrap;
  }
  .section-head-left { display: flex; align-items: center; gap: 10px; }
  .section-head h2 {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    padding-left: 10px;
    border-left: 3px solid var(--green);
  }
  .section-body { padding: 16px; }

  .field-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; gap: 8px; }
  .field-head label { font-size: 13px; font-weight: 600; color: var(--text); min-width: 60px; }

  .select-input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
    outline: none;
    transition: border-color 0.12s;
  }
  .select-input:focus { border-color: var(--border-focus); }

</style>
