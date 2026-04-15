<script lang="ts">
  import { app, DEFAULT_WEIGHTS } from '$lib/state.svelte'
  import { pScore } from '$lib/utils'

  const EXAMPLE_NUTRITION = { calories: 650, carbohydrates: 80, sugar: 8, fat: 20, protein: 30 }
  let exampleScore = $derived(pScore(EXAMPLE_NUTRITION, app.pWeights))
  let cacheStatus = $state<Record<string, number | boolean> | null>(null)
  let cacheMessage = $state('')
  let cacheLoading = $state(false)

  const FIELDS: { key: keyof typeof DEFAULT_WEIGHTS; label: string; desc: string }[] = [
    { key: 'cal', label: '칼로리', desc: '칼로리(kcal) 가중치' },
    { key: 'carb', label: '탄수화물', desc: '탄수화물(g) 가중치' },
    { key: 'sugar', label: '당류', desc: '당류(g) 가중치 — 높을수록 당이 높은 메뉴에 불리' },
    { key: 'fat', label: '지방', desc: '지방(g) 가중치' },
    { key: 'protein', label: '단백질', desc: '단백질(g) 가중치 — P-Score에서 차감 (높을수록 이득)' }
  ]

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

<div class="section">
  <div class="section-head">
    <div class="section-head-left">
      <h2>P-Score 가중치</h2>
    </div>
    <button class="ghost-btn" onclick={() => app.resetWeights()}>기본값 복원</button>
  </div>

  <div class="section-body">
    <p class="desc">
      낮을수록 좋습니다 — <span class="tag tag-green">🟢 ≤50 좋음</span> <span class="tag tag-yellow">🟡 ≤100 보통</span> <span class="tag tag-red">🔴 &gt;100 주의</span>
    </p>

    <div class="fields">
      {#each FIELDS as f}
        <div class="field">
          <div class="field-head">
            <label for="w-{f.key}">{f.label}</label>
            <div class="field-right">
              <span class="field-desc">{f.desc}</span>
              <span class="field-val">{app.pWeights[f.key].toFixed(1)}</span>
            </div>
          </div>
          <input
            id="w-{f.key}"
            type="range"
            min="0"
            max="5"
            step="0.1"
            bind:value={app.pWeights[f.key]}
            oninput={() => app.savePWeights()}
          />
        </div>
      {/each}
    </div>

    <div class="example">
      <span class="example-label">예시 (650kcal · 탄 80g · 당 8g · 지 20g · 단 30g)</span>
      <span class="example-score" class:green={exampleScore !== null && exampleScore <= 50} class:yellow={exampleScore !== null && exampleScore > 50 && exampleScore <= 100} class:red={exampleScore !== null && exampleScore > 100}>
        P-Score {exampleScore ?? '—'}
      </span>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-head">
    <div class="section-head-left">
      <h2>캐시 상태</h2>
    </div>
    <div class="section-actions">
      <button class="ghost-btn" onclick={loadCacheStatus} disabled={cacheLoading}>상태 조회</button>
      <button class="danger-btn" onclick={clearCache} disabled={cacheLoading}>캐시 삭제</button>
    </div>
  </div>

  <div class="section-body">
    <p class="desc">서버에 저장된 식당 · 식사 시간 · 메뉴 · 상세 메뉴 캐시를 확인하거나 삭제합니다.</p>

    {#if cacheMessage}
      <p class="cache-message">{cacheMessage}</p>
    {/if}

    {#if cacheStatus}
      <div class="cache-grid">
        {#each Object.entries(cacheStatus) as [key, value]}
          <div class="cache-card">
            <span class="cache-key">{key}</span>
            <span class="cache-value">{String(value)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
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
  .section-actions { display: flex; gap: 6px; }
  .section-body { padding: 16px; }

  .desc { font-size: 13px; color: var(--text-muted); margin-bottom: 20px; line-height: 1.6; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .tag { font-size: 12px; padding: 2px 8px; border-radius: 12px; }
  .tag-green { background: #dcfce7; color: #16a34a; }
  .tag-yellow { background: #fef9c3; color: #ca8a04; }
  .tag-red { background: #fee2e2; color: #dc2626; }

  .ghost-btn {
    padding: 6px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text-muted); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.12s;
  }
  .ghost-btn:hover { background: var(--surface-hover); color: var(--text); }
  .ghost-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .danger-btn {
    padding: 6px 12px; border: 1px solid #fca5a5; border-radius: var(--radius-sm);
    background: #fff1f2; color: #dc2626; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.12s;
  }
  .danger-btn:hover { background: #fee2e2; }
  .danger-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .fields { display: flex; flex-direction: column; gap: 18px; margin-bottom: 20px; }

  .field {}
  .field-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; gap: 8px; }
  .field-head label { font-size: 13px; font-weight: 600; color: var(--text); min-width: 60px; }
  .field-right { display: flex; align-items: center; gap: 10px; flex: 1; justify-content: flex-end; }
  .field-desc { font-size: 11px; color: var(--text-dim); text-align: right; }
  .field-val { font-size: 13px; color: var(--green); font-weight: 700; min-width: 28px; text-align: right; }

  input[type='range'] { width: 100%; accent-color: var(--green); cursor: pointer; height: 4px; }

  .example {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 12px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    flex-wrap: wrap;
  }
  .example-label { font-size: 12px; color: var(--text-muted); }
  .example-score { font-size: 15px; font-weight: 700; }
  .example-score.green { color: #16a34a; }
  .example-score.yellow { color: #ca8a04; }
  .example-score.red { color: #dc2626; }

  .cache-message { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; }
  .cache-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }
  .cache-card { padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); }
  .cache-key { display: block; font-size: 11px; color: var(--text-dim); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
  .cache-value { font-size: 18px; font-weight: 700; color: var(--text); }
</style>
