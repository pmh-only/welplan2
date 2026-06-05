<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { page } from '$app/state'
  import MenuTable from '$lib/components/MenuTable.svelte'
  import { restaurantDatedPath, restaurantDetailPath } from '$lib/restaurant-routes'
  import type { MealTime, Menu, MenuComponent, NutritionInfo, Restaurant } from '$lib/types'
  import { fromInputDate, proxyImg, toInputDate } from '$lib/utils'
  import { X } from '@lucide/svelte'

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
  let menuKind = $state<'takein' | 'takeout'>('takein')

  const COOKIE = 'welplan_restaurants'

  function savedRestaurants (): Restaurant[] {
    if (typeof document === 'undefined') return []
    const raw = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
    if (!raw) return []
    try { return JSON.parse(decodeURIComponent(raw)) } catch { return [] }
  }

  function isRestaurantSaved (): boolean {
    return savedRestaurants().some((r) => r.id === data.restaurant.id)
  }

  let registered = $state(false)
  $effect(() => { registered = isRestaurantSaved() })

  function registerRestaurant () {
    if (registered) return
    const next = [...savedRestaurants(), data.restaurant]
    document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=31536000; SameSite=Lax`
    registered = true
    invalidateAll()
  }

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

  function sortedByCalories (components: MenuComponent[]): MenuComponent[] {
    return [...components].sort((a, b) => {
      const aCalories = a.nutrition?.calories ?? null
      const bCalories = b.nutrition?.calories ?? null
      if (aCalories === null && bCalories === null) return 0
      if (aCalories === null) return 1
      if (bCalories === null) return -1
      return bCalories - aCalories
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
    const aCalories = a.nutrition?.calories ?? 999999
    const bCalories = b.nutrition?.calories ?? 999999
    return aCalories - bCalories || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id, 'ko')
  }

  function mealTimeName (mealTimeId: string): string {
    return data.mealTimes.find((mealTime) => mealTime.id === mealTimeId)?.name ?? mealTimeId
  }

  const takeInMenus = $derived(data.menus.filter((menu) => !menu.isTakeOut))
  const takeOutMenus = $derived(data.menus.filter((menu) => menu.isTakeOut))
  const filteredMenus = $derived(menuKind === 'takeout' ? takeOutMenus : takeInMenus)
  const menuKindLabel = $derived(menuKind === 'takeout' ? '테이크 아웃' : '테이크 인')

  const gallerySections = $derived.by<GallerySection[]>(() => data.mealTimes
    .map((mealTime) => ({
      mealTime,
      info: data.mealTimeMenus.find((result) => result.id === mealTime.id),
      menus: filteredMenus
        .filter((menu) => menu.mealTimeId === mealTime.id)
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
    {#if menu.imageUrl}
      <link rel="preload" as="image" href={proxyImg(menu.imageUrl)} fetchpriority="high" />
    {/if}
  {/each}
  {@html `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Welplan', item: page.url.origin },
          { '@type': 'ListItem', position: 2, name: data.restaurant.name, item: page.url.href }
        ]
      },
      {
        '@type': 'FoodEstablishment',
        name: data.restaurant.name,
        servesCuisine: 'Korean',
        url: page.url.href
      }
    ]
  })}</script>`}
</svelte:head>

<article class="menu-page" aria-labelledby="restaurant-title">
  <section class="hero-panel">
    <h1 id="restaurant-title">{data.restaurant.name} 식단표</h1>
    <div class="controls-row" aria-label="메뉴 조회 조건">
      <label class="control-field" for="date-input">
        <input
          id="date-input"
          class="date-input"
          type="date"
          value={toInputDate(selectedDate)}
          oninput={(event) => navigate(fromInputDate(event.currentTarget.value))}
        />
      </label>
      <div class="kind-toggle" role="group" aria-label="식사 형태 선택">
        <button
          type="button"
          class:active={menuKind === 'takein'}
          aria-pressed={menuKind === 'takein'}
          onclick={() => { menuKind = 'takein' }}
        >
          테이크 인 <span>{takeInMenus.length}</span>
        </button>
        <button
          type="button"
          class:active={menuKind === 'takeout'}
          aria-pressed={menuKind === 'takeout'}
          onclick={() => { menuKind = 'takeout' }}
        >
          테이크 아웃 <span>{takeOutMenus.length}</span>
        </button>
      </div>
    </div>
  </section>

  {#if menuKind === 'takeout'}
    <section class="gallery-panel table-panel" aria-label={`${data.restaurant.name} ${menuKindLabel} 메뉴 표`}>
      <div class="section-head">
        <div class="section-head-left">
          <h2>{menuKindLabel}</h2>
          {#if takeOutMenus.length > 0}
            <span class="menu-count">{takeOutMenus.length}개</span>
          {/if}
        </div>
      </div>
      <MenuTable
        menus={takeOutMenus}
        restaurants={[data.restaurant]}
        mealTimes={data.mealTimes}
        date={data.date}
        time=""
        emptyMessage={`${menuKindLabel} 메뉴가 없습니다`}
        enableSelection={true}
        groupByMealTime={true}
      />
    </section>
  {:else}
  <section class="gallery-panel" aria-label={`${data.restaurant.name} ${menuKindLabel} 메뉴 사진`}>
    {#if galleryMenus.length === 0}
      <div class="empty-state">
        <p>{menuKindLabel} 메뉴가 없습니다.</p>
      </div>
    {:else}
      {#each gallerySections as section (section.mealTime.id)}
        <section class="meal-section" aria-labelledby={`meal-section-${section.mealTime.id}`}>
          <div class="meal-section-head">
            <div>
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
                <button class="gallery-card" type="button" onclick={() => openZoom(menu)} aria-label={`${section.mealTime.name} ${menu.name} 크게 보기`}>
                  <span class="image-wrap">
                    {#if menu.imageUrl}
                      <img src={proxyImg(menu.imageUrl)} alt={menu.name} loading={index === 0 ? 'eager' : 'lazy'} fetchpriority={index === 0 ? 'high' : 'auto'} />
                    {:else}
                      <span class="no-image-placeholder" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
                          <rect width="48" height="48" rx="6" fill="var(--surface)" />
                          <path d="M14 34l8-10 5 6 4-5 7 9H14z" fill="var(--border)" />
                          <circle cx="31" cy="18" r="4" fill="var(--border)" />
                        </svg>
                      </span>
                    {/if}
                  </span>
                  <span class="gallery-info">
                    <span class="meal-time-badge">{section.mealTime.name}</span>
                    <span class="menu-name">{menu.name}</span>
                    {#if menu.isTakeOut}<span class="takeout-badge">포장</span>{/if}
                    {#if menu.components.length > 0}
                      <span class="menu-components">{sortedByCalories(menu.components).map((component) => component.name).join(' · ')}</span>
                    {/if}
                    {#if menu.nutrition?.calories != null}
                      <span class="kcal-badge">{Math.round(menu.nutrition.calories)} kcal</span>
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
  {/if}

  <section class="cta-panel" aria-label="Welplan 식당 등록 안내">
    <div class="promo-bg-circle" aria-hidden="true"></div>
    <div class="promo-content">
      <p class="promo-eyebrow">
        <span class="promo-dot" aria-hidden="true"></span>Welplan
      </p>
      <p class="promo-headline">내 회사 식당을 등록하고<br />손쉽게 확인해 보세요</p>
      <p class="promo-desc">웰스토리·신세계푸드 식당을 등록하면 오늘의 메뉴와 영양 정보를 한눈에 볼 수 있습니다.</p>
    </div>
    {#if registered}
      <a class="register-button register-button-done" href="/restaurants">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" aria-hidden="true" class="register-icon">
          <path d="M3 8.5l3.5 3.5 6.5-7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        등록됨 · 내 식당 보기
      </a>
    {:else}
      <button class="register-button" type="button" onclick={registerRestaurant}>
        식당 등록하기
        <svg class="register-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    {/if}
  </section>
</article>

{#if zoomedMenu}
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
        {#if zoomedMenu.imageUrl}
          <img class="lightbox-img" src={proxyImg(zoomedMenu.imageUrl)} alt={zoomedMenu.name} />
        {/if}
        <div class="lightbox-info">
          <div class="lightbox-text">
            <span class="meal-time-badge">{mealTimeName(zoomedMenu.mealTimeId)}</span>
            <span class="lightbox-name">{zoomedMenu.name}</span>
            {#if zoomedMenu.isTakeOut}<span class="takeout-badge">포장</span>{/if}
            {#if zoomedMenu.components.length > 0}
              <span class="lightbox-components">{sortedByCalories(zoomedMenu.components).map((component) => component.name).join(' · ')}</span>
            {/if}
          </div>
          {#if zoomedMenu.nutrition?.calories != null}
            <span class="kcal-badge">{Math.round(zoomedMenu.nutrition.calories)} kcal</span>
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
        {:else if zoomedMenu.vendor === 'shinsegae'}
          <p class="detail-empty">(신세계푸드 식당은 상세 메뉴 정보를 제공하지 않습니다)</p>
        {:else if detail.length > 0}
          {@const detailRows = detailRowsFor(zoomedMenu)}
          {@const detailMetrics = activeDetailNutrients(detailRows)}
          <div class="detail-table-wrap">
            <table class="detail-table">
              <thead>
                <tr>
                  <th class="detail-col-name">항목</th>
                  {#each detailMetrics as { label }}
                    <th class="detail-col-num">{label}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each detailRows as dish}
                  {@const nutrition = dish.nutrition}
                  <tr>
                    <td class="detail-col-name dish-name">{dish.name}</td>
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
      <button class="lightbox-close" onclick={closeZoom} aria-label="닫기">
        <X class="lightbox-close-icon" aria-hidden="true" />
      </button>
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

  .kind-toggle {
    display: inline-flex;
    min-height: 36px;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
  }

  .kind-toggle button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, box-shadow 0.12s;
  }

  .kind-toggle button.active {
    background: var(--bg);
    color: var(--green);
    box-shadow: var(--shadow-sm);
  }

  .kind-toggle span {
    color: var(--text-dim);
    font-size: 11px;
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

  .table-panel {
    background: var(--bg);
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--border);
  }

  .section-head-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .section-head h2 {
    padding-left: 10px;
    border-left: 3px solid var(--green);
    font-size: 0.95rem;
    font-weight: 600;
  }

  .menu-count {
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--surface);
    color: var(--text-dim);
    font-size: 12px;
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

  .no-image-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
  }

  .no-image-placeholder svg {
    width: 60%;
    height: 60%;
    opacity: 0.5;
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

  .kcal-badge {
    display: inline-block;
    align-self: flex-start;
    margin-top: auto;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .takeout-badge {
    display: inline-flex;
    align-self: flex-start;
    padding: 2px 7px;
    border-radius: 999px;
    background: #fff7ed;
    border: 1px solid #fed7aa;
    color: #c2410c;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.4;
    white-space: nowrap;
  }

  .empty-state {
    padding: 42px 16px;
    text-align: center;
    color: var(--text-dim);
    font-size: 13px;
    font-style: italic;
  }

  .cta-panel {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 20px;
    padding: 28px 28px;
    overflow: hidden;
    background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 50%, #f8fafc 100%);
    border-color: #86efac;
  }

  .promo-bg-circle {
    position: absolute;
    top: -60px;
    right: -60px;
    width: 200px;
    height: 200px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, transparent 70%);
    pointer-events: none;
  }

  .promo-content {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .promo-eyebrow {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #059669;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .promo-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green);
    flex-shrink: 0;
  }

  .promo-headline {
    color: #064e3b;
    font-size: 1.1rem;
    font-weight: 700;
    line-height: 1.4;
    letter-spacing: -0.02em;
  }

  .promo-desc {
    color: #065f46;
    font-size: 12px;
    line-height: 1.6;
    opacity: 0.75;
  }

  .register-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    justify-content: center;
    flex-shrink: 0;
    min-height: 42px;
    padding: 0 20px;
    border-radius: 999px;
    background: #059669;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(5, 150, 105, 0.35);
    transition: background 0.12s, box-shadow 0.12s, transform 0.12s;
  }

  .register-button:hover {
    background: #047857;
    box-shadow: 0 4px 14px rgba(5, 150, 105, 0.45);
    transform: translateY(-1px);
  }

  .register-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .register-button-done {
    background: #047857;
    box-shadow: none;
    cursor: default;
  }

  .register-button-done:hover {
    background: #065f46;
    transform: none;
    box-shadow: none;
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
  .detail-empty {
    padding: 12px 16px 14px;
    border-top: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-dim);
    font-size: 12px;
    font-style: italic;
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
  .detail-col-num { width: 80px; text-align: right; white-space: nowrap; }
  .dish-name { color: var(--text-muted); }

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
    transition: background 0.12s;
  }

  :global(.lightbox-close-icon) {
    width: 17px;
    height: 17px;
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
    .register-button,
    .lightbox-close {
      transition: none;
      transform: none;
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

    .cta-panel {
      flex-direction: column;
    }

    .register-button {
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
