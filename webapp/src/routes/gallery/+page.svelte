<script lang="ts">
  import { app } from '$lib/state.svelte'
  import { pScore, pScoreColor, proxyImg } from '$lib/utils'

  let showLabels = $state(true)

  let galleryMenus = $derived(
    app.menus
      .filter((m) => m.imageUrl)
      .sort((a, b) => (pScore(a.nutrition, app.pWeights) ?? 9999) - (pScore(b.nutrition, app.pWeights) ?? 9999))
  )
</script>

<div class="section">
  <div class="section-head">
    <h2>📸 메뉴 갤러리</h2>
    <div class="controls">
      <span class="count">{galleryMenus.length}개 이미지</span>
      <label class="check-label">
        <input type="checkbox" bind:checked={showLabels} />
        메뉴명 표시
      </label>
    </div>
  </div>

  {#if app.restaurants.length === 0}
    <p class="hint"><a href="/restaurants">식당 설정</a>에서 식당을 추가하면 갤러리가 표시됩니다</p>
  {:else if app.loadingMenus}
    <div class="gallery-grid">
      {#each Array(8) as _}
        <div class="shimmer gallery-shimmer"></div>
      {/each}
    </div>
  {:else if galleryMenus.length === 0}
    <p class="hint">이미지가 있는 메뉴가 없습니다. 메뉴 탭에서 날짜/시간을 선택해 먼저 메뉴를 불러오세요.</p>
  {:else}
    <div class="gallery-grid">
      {#each galleryMenus as menu, i (menu.id)}
        {@const ps = pScore(menu.nutrition, app.pWeights)}
        <div class="gallery-card">
          {#if i < 3}
            <span class="medal">{(['🥇', '🥈', '🥉'])[i]}</span>
          {/if}
          <img class="gallery-img" src={proxyImg(menu.imageUrl)} alt={menu.name} loading="lazy" />
          {#if showLabels}
            <div class="gallery-info">
              <span class="gallery-name">{menu.name}</span>
              <div class="gallery-meta">
                {#if ps !== null}
                  <span class="ps-badge {pScoreColor(ps)}">{ps}</span>
                {/if}
                <span class="gallery-restaurant">{app.restaurantName(menu.restaurantId)}</span>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
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

  .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 10px; }
  .section-head h2 { font-size: 1rem; font-weight: 600; color: #374151; display: flex; align-items: center; gap: 6px; }
  .section-head h2::before { content: ''; width: 4px; height: 18px; background: #10b981; border-radius: 2px; flex-shrink: 0; }

  .controls { display: flex; align-items: center; gap: 16px; }
  .count { font-size: 13px; color: var(--text-muted); }
  .check-label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted); cursor: pointer; }

  .hint { font-size: 13px; color: var(--text-dim); font-style: italic; margin-top: 8px; }
  .hint a { color: var(--accent); }

  .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }

  .gallery-card { position: relative; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: var(--surface); transition: box-shadow 0.15s; }
  .gallery-card:hover { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); }

  .medal { position: absolute; top: 6px; left: 6px; font-size: 20px; line-height: 1; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4)); z-index: 1; }

  .gallery-img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
  .gallery-shimmer { aspect-ratio: 1; border-radius: var(--radius); background: linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 50%, var(--surface) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }

  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  .gallery-info { padding: 8px 10px; background: white; border-top: 1px solid var(--border); }
  .gallery-name { display: block; font-size: 12px; font-weight: 500; color: var(--text); margin-bottom: 6px; line-height: 1.4; }
  .gallery-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .gallery-restaurant { font-size: 11px; color: var(--text-dim); }

  .ps-badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; font-family: var(--font-mono); }
  .ps-green { background: #dcfce7; color: #16a34a; }
  .ps-yellow { background: #fef9c3; color: #ca8a04; }
  .ps-red { background: #fee2e2; color: #dc2626; }

  @media (max-width: 640px) {
    .gallery-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  }
</style>
