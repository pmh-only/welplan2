<script lang="ts">
  import { goto } from '$app/navigation'
  import { restaurantDatedPath, restaurantDetailPath } from '$lib/restaurant-routes'
  import { app } from '$lib/state.svelte'
  import type { MealTime, Menu, MenuComponent, NutritionInfo, Restaurant } from '$lib/types'
  import { fromInputDate, pScore, pScoreColor, proxyImg, toInputDate } from '$lib/utils'

  type NutritionKey = keyof NutritionInfo
  type NutrientDef = { key: NutritionKey; label: string; unit: string }
  type GalleryMealTimeResult = MealTime & {
    menuCount: number
    failed: boolean
    errorMessage?: string
  }

  type RestaurantGalleryData = {
    restaurant: Restaurant
    restaurants: Restaurant[]
    mealTimes: MealTime[]
    mealTimeMenus: GalleryMealTimeResult[]
    menus: Menu[]
    date: string
    routeMode: 'plural' | 'dated'
    canonicalPath: string
    detailPath?: string
  }

  type GallerySection = {
    mealTime: MealTime
    info?: GalleryMealTimeResult
    menus: Menu[]
  }

  const nutrientDefs: NutrientDef[] = [
    { key: 'calories', label: '칼로리', unit: ' kcal' },
    { key: 'carbohydrates', label: '탄수화물', unit: 'g' },
    { key: 'sugar', label: '당', unit: 'g' },
    { key: 'fiber', label: '식이섬유', unit: 'g' },
    { key: 'fat', label: '지방', unit: 'g' },
    { key: 'protein', label: '단백질', unit: 'g' },
    { key: 'sodium', label: '나트륨', unit: 'mg' },
    { key: 'cholesterol', label: '콜레스테롤', unit: 'mg' },
    { key: 'saturatedFat', label: '포화지방', unit: 'g' },
    { key: 'transFat', label: '트랜스지방', unit: 'g' },
    { key: 'calcium', label: '칼슘', unit: 'mg' }
  ]

  let { data }: { data: RestaurantGalleryData } = $props()

  let zoomedMenu = $state<Menu | null>(null)
  let detail = $state<MenuComponent[]>([])
  let loadingDetail = $state(false)

  const selectedDate = $derived(data.date)

  function normalizeMenuName (name: string): string {
    return name.replace(/\s*포장$/, '').trim()
  }

  function detailRowsFor (menu: Menu): MenuComponent[] {
    if (detail.length <= 1) return detail
    const normalizedMenuName = normalizeMenuName(menu.name)
    const rows = detail.filter((dish) => !(normalizeMenuName(dish.name) === normalizedMenuName && dish.nutrition?.calories === 0))
    return rows.length > 0 ? rows : detail
  }

  function sortedByPScore (components: MenuComponent[]): MenuComponent[] {
    return [...components].sort((a, b) => {
      const aScore = pScore(a.nutrition, app.pWeights)
      const bScore = pScore(b.nutrition, app.pWeights)
      if (aScore === null && bScore === null) return 0
      if (aScore === null) return 1
      if (bScore === null) return -1
      return bScore - aScore
    })
  }

  function formatMetric (value: number | undefined, unit = ''): string {
    if (value == null) return '—'
    const rounded = Math.round(value * 10) / 10
    const display = Number.isInteger(rounded)
      ? rounded.toLocaleString()
      : rounded.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    return `${display}${unit}`
  }

  function activeNutrients (nutrition: NutritionInfo | undefined): NutrientDef[] {
    if (!nutrition) return []
    return nutrientDefs.filter(({ key }) => nutrition[key] != null)
  }

  function activeDetailNutrients (rows: MenuComponent[]): NutrientDef[] {
    return nutrientDefs.filter(({ key }) => rows.some((row) => row.nutrition?.[key] != null))
  }

  function compareMenus (a: Menu, b: Menu): number {
    const aScore = pScore(a.nutrition, app.pWeights) ?? 999999
    const bScore = pScore(b.nutrition, app.pWeights) ?? 999999
    return aScore - bScore || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id, 'ko')
  }

  function isGalleryMenu (menu: Menu): boolean {
    if (!menu.imageUrl) return false
    if (menu.name.includes('죽')) return false
    return !menu.isTakeOut || menu.name.includes('도시락')
  }

  function mealTimeName (mealTimeId: string): string {
    return data.mealTimes.find((mealTime) => mealTime.id === mealTimeId)?.name ?? mealTimeId
  }

  const gallerySections = $derived.by<GallerySection[]>(() => data.mealTimes
    .map((mealTime) => ({
      mealTime,
      info: data.mealTimeMenus.find((result) => result.id === mealTime.id),
      menus: data.menus
        .filter((menu) => menu.mealTimeId === mealTime.id)
        .filter(isGalleryMenu)
        .sort(compareMenus)
    }))
    .filter((section) => section.menus.length > 0 || section.info?.failed))

  const galleryMenus = $derived(gallerySections.flatMap((section) => section.menus))

  function navigate (date: string) {
    if (data.routeMode === 'dated') {
      goto(restaurantDatedPath(data.restaurant, date))
      return
    }

    const params = new URLSearchParams({ date })
    goto(`${data.detailPath ?? restaurantDetailPath(data.restaurant)}?${params}`)
  }

  async function openZoom (menu: Menu) {
    zoomedMenu = menu
    detail = []
    loadingDetail = false

    if (menu.vendor === 'welstory' && menu.hallNo && menu.courseType) {
      loadingDetail = true
      try {
        const params = new URLSearchParams({
          date: menu.date,
          mealTimeId: menu.mealTimeId,
          hallNo: menu.hallNo,
          courseType: menu.courseType,
          nutrient: '1'
        })
        const res = await fetch(`/proxy/${menu.restaurantId}/menus/detail?${params}`)
        if (res.ok) detail = await res.json()
      } finally {
        loadingDetail = false
      }
    }
  }

  function closeZoom () {
    zoomedMenu = null
    detail = []
  }

  function onKeydown (event: KeyboardEvent) {
    if (zoomedMenu && event.key === 'Escape') closeZoom()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head>
  {#each galleryMenus.slice(0, 1) as menu}
    <link rel="preload" as="image" href={proxyImg(menu.imageUrl)} fetchpriority="high" />
  {/each}
</svelte:head>

<article class="menu-page" aria-labelledby="restaurant-title">
  <section class="hero-panel">
    <p class="eyebrow">하루 전체 메뉴 갤러리</p>
    <h1 id="restaurant-title">{data.restaurant.name}</h1>
    <div class="controls-row" aria-label="메뉴 조회 조건">
      <label class="control-field" for="date-input">
        <span>날짜</span>
        <input
          id="date-input"
          class="date-input"
          type="date"
          value={toInputDate(selectedDate)}
          oninput={(event) => navigate(fromInputDate(event.currentTarget.value))}
        />
      </label>
      <span class="all-day-pill">모든 식사 시간</span>
    </div>
  </section>

  <section class="gallery-panel" aria-label={`${data.restaurant.name} 전체 메뉴 사진`}>
    {#if galleryMenus.length === 0}
      <div class="empty-state">
        <p>이미지가 있는 메뉴가 없습니다.</p>
      </div>
    {:else}
      {#each gallerySections as section (section.mealTime.id)}
        <section class="meal-section" aria-labelledby={`meal-section-${section.mealTime.id}`}>
          <div class="meal-section-head">
            <div>
              <p class="meal-eyebrow">Meal Time</p>
              <h2 id={`meal-section-${section.mealTime.id}`}>{section.mealTime.name}</h2>
            </div>
            <span class="meal-count">{section.menus.length}개</span>
          </div>
          {#if section.info?.failed}
            <p class="meal-error">이 식사 시간 메뉴를 불러오지 못했습니다.</p>
          {:else if section.menus.length === 0}
            <p class="meal-empty">이미지가 있는 메뉴가 없습니다.</p>
          {:else}
            <div class="gallery-grid">
              {#each section.menus as menu, index (`${section.mealTime.id}:${menu.id}`)}
                {@const score = pScore(menu.nutrition, app.pWeights)}
                <button class="gallery-card" type="button" onclick={() => openZoom(menu)} aria-label={`${section.mealTime.name} ${menu.name} 크게 보기`}>
                  <span class="image-wrap">
                    <img src={proxyImg(menu.imageUrl)} alt={menu.name} loading={index === 0 ? 'eager' : 'lazy'} fetchpriority={index === 0 ? 'high' : 'auto'} />
                  </span>
                  <span class="gallery-info">
                    <span class="meal-time-badge">{section.mealTime.name}</span>
                    <span class="menu-name">{menu.name}</span>
                    {#if menu.components.length > 0}
                      <span class="menu-components">{sortedByPScore(menu.components).map((component) => component.name).join(' · ')}</span>
                    {/if}
                    {#if score !== null}
                      <span class="ps-badge {pScoreColor(score)}">P {score}</span>
                    {/if}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
    {/if}
  </section>

  <section class="cta-panel" aria-label="Welplan 바로가기">
    <a class="promo-button" href="/restaurants">내 식당 메뉴도 Welplan에서 보기</a>
    <a class="home-button" href="/">Welplan으로 가기</a>
  </section>
</article>

{#if zoomedMenu}
  {@const score = pScore(zoomedMenu.nutrition, app.pWeights)}
  <div
    class="lightbox"
    role="button"
    tabindex="0"
    aria-label="닫기"
    onclick={closeZoom}
    onkeydown={(event) => (event.key === 'Escape' || event.key === 'Enter') && closeZoom()}
  >
    <div
      class="lightbox-inner"
      role="presentation"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => event.stopPropagation()}
    >
      <div class="lightbox-left">
        <img class="lightbox-img" src={proxyImg(zoomedMenu.imageUrl)} alt={zoomedMenu.name} />
        <div class="lightbox-info">
          <div class="lightbox-text">
            <span class="meal-time-badge">{mealTimeName(zoomedMenu.mealTimeId)}</span>
            <span class="lightbox-name">{zoomedMenu.name}</span>
            {#if zoomedMenu.components.length > 0}
              <span class="lightbox-components">{sortedByPScore(zoomedMenu.components).map((component) => component.name).join(' · ')}</span>
            {/if}
          </div>
          {#if score !== null}
            <span class="ps-badge {pScoreColor(score)}">P {score}</span>
          {/if}
        </div>
      </div>
      <div class="lightbox-right">
        {#if activeNutrients(zoomedMenu.nutrition).length > 0}
          <div class="lightbox-nutrition">
            {#each activeNutrients(zoomedMenu.nutrition) as { key, label, unit }}
              <div class="nutr-cell">
                <span class="nutr-label">{label}</span>
                <span class="nutr-value">{formatMetric(zoomedMenu.nutrition?.[key], unit)}</span>
              </div>
            {/each}
          </div>
        {/if}
        {#if loadingDetail}
          <div class="detail-loading">
            {#each Array(3) as _}
              <div class="shimmer"></div>
            {/each}
          </div>
        {:else if detail.length > 0}
          {@const detailRows = detailRowsFor(zoomedMenu)}
          {@const detailMetrics = activeDetailNutrients(detailRows)}
          <div class="detail-table-wrap">
            <table class="detail-table">
              <thead>
                <tr>
                  <th class="detail-col-name">항목</th>
                  <th class="detail-col-ps">P-Score</th>
                  {#each detailMetrics as { label }}
                    <th class="detail-col-num">{label}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each detailRows as dish}
                  {@const nutrition = dish.nutrition}
                  {@const detailScore = pScore(nutrition, app.pWeights)}
                  <tr>
                    <td class="detail-col-name dish-name">{dish.name}</td>
                    <td class="detail-col-ps">
                      {#if detailScore !== null}
                        <span class="ps-badge {pScoreColor(detailScore)}">P {detailScore}</span>
                      {:else}
                        <span class="ps-na">—</span>
                      {/if}
                    </td>
                    {#each detailMetrics as { key, unit }}
                      <td class="detail-col-num">{formatMetric(nutrition?.[key], unit)}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
      <button class="lightbox-close" onclick={closeZoom} aria-label="닫기">×</button>
    </div>
  </div>
{/if}

<style>
  .menu-page {
    display: grid;
    gap: 14px;
  }

  .hero-panel,
  .gallery-panel,
  .cta-panel {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    box-shadow: var(--shadow-sm);
  }

  .hero-panel {
    padding: 18px;
  }

  .eyebrow,
  .meal-eyebrow {
    margin-bottom: 4px;
    color: var(--green);
    font-size: 12px;
    font-weight: 700;
  }

  h1 {
    color: var(--text);
    font-size: 1.6rem;
    line-height: 1.25;
    letter-spacing: -0.03em;
  }

  h2 {
    color: var(--text);
    font-size: 1rem;
    line-height: 1.3;
  }

  .controls-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px;
    margin-top: 18px;
  }

  .control-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    color: var(--text-dim);
    font-size: 11px;
    font-weight: 700;
  }

  .date-input {
    min-height: 36px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
    outline: none;
    transition: border-color 0.12s;
  }

  .date-input:focus {
    border-color: var(--border-focus);
  }

  .all-day-pill,
  .meal-count,
  .meal-time-badge {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    border-radius: 999px;
    background: var(--green-dim);
    color: var(--green);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .all-day-pill {
    min-height: 36px;
    padding: 0 12px;
  }

  .meal-count,
  .meal-time-badge {
    padding: 3px 8px;
  }

  .gallery-panel {
    overflow: hidden;
  }

  .meal-section + .meal-section {
    border-top: 1px solid var(--border);
  }

  .meal-section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 16px 0;
  }

  .meal-empty,
  .meal-error {
    padding: 16px;
    color: var(--text-dim);
    font-size: 13px;
    font-style: italic;
  }

  .meal-error {
    color: var(--text-muted);
  }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
    padding: 16px;
  }

  .gallery-card {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    color: inherit;
    text-align: left;
    cursor: zoom-in;
    transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
  }

  .gallery-card:hover,
  .gallery-card:focus-visible {
    transform: translateY(-2px);
    border-color: var(--border-focus);
    box-shadow: var(--shadow-lg);
  }

  .image-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    background: var(--surface);
  }

  .image-wrap img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: transform 0.2s;
  }

  .gallery-card:hover .image-wrap img,
  .gallery-card:focus-visible .image-wrap img {
    transform: scale(1.04);
  }

  .gallery-info {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    padding: 10px;
    border-top: 1px solid var(--border);
  }

  .menu-name {
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }

  .menu-components {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.45;
  }

  .ps-badge {
    display: inline-block;
    align-self: flex-start;
    margin-top: auto;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .ps-green { background: var(--green-dim); color: var(--green); }
  .ps-yellow { background: #fef9c3; color: #ca8a04; }
  .ps-red { background: #fee2e2; color: #b91c1c; }

  .empty-state {
    padding: 42px 16px;
    text-align: center;
    color: var(--text-dim);
    font-size: 13px;
    font-style: italic;
  }

  .cta-panel {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    padding: 14px;
  }

  .promo-button,
  .home-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 700;
    text-decoration: none;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .promo-button {
    background: var(--green);
    color: var(--bg);
  }

  .promo-button:hover {
    background: #059669;
  }

  .home-button {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-muted);
  }

  .home-button:hover {
    border-color: var(--border-focus);
    background: var(--surface-hover);
    color: var(--text);
  }

  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(15, 23, 42, 0.88);
  }

  .lightbox-inner {
    position: relative;
    display: flex;
    width: calc(100vw - 48px);
    max-width: 960px;
    max-height: calc(100vh - 48px);
    overflow: hidden;
    border-radius: var(--radius);
    background: var(--bg);
    box-shadow: var(--shadow-lg);
  }

  .lightbox-left {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    width: 45%;
    border-right: 1px solid var(--border);
    overflow-y: auto;
  }

  .lightbox-right {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }

  .lightbox-img {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    object-fit: contain;
    background: var(--surface);
  }

  .lightbox-info {
    display: flex;
    flex: 1;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
  }

  .lightbox-text {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .lightbox-name {
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
  }

  .lightbox-components {
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.5;
  }

  .lightbox-nutrition {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 6px;
    padding: 10px 16px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .nutr-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 7px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    text-align: center;
  }

  .nutr-label {
    margin-bottom: 3px;
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.04em;
  }

  .nutr-value {
    color: var(--text);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .detail-loading {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 16px 14px;
    border-top: 1px solid var(--border);
    background: var(--surface);
  }

  .shimmer {
    height: 13px;
    border-radius: 3px;
    background: linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 50%, var(--surface) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  .detail-table-wrap {
    overflow-x: auto;
    border-top: 1px solid var(--border);
    background: var(--surface);
  }

  .detail-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .detail-table thead tr,
  .detail-table td {
    border-bottom: 1px solid var(--border);
  }

  .detail-table th,
  .detail-table td {
    padding: 8px;
  }

  .detail-table th {
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 600;
    text-align: left;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .detail-table tbody tr:last-child td {
    border-bottom: none;
  }

  .detail-col-name { min-width: 140px; }
  .detail-col-ps { width: 72px; text-align: center; }
  .detail-col-num { width: 80px; text-align: right; white-space: nowrap; }
  .dish-name { color: var(--text-muted); }
  .ps-na { color: var(--text-dim); font-size: 12px; }

  .lightbox-close {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    background: var(--text);
    color: var(--bg);
    font-size: 18px;
    transition: background 0.12s;
  }

  .lightbox-close:hover {
    background: var(--text-muted);
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .gallery-card,
    .image-wrap img,
    .promo-button,
    .home-button,
    .lightbox-close {
      transition: none;
    }

    .shimmer {
      animation: none;
    }
  }

  @media (max-width: 640px) {
    .hero-panel {
      padding: 14px;
    }

    h1 {
      font-size: 1.35rem;
    }

    .control-field,
    .date-input {
      width: 100%;
    }

    .all-day-pill {
      width: 100%;
      justify-content: center;
    }

    .meal-section-head {
      padding: 14px 12px 0;
    }

    .gallery-grid {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
      padding: 12px;
    }

    .cta-panel,
    .promo-button,
    .home-button {
      width: 100%;
    }

    .lightbox {
      padding: 16px;
    }

    .lightbox-inner {
      flex-direction: column;
      width: calc(100vw - 32px);
      max-height: calc(100vh - 32px);
      overflow-y: auto;
    }

    .lightbox-left {
      width: 100%;
      border-right: none;
      border-bottom: 1px solid var(--border);
      overflow-y: visible;
    }

    .lightbox-right {
      overflow-y: visible;
    }
  }
</style>
