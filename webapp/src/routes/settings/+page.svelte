<script lang="ts">
  import { app, DEFAULT_WEIGHTS } from '$lib/state.svelte'
  import { pScore } from '$lib/utils'

  const EXAMPLE_NUTRITION = { calories: 650, carbohydrates: 80, sugar: 8, fat: 20, protein: 30 }
  let exampleScore = $derived(pScore(EXAMPLE_NUTRITION, app.pWeights))

  const FIELDS: { key: keyof typeof DEFAULT_WEIGHTS; label: string; desc: string }[] = [
    { key: 'cal', label: '칼로리', desc: '칼로리(kcal) 가중치' },
    { key: 'carb', label: '탄수화물', desc: '탄수화물(g) 가중치' },
    { key: 'sugar', label: '당류', desc: '당류(g) 가중치 — 높을수록 당이 높은 메뉴에 불리' },
    { key: 'fat', label: '지방', desc: '지방(g) 가중치' },
    { key: 'protein', label: '단백질', desc: '단백질(g) 가중치 — P-Score에서 차감 (높을수록 이득)' }
  ]
</script>

<div class="section">
  <div class="section-head">
    <h2>⚙️ P-Score 가중치</h2>
    <button class="reset-btn" onclick={() => app.resetWeights()}>기본값 복원</button>
  </div>

  <p class="desc">
    P-Score = <code>칼로리×{app.pWeights.cal} + 탄수화물×{app.pWeights.carb} + 당류×{app.pWeights.sugar} + 지방×{app.pWeights.fat} − 단백질×{app.pWeights.protein}</code>
    <br />낮을수록 좋습니다 (🟢 ≤50, 🟡 ≤100, 🔴 &gt;100)
  </p>

  <div class="fields">
    {#each FIELDS as f}
      <div class="field">
        <div class="field-head">
          <label for="w-{f.key}">{f.label}</label>
          <span class="field-val">{app.pWeights[f.key].toFixed(1)}</span>
        </div>
        <p class="field-desc">{f.desc}</p>
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
    <span class="example-label">예시 (650kcal, 탄80g, 당8g, 지20g, 단30g):</span>
    <span class="example-score" class:green={exampleScore !== null && exampleScore <= 50} class:yellow={exampleScore !== null && exampleScore > 50 && exampleScore <= 100} class:red={exampleScore !== null && exampleScore > 100}>
      P-Score {exampleScore ?? '—'}
    </span>
  </div>
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

  .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .section-head h2 { font-size: 1rem; font-weight: 600; color: #374151; display: flex; align-items: center; gap: 6px; }
  .section-head h2::before { content: ''; width: 4px; height: 18px; background: #10b981; border-radius: 2px; flex-shrink: 0; }

  .desc { font-size: 12px; color: var(--text-muted); margin-bottom: 20px; line-height: 1.6; }
  .desc code { font-family: var(--font-mono); background: var(--surface); padding: 2px 4px; border-radius: 3px; font-size: 11px; }

  .reset-btn {
    padding: 6px 12px; border: 1px solid var(--border); border-radius: 5px;
    background: var(--surface); color: var(--text-muted); font-size: 12px; cursor: pointer; transition: background 0.15s;
  }
  .reset-btn:hover { background: var(--surface-hover); }

  .fields { display: flex; flex-direction: column; gap: 20px; margin-bottom: 24px; }

  .field {}
  .field-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
  .field-head label { font-size: 13px; font-weight: 500; color: var(--text); }
  .field-val { font-size: 13px; font-family: var(--font-mono); color: #10b981; font-weight: 700; min-width: 32px; text-align: right; }
  .field-desc { font-size: 11px; color: var(--text-dim); margin-bottom: 6px; }

  input[type='range'] { width: 100%; accent-color: #10b981; cursor: pointer; }

  .example { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; flex-wrap: wrap; }
  .example-label { font-size: 12px; color: var(--text-muted); }
  .example-score { font-size: 14px; font-weight: 700; font-family: var(--font-mono); }
  .example-score.green { color: #16a34a; }
  .example-score.yellow { color: #ca8a04; }
  .example-score.red { color: #dc2626; }
</style>
