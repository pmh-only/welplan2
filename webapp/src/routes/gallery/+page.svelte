<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import { afterNavigate, goto } from '$app/navigation'
  import { trackEvent } from '$lib/analytics'
  import { createDialogHistory } from '$lib/dialog-history'
  import LiveImage from '$lib/components/LiveImage.svelte'
  import { isPhotoOlderThanRetention } from '$lib/image-retention'
  import { replaceMenuImages } from '$lib/live-menu-images'
  import { normalizeMenuOccurrenceName } from '$lib/menu-occurrences'
  import { menuReviewKey, menuReviewNormalizedName, type MenuReviewSummary } from '$lib/menu-reviews'
  import { ALL_MEAL_TIME_ID, autoSelectMealTime, fallbackMealTime, hasNutritionInfo, proxyImg, shiftDate, toInputDate, fromInputDate } from '$lib/utils'
  import type { MealTime, Menu, MenuComponent, NutritionInfo } from '$lib/types'
  import type { PageData } from './$types'
  import { ChevronDown, ChevronLeft, ChevronRight, Star, Utensils, X, ZoomIn } from '@lucide/svelte'

  type NutritionKey = keyof NutritionInfo
  type NutrientDef = { key: NutritionKey; label: string; unit: string }
  type GalleryMenu = Menu & { restaurantIds: string[] }
  type GallerySection = { mealTime: MealTime; menus: GalleryMenu[] }
  type ReviewQueryResponse = { token: string; summaries: Record<string, MenuReviewSummary> }

  const REVIEW_STORAGE_KEY = 'welplan.review-session.v1'

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
    { key: 'calcium', label: '칼슘', unit: 'mg' },
  ]

  function formatMetric (value: number | undefined, unit = ''): string {
    if (value == null) return '—'
    const display = Math.round(value).toLocaleString()
    return `${display}${unit}`
  }

  function activeNutrients (n: NutritionInfo | undefined): NutrientDef[] {
    if (!hasNutritionInfo(n)) return []
    return nutrientDefs.filter(({ key }) => n[key] != null)
  }

  let { data }: { data: PageData & { menuOccurrenceCounts?: Record<string, number> } } = $props()

  let sortBy = $state<'calories-asc' | 'calories-desc' | 'name-asc' | 'name-desc' | 'restaurant-asc'>('calories-asc')
  let zoomedMenu = $state<GalleryMenu | null>(null)
  let detail = $state<MenuComponent[]>([])
  let loadingDetail = $state(false)
  let brokenImageSrcs = $state<string[]>([])
  let imageRefreshKey = $state('')
  let reviewSummaries = $state<Record<string, MenuReviewSummary>>({})
  let reviewSubmittingKey = $state<string | null>(null)
  let reviewFeedback = $state('')
  let liveRefreshKey = ''
  let reviewQueryKey = ''
  const zoomHistory = createDialogHistory(() => {
    if (zoomedMenu) trackEvent('Gallery Menu Closed', { vendor: zoomedMenu.vendor, mealTimeId: zoomedMenu.mealTimeId })
    zoomedMenu = null
    detail = []
  })

  onDestroy(() => zoomHistory.destroy())
  let expandedMealTimeIds = $state<string[]>(
    untrack(() =>
      (data as typeof data & { time: string }).time === ALL_MEAL_TIME_ID
        ? [autoSelectMealTime(data.mealTimes)].filter((id): id is string => id != null)
        : []
    )
  )

  function normalizeMenuName (name: string): string {
    return name.replace(/\s*포장$/, '').trim()
  }

  function detailRowsFor (menu: Menu): MenuComponent[] {
    if (detail.length <= 1) return detail
    const normalizedMenuName = normalizeMenuName(menu.name)
    const rows = detail.filter((dish) => !(normalizeMenuName(dish.name) === normalizedMenuName && !hasNutritionInfo(dish.nutrition)))
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

  function activeDetailNutrients (rows: MenuComponent[]): NutrientDef[] {
    return nutrientDefs.filter(({ key }) => rows.some((row) => hasNutritionInfo(row.nutrition) && row.nutrition?.[key] != null))
  }

  function hasMenuImage (menu: Menu): boolean {
    return Boolean(proxyImg(menu.imageUrl, imageRefreshKey, menu.date))
  }

  function isImageAvailable (src: string | undefined): src is string {
    return Boolean(src && !brokenImageSrcs.includes(src))
  }

  function availableImageSrc (menu: Menu): string | undefined {
    const src = proxyImg(menu.imageUrl, imageRefreshKey, menu.date)
    return isImageAvailable(src) ? src : undefined
  }

  function markImageBroken (src: string | undefined) {
    if (!src || brokenImageSrcs.includes(src)) return
    brokenImageSrcs = [...brokenImageSrcs, src]
  }

  async function openZoom (menu: GalleryMenu) {
    trackEvent('Gallery Menu Opened', { vendor: menu.vendor, mealTimeId: menu.mealTimeId, hasImage: menu.imageUrl ? 1 : 0 })
    zoomedMenu = menu
    zoomHistory.open()
    detail = []
    loadingDetail = false
    reviewFeedback = ''

    if (menu.vendor === 'welstory' && menu.hallNo && menu.courseType) {
      loadingDetail = true
      try {
        const params = new URLSearchParams({
          date: selectedDate,
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

  function closeZoom () { zoomHistory.close() }

  function storedReviewToken (): string {
    try {
      return localStorage.getItem(REVIEW_STORAGE_KEY) ?? ''
    } catch {
      return ''
    }
  }

  function storeReviewToken (token: string) {
    try {
      localStorage.setItem(REVIEW_STORAGE_KEY, token)
    } catch {
      // The HttpOnly cookie remains the source of truth when storage is unavailable.
    }
  }

  async function reviewRequest (path: string, body: unknown): Promise<Response> {
    const token = storedReviewToken()
    return fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Review-Session': token } : {})
      },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    })
  }

  async function loadReviewSummaries (menus: GalleryMenu[]) {
    const menuKeys = menus.map(menuReviewKey)
    const queryKey = menuKeys.join('|')
    if (!queryKey || queryKey === reviewQueryKey) return
    reviewQueryKey = queryKey
    try {
      const response = await reviewRequest('/api/menu-reviews/query', { menuKeys })
      if (!response.ok) throw new Error()
      const result = await response.json() as ReviewQueryResponse
      storeReviewToken(result.token)
      reviewSummaries = result.summaries
    } catch {
      reviewQueryKey = ''
    }
  }

  function reviewSummary (menu: GalleryMenu): MenuReviewSummary | undefined {
    return reviewSummaries[menuReviewKey(menu)]
  }

  function menuOccurrenceCount (menu: GalleryMenu): number | undefined {
    return data.menuOccurrenceCounts?.[normalizeMenuOccurrenceName(menu.name)]
  }

  function applyReviewSummary(menuKey: string, summary: MenuReviewSummary) {
    const normalizedName = menuReviewNormalizedName(menuKey)
    const next = { ...reviewSummaries }
    for (const menu of galleryMenus) {
      const key = menuReviewKey(menu)
      if (menuReviewNormalizedName(key) !== normalizedName) continue
      const userRating = key === menuKey ? summary.userRating : next[key]?.userRating
      next[key] = {
        average: summary.average,
        count: summary.count,
        ...(userRating == null ? {} : { userRating })
      }
    }
    reviewSummaries = next
  }

  async function submitReview (menu: GalleryMenu, rating: number) {
    const menuKey = menuReviewKey(menu)
    if (reviewSubmittingKey || reviewSummaries[menuKey]?.userRating) return
    reviewSubmittingKey = menuKey
    reviewFeedback = ''
    try {
      const response = await reviewRequest('/api/menu-reviews', {
        menuKey,
        menuName: menu.name,
        menuDate: menu.date,
        mealTimeId: menu.mealTimeId,
        rating
      })
      const result = await response.json().catch(() => ({})) as { token?: string; summary?: MenuReviewSummary; error?: string }
      if (!response.ok || !result.summary || !result.token) throw new Error(result.error ?? '별점을 저장하지 못했습니다.')
      storeReviewToken(result.token)
      applyReviewSummary(menuKey, result.summary)
      reviewFeedback = '별점이 등록되었습니다.'
      trackEvent('Gallery Menu Reviewed', { rating, mealTimeId: menu.mealTimeId, vendor: menu.vendor })
    } catch (error) {
      reviewFeedback = error instanceof Error ? error.message : '별점을 저장하지 못했습니다.'
      trackEvent('Gallery Menu Review Failed', { rating, mealTimeId: menu.mealTimeId, vendor: menu.vendor })
    } finally {
      reviewSubmittingKey = null
    }
  }

  function onKeydown (e: KeyboardEvent) {
    if (zoomedMenu && e.key === 'Escape') closeZoom()
  }
  const selectedDate = $derived((data as typeof data & { date: string }).date)
  const selectedTime = $derived((data as typeof data & { time: string }).time)
  const isAllMealTime = $derived(selectedTime === ALL_MEAL_TIME_ID)
  let previousExpansionDate = untrack(() => selectedDate)
  const expansionContext = $derived(
    `${selectedDate}:${selectedTime}:${data.restaurants.map((restaurant) => restaurant.id).join(',')}`
  )

  function liveRefreshUrl(): string {
    return `/api/menu/live?${new URLSearchParams({ kind: 'gallery', date: selectedDate, time: selectedTime })}`
  }

  function hasUsableLiveImages(liveData: PageData | null): liveData is PageData {
    return Boolean(liveData?.menus.length)
  }

  async function refreshLiveImages(): Promise<void> {
    if (data.restaurants.length === 0 || isPhotoOlderThanRetention(selectedDate)) return

    const key = `gallery:${selectedDate}:${selectedTime}`
    if (liveRefreshKey === key) return
    liveRefreshKey = key

    try {
      const response = await fetch(liveRefreshUrl(), { cache: 'no-store', credentials: 'same-origin' })
      const liveData: PageData | null = response.ok ? await response.json() : null
      if (hasUsableLiveImages(liveData)) {
        const menus = replaceMenuImages(data.menus, liveData.menus)
        if (menus !== data.menus) data = { ...data, menus }
        imageRefreshKey = String(Date.now())
      }
    } catch {
      // Keep the cached images visible when live refresh fails.
    }
  }

  $effect(() => {
    const _context = expansionContext
    const expandDefault = isAllMealTime
    const dateChanged = selectedDate !== previousExpansionDate
    untrack(() => {
      previousExpansionDate = selectedDate
      if (!expandDefault) expandedMealTimeIds = []
      else if (dateChanged) expandedMealTimeIds = gallerySections.map((section) => section.mealTime.id)
      else expandedMealTimeIds = defaultExpandedMealTimeIds()
    })
  })

  afterNavigate(() => {
    void refreshLiveImages()
  })

  function navigate (date: string, time: string, source: string) {
    trackEvent('Gallery Navigation Changed', { date, mealTimeId: time, source })
    const params = new URLSearchParams({ date, time })
    goto(`/gallery?${params}`)
  }

  function restaurantName (id: string): string {
    return data.restaurants.find((r: { id: string }) => r.id === id)?.name ?? id
  }

  function galleryMealTime(mealTimeId: string): MealTime {
    return data.mealTimes.find((mealTime: MealTime) => mealTime.id === mealTimeId) ?? fallbackMealTime(mealTimeId)
  }

  function defaultExpandedMealTimeIds (): string[] {
    const currentMealTimeId = autoSelectMealTime(data.mealTimes)
    return currentMealTimeId ? [currentMealTimeId] : galleryMenus[0]?.mealTimeId ? [galleryMenus[0].mealTimeId] : []
  }

  function isMealTimeExpanded (mealTimeId: string): boolean {
    return expandedMealTimeIds.includes(mealTimeId)
  }

  function toggleMealTime (mealTimeId: string) {
    trackEvent('Gallery Meal Time Toggled', { mealTimeId, expanded: isMealTimeExpanded(mealTimeId) ? 0 : 1 })
    if (isMealTimeExpanded(mealTimeId)) {
      expandedMealTimeIds = expandedMealTimeIds.filter((id) => id !== mealTimeId)
    } else {
      expandedMealTimeIds = [...expandedMealTimeIds, mealTimeId]
    }
  }

  function compareMenus (a: Menu, b: Menu): number {
    const aCalories = a.nutrition?.calories ?? 999999
    const bCalories = b.nutrition?.calories ?? 999999

    switch (sortBy) {
      case 'calories-asc': return aCalories - bCalories
      case 'calories-desc': return bCalories - aCalories
      case 'name-asc': return a.name.localeCompare(b.name, 'ko')
      case 'name-desc': return b.name.localeCompare(a.name, 'ko')
      case 'restaurant-asc': return restaurantName(a.restaurantId).localeCompare(restaurantName(b.restaurantId), 'ko')
    }
  }

  function galleryMenuKey (menu: Menu): string {
    const nameKey = menu.name.trim().toLowerCase()
    return isAllMealTime ? `${menu.mealTimeId}:${nameKey}` : nameKey
  }

  const galleryMenus = $derived.by(() => {
    const uniqueMenus = new Map<string, Menu>()
    const allRestaurantIds = new Map<string, Set<string>>()

    for (const menu of data.menus as Menu[]) {
      if (menu.name.includes('죽')) continue
      if (!hasMenuImage(menu) && menu.isTakeOut) continue
      if (menu.isTakeOut && !menu.name.includes('도시락')) continue

      const key = galleryMenuKey(menu)
      const existing = uniqueMenus.get(key)
      if (!existing || (menu.imageUrl?.length ?? 0) > (existing.imageUrl?.length ?? 0)) {
        uniqueMenus.set(key, menu)
      }
      if (!allRestaurantIds.has(key)) allRestaurantIds.set(key, new Set())
      allRestaurantIds.get(key)!.add(menu.restaurantId)
    }

    return [...uniqueMenus.values()].sort(compareMenus).map((menu) => {
      const key = galleryMenuKey(menu)
      return { ...menu, restaurantIds: [...(allRestaurantIds.get(key) ?? [menu.restaurantId])] }
    })
  })

  const gallerySections = $derived.by<GallerySection[]>(() => {
    if (!isAllMealTime) return []

    const mealTimeIds = [
      ...data.mealTimes.map((mealTime: MealTime) => mealTime.id),
      ...galleryMenus.map((menu) => menu.mealTimeId)
    ]

    return [...new Set(mealTimeIds)].flatMap((mealTimeId) => {
      const mealTime = galleryMealTime(mealTimeId)
      const menus = galleryMenus.filter((menu) => menu.mealTimeId === mealTime.id)
      if (menus.length === 0) return []
      return [{ mealTime, menus }]
    })
  })

  function restaurantNames (ids: string[]): string {
    return ids.map(restaurantName).join(', ')
  }

  $effect(() => {
    const menus = galleryMenus
    untrack(() => void loadReviewSummaries(menus))
  })

</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head>
  {#each (data.menus as Menu[]).filter((m) => m.imageUrl && !m.isTakeOut).slice(0, 1) as menu}
    <link rel="preload" as="image" href={proxyImg(menu.imageUrl, imageRefreshKey, menu.date)} fetchpriority="high" />
  {/each}
</svelte:head>

<header class="gallery-intro">
  <p class="gallery-eyebrow">오늘의 구내식당</p>
  <h1>웰스토리·신세계푸드 오늘 메뉴</h1>
  <p>선택한 식당의 날짜별 식단표와 메뉴 사진, 칼로리 및 영양정보를 한눈에 확인하세요.</p>
</header>

<div class="section">
  <div class="section-head">
    <div class="section-head-left">
      <h2>갤러리</h2>
      <span class="count-badge">{galleryMenus.length}개</span>
    </div>
    <div class="controls">
      {#if data.restaurants.length > 0}
        <div class="date-row">
          <button class="date-nav-btn" type="button" onclick={() => navigate(shiftDate(selectedDate, -1), selectedTime, 'previous_day')} aria-label="이전 날">
            <ChevronLeft class="date-nav-icon" aria-hidden="true" />
          </button>
          <input
            class="date-input"
            type="date"
            aria-label="날짜 선택"
            value={toInputDate(selectedDate)}
            oninput={(e) => navigate(fromInputDate(e.currentTarget.value), selectedTime, 'date_input')}
          />
          <button class="date-nav-btn" type="button" onclick={() => navigate(shiftDate(selectedDate, 1), selectedTime, 'next_day')} aria-label="다음 날">
            <ChevronRight class="date-nav-icon" aria-hidden="true" />
          </button>
        </div>
        <select class="select-input" aria-label="식사 시간" value={selectedTime} onchange={(e) => navigate(selectedDate, e.currentTarget.value, 'meal_time_select')}>
          <option value={ALL_MEAL_TIME_ID}>전체</option>
          {#each data.mealTimes as mealTime (mealTime.id)}
            <option value={mealTime.id}>{mealTime.name}</option>
          {/each}
        </select>
      {/if}
      <select class="sort-select" bind:value={sortBy} aria-label="정렬 기준" onchange={() => trackEvent('Gallery Sort Changed', { sort: sortBy })}>
        <option value="calories-asc">칼로리 낮은순</option>
        <option value="calories-desc">칼로리 높은순</option>
        <option value="name-asc">메뉴명 A-Z</option>
        <option value="name-desc">메뉴명 Z-A</option>
        <option value="restaurant-asc">식당명 A-Z</option>
      </select>
    </div>
  </div>

  {#if data.restaurants.length === 0}
    <div class="hint-block">
      <p class="hint"><a href="/restaurants">식당 선택</a>에서 식당을 추가하면 갤러리가 표시됩니다</p>
    </div>
  {:else}
    {#if galleryMenus.length === 0}
      <div class="hint-block">
        <p class="hint">표시할 메뉴가 없습니다.</p>
      </div>
    {:else if isAllMealTime}
      <div class="gallery-sections">
        {#each gallerySections as section (section.mealTime.id)}
          {@const isExpanded = isMealTimeExpanded(section.mealTime.id)}
          <section class="gallery-meal-section" aria-labelledby={`gallery-meal-${section.mealTime.id}`}>
            <button
              type="button"
              class="meal-section-head"
              aria-expanded={isExpanded}
              aria-controls={`gallery-meal-panel-${section.mealTime.id}`}
              onclick={() => toggleMealTime(section.mealTime.id)}
            >
              {#if isExpanded}
                <ChevronDown class="meal-section-caret" aria-hidden="true" />
              {:else}
                <ChevronRight class="meal-section-caret" aria-hidden="true" />
              {/if}
              <span class="meal-section-title" id={`gallery-meal-${section.mealTime.id}`}>{section.mealTime.name}</span>
              <span>{section.menus.length}개</span>
            </button>
            {#if isExpanded}
              <div class="gallery-grid" id={`gallery-meal-panel-${section.mealTime.id}`}>
                {#each section.menus as menu, i (`${menu.mealTimeId}:${menu.id}`)}
                  {@const occurrenceCount = menuOccurrenceCount(menu)}
                  <div class="gallery-card" role="button" tabindex="0" onclick={() => openZoom(menu)} onkeydown={(e) => e.key === 'Enter' && openZoom(menu)}>
                    <div class="gallery-img-wrap">
                      {#if isImageAvailable(proxyImg(menu.imageUrl, imageRefreshKey, menu.date))}
                        <LiveImage fill imageClass="gallery-img" src={proxyImg(menu.imageUrl, imageRefreshKey, menu.date)!} alt={menu.name} loading={i === 0 ? 'eager' : 'lazy'} fetchpriority={i === 0 ? 'high' : 'auto'} onerror={markImageBroken} />
                        <span class="zoom-indicator" aria-hidden="true">
                          <ZoomIn class="zoom-indicator-icon" />
                        </span>
                      {:else}
                        <div class="gallery-placeholder" aria-label={`${menu.name} 이미지 준비중`}>
                          <span class="placeholder-icon" aria-hidden="true">
                            <Utensils class="placeholder-icon-svg" />
                          </span>
                          <span>이미지 준비중</span>
                        </div>
                      {/if}
                    </div>
                    <div class="gallery-info">
                      <span class="gallery-name">{menu.name}</span>
                      <div class="gallery-signals">
                        <span class="gallery-rating">
                          <Star aria-hidden="true" fill={reviewSummary(menu)?.count ? 'currentColor' : 'none'} />
                          {reviewSummary(menu)?.count ? `${reviewSummary(menu)?.average.toFixed(1)} (${reviewSummary(menu)?.count})` : '별점 없음'}
                        </span>
                        {#if occurrenceCount !== undefined}<span class="gallery-occurrences">최근 한 달 {occurrenceCount}회</span>{/if}
                      </div>
                      {#if menu.components.length > 0}
                        <span class="gallery-components">{sortedByCalories(menu.components).map((c) => c.name).join(' · ')}</span>
                      {:else if menu.vendor === 'shinsegae'}
                        <span class="gallery-components gallery-detail-unavailable">(신세계푸드 식당은 상세 메뉴 정보를 제공하지 않습니다)</span>
                      {/if}
                      <div class="gallery-meta">
                        {#if hasNutritionInfo(menu.nutrition) && menu.nutrition?.calories != null}
                          <span class="kcal-badge">{formatMetric(menu.nutrition.calories, ' kcal')}</span>
                        {:else}
                          <span class="nutrition-unavailable-badge">(영양 정보 없음)</span>
                        {/if}
                        <span class="gallery-restaurant">{restaurantNames(menu.restaurantIds)}</span>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </section>
        {/each}
      </div>
    {:else}
      <div class="gallery-grid">
        {#each galleryMenus as menu, i (`${menu.mealTimeId}:${menu.id}`)}
          {@const occurrenceCount = menuOccurrenceCount(menu)}
          <div class="gallery-card" role="button" tabindex="0" onclick={() => openZoom(menu)} onkeydown={(e) => e.key === 'Enter' && openZoom(menu)}>
            <div class="gallery-img-wrap">
                {#if isImageAvailable(proxyImg(menu.imageUrl, imageRefreshKey, menu.date))}
                  <LiveImage fill imageClass="gallery-img" src={proxyImg(menu.imageUrl, imageRefreshKey, menu.date)!} alt={menu.name} loading={i === 0 ? 'eager' : 'lazy'} fetchpriority={i === 0 ? 'high' : 'auto'} onerror={markImageBroken} />
                  <span class="zoom-indicator" aria-hidden="true">
                    <ZoomIn class="zoom-indicator-icon" />
                  </span>
              {:else}
                <div class="gallery-placeholder" aria-label={`${menu.name} 이미지 준비중`}>
                  <span class="placeholder-icon" aria-hidden="true">
                    <Utensils class="placeholder-icon-svg" />
                  </span>
                  <span>이미지 준비중</span>
                </div>
              {/if}
            </div>
            <div class="gallery-info">
              <span class="gallery-name">{menu.name}</span>
              <div class="gallery-signals">
                <span class="gallery-rating">
                  <Star aria-hidden="true" fill={reviewSummary(menu)?.count ? 'currentColor' : 'none'} />
                  {reviewSummary(menu)?.count ? `${reviewSummary(menu)?.average.toFixed(1)} (${reviewSummary(menu)?.count})` : '별점 없음'}
                </span>
                {#if occurrenceCount !== undefined}<span class="gallery-occurrences">최근 한 달 {occurrenceCount}회</span>{/if}
              </div>
              {#if menu.components.length > 0}
                <span class="gallery-components">{sortedByCalories(menu.components).map((c) => c.name).join(' · ')}</span>
              {:else if menu.vendor === 'shinsegae'}
                <span class="gallery-components gallery-detail-unavailable">(신세계푸드 식당은 상세 메뉴 정보를 제공하지 않습니다)</span>
              {/if}
              <div class="gallery-meta">
                {#if hasNutritionInfo(menu.nutrition) && menu.nutrition?.calories != null}
                  <span class="kcal-badge">{formatMetric(menu.nutrition.calories, ' kcal')}</span>
                {:else}
                  <span class="nutrition-unavailable-badge">(영양 정보 없음)</span>
                {/if}
                <span class="gallery-restaurant">{restaurantNames(menu.restaurantIds)}</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

{#if zoomedMenu}
  {@const occurrenceCount = menuOccurrenceCount(zoomedMenu)}
  <div
    class="lightbox"
    role="button"
    tabindex="0"
    aria-label="닫기"
    onclick={closeZoom}
    onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && closeZoom()}
  >
    <div
      class="lightbox-inner"
      role="presentation"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="lightbox-left">
        {#if isImageAvailable(proxyImg(zoomedMenu.imageUrl, imageRefreshKey, zoomedMenu.date))}
          <div class="lightbox-image-frame">
            <LiveImage imageClass="lightbox-img" src={proxyImg(zoomedMenu.imageUrl, imageRefreshKey, zoomedMenu.date)!} alt={zoomedMenu.name} onerror={markImageBroken} />
            <a class="lightbox-open-link" href={proxyImg(zoomedMenu.imageUrl, imageRefreshKey, zoomedMenu.date)} target="_blank" rel="noreferrer" onclick={(e) => { e.stopPropagation(); trackEvent('Gallery Menu Image Opened Externally', { vendor: zoomedMenu!.vendor, mealTimeId: zoomedMenu!.mealTimeId }) }}>
              더 크게 보기
            </a>
          </div>
        {:else}
          <div class="lightbox-img lightbox-placeholder" aria-label={`${zoomedMenu.name} 이미지 준비중`}>
            <span class="placeholder-icon" aria-hidden="true">
              <Utensils class="placeholder-icon-svg" />
            </span>
            <span>이미지 준비중</span>
          </div>
        {/if}
        <div class="lightbox-info">
          <div class="lightbox-text">
            <span class="lightbox-name">{zoomedMenu.name}</span>
            {#if zoomedMenu.components.length > 0}
              <span class="lightbox-components">{sortedByCalories(zoomedMenu.components).map((c) => c.name).join(' · ')}</span>
            {/if}
            <span class="lightbox-restaurant">{restaurantNames(zoomedMenu.restaurantIds)}</span>
          </div>
          {#if hasNutritionInfo(zoomedMenu.nutrition) && zoomedMenu.nutrition?.calories != null}
            <span class="kcal-badge">{formatMetric(zoomedMenu.nutrition.calories, ' kcal')}</span>
          {:else}
            <span class="nutrition-unavailable-badge">(영양 정보 없음)</span>
          {/if}
        </div>
      </div>
      <div class="lightbox-right">
        <div class="review-panel">
          <div class="review-copy">
            <strong>이 메뉴는 어떠셨나요?</strong>
            {#if reviewSummary(zoomedMenu)?.count}
              <span>평균 {reviewSummary(zoomedMenu)?.average.toFixed(1)} · {reviewSummary(zoomedMenu)?.count}명 참여{occurrenceCount === undefined ? '' : ` · 최근 한 달 ${occurrenceCount}회`}</span>
            {:else}
              <span>첫 별점을 남겨주세요.{occurrenceCount === undefined ? '' : ` · 최근 한 달 ${occurrenceCount}회`}</span>
            {/if}
          </div>
          <div class="review-stars" role="group" aria-label={`${zoomedMenu.name} 별점`}>
            {#each [1, 2, 3, 4, 5] as rating}
              <button
                type="button"
                aria-label={`${rating}점`}
                aria-pressed={reviewSummary(zoomedMenu)?.userRating === rating}
                disabled={Boolean(reviewSummary(zoomedMenu)?.userRating) || reviewSubmittingKey === menuReviewKey(zoomedMenu)}
                class:rated={(reviewSummary(zoomedMenu)?.userRating ?? 0) >= rating}
                onclick={() => void submitReview(zoomedMenu!, rating)}
              >
                <Star aria-hidden="true" fill={(reviewSummary(zoomedMenu)?.userRating ?? 0) >= rating ? 'currentColor' : 'none'} />
              </button>
            {/each}
          </div>
          {#if reviewSummary(zoomedMenu)?.userRating}
            <span class="review-status">{reviewSummary(zoomedMenu)?.userRating}점을 남겼습니다.</span>
          {:else if reviewFeedback}
            <span class="review-status">{reviewFeedback}</span>
          {/if}
        </div>
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
          {#if detailMetrics.length > 0}
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
                    {@const dn = dish.nutrition}
                    {@const hasDishNutrition = hasNutritionInfo(dn)}
                    <tr>
                      <td class="detail-col-name dish-name">{dish.name}</td>
                      {#if hasDishNutrition}
                        {#each detailMetrics as { key, unit }}
                          <td class="detail-col-num">{formatMetric(dn?.[key], unit)}</td>
                        {/each}
                      {:else}
                        <td class="detail-col-num nutrition-unavailable" colspan={detailMetrics.length}>(영양 정보 없음)</td>
                      {/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <p class="detail-empty">(영양 정보 없음)</p>
          {/if}
        {/if}
      </div>
      <button class="lightbox-close" onclick={closeZoom} aria-label="닫기">
        <X class="lightbox-close-icon" aria-hidden="true" />
      </button>
    </div>
  </div>
{/if}

<style>
  .gallery-intro {
    margin-bottom: 14px;
    padding: 22px 24px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: linear-gradient(135deg, var(--hero-green-start) 0%, var(--card) 70%);
    box-shadow: var(--shadow-sm);
  }
  .gallery-eyebrow {
    margin-bottom: 6px;
    color: var(--green-dark);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  .gallery-intro h1 {
    color: var(--text);
    font-size: clamp(1.35rem, 3vw, 1.8rem);
    line-height: 1.3;
  }
  .gallery-intro > p:last-child {
    margin-top: 8px;
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.6;
  }

  .section {
    background: var(--card);
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
    flex-wrap: wrap;
    gap: 10px;
    background: var(--card);
  }
  .section-head-left { display: flex; align-items: center; gap: 10px; }
  .section-head h2 {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    padding-left: 10px;
    border-left: 3px solid var(--green);
  }
  .count-badge { font-size: 12px; color: var(--text-muted); background: var(--surface); padding: 2px 8px; border-radius: 20px; border: 1px solid var(--border); }

  .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

  .date-row { display: flex; align-items: center; gap: 4px; }

  .date-nav-btn {
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text-muted);
    line-height: 1;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .date-nav-btn:hover { background: var(--surface-hover); color: var(--text); }
  :global(.date-nav-icon) { width: 16px; height: 16px; }

  .sort-select,
  .select-input,
  .date-input {
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text);
    background: var(--bg);
    outline: none;
    transition: border-color 0.12s;
  }
  .sort-select:focus, .select-input:focus, .date-input:focus { border-color: var(--border-focus); }

  .hint-block { padding: 32px 16px; text-align: center; }
  .hint { font-size: 13px; color: var(--text-dim); font-style: italic; }
  .hint a { color: var(--accent); text-decoration: none; }
  .hint a:hover { text-decoration: underline; }

  .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; padding: 16px; }
  .gallery-sections { display: flex; flex-direction: column; }
  .gallery-meal-section + .gallery-meal-section { border-top: 1px solid var(--border); }
  .meal-section-head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border: 0;
    background: var(--surface);
    cursor: pointer;
    text-align: left;
  }
  .meal-section-head:hover { background: var(--surface-hover); }
  :global(.meal-section-caret) { width: 12px; height: 12px; color: var(--text-dim); flex-shrink: 0; }
  .meal-section-head span { font-size: 11px; color: var(--text-dim); font-weight: 600; }
  .meal-section-head .meal-section-title { font-size: 13px; font-weight: 700; color: var(--text); }

  .gallery-card {
    position: relative;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--card);
    cursor: zoom-in;
    transition: transform 0.15s, box-shadow 0.15s;
    display: flex;
    flex-direction: column;
  }
  .gallery-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
    border-color: #cbd5e1;
  }

  .lightbox {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.88);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .lightbox-inner {
    position: relative;
    width: calc(100vw - 48px);
    max-width: 960px;
    max-height: calc(100vh - 48px);
    border-radius: var(--radius);
    background: var(--card);
    box-shadow: 0 24px 64px rgba(0,0,0,0.5);
    display: flex;
    overflow: hidden;
  }
  .lightbox-left {
    width: 45%;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    overflow-y: auto;
  }
  .lightbox-right {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }
  .review-panel { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 16px; padding: 14px 58px 14px 16px; border-bottom: 1px solid var(--border); background: var(--surface); }
  .review-copy { display: grid; flex: 1; min-width: 160px; }
  .review-copy strong { color: var(--text); font-size: 13px; }
  .review-copy span, .review-status { color: var(--text-dim); font-size: 11px; }
  .review-stars { display: flex; gap: 2px; }
  .review-stars button { display: grid; place-items: center; width: 30px; height: 30px; padding: 4px; border-radius: 6px; color: #cbd5e1; }
  .review-stars button:not(:disabled):hover, .review-stars button:not(:disabled):focus-visible, .review-stars button.rated { color: #f59e0b; background: #fffbeb; }
  .review-stars button:disabled { cursor: default; }
  .review-stars :global(svg) { width: 19px; height: 19px; }
  .review-status { width: 100%; color: var(--success-text); }
  .lightbox-img { width: 100%; aspect-ratio: 1; object-fit: contain; display: block; background: var(--card); }
  .lightbox-image-frame { position: relative; background: var(--card); }
  .lightbox-open-link {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 7px 11px;
    border: 1px solid rgba(255, 255, 255, 0.55);
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.72);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    text-decoration: none;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.28);
    backdrop-filter: blur(8px);
    z-index: 3;
  }
  .lightbox-open-link:hover { background: rgba(15, 23, 42, 0.9); }
  .lightbox-info {
    padding: 12px 16px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    border-top: 1px solid var(--border);
    flex: 1;
  }
  .lightbox-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .lightbox-name { font-size: 15px; font-weight: 600; color: var(--text); }
  .lightbox-components { display: block; font-size: 11px; color: var(--text-dim); line-height: 1.5; margin-top: 2px; }
  .lightbox-restaurant { font-size: 12px; color: var(--text-dim); }
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
    border-radius: 8px;
    background: var(--card);
    border: 1px solid var(--border);
    text-align: center;
  }
  .nutr-label {
    font-size: 10px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 3px;
  }
  .nutr-value {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--font-sans);
    white-space: nowrap;
  }

  .detail-loading { padding: 10px 16px 14px; display: flex; flex-direction: column; gap: 6px; background: var(--surface); border-top: 1px solid var(--border); }
  .detail-empty { padding: 12px 16px 14px; border-top: 1px solid var(--border); background: var(--surface); color: var(--text-dim); font-size: 12px; font-style: italic; }
  .shimmer { height: 13px; border-radius: 3px; background: linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 50%, var(--surface) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  .detail-table-wrap { overflow-x: auto; border-top: 1px solid var(--border); background: var(--surface); }
  .detail-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .detail-table thead tr { border-bottom: 1px solid var(--border); }
  .detail-table th { padding: 7px 8px; text-align: left; font-weight: 600; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; }
  .detail-table th.detail-col-num { text-align: right; }
  .detail-table td { padding: 8px 8px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .detail-table tbody tr:last-child td { border-bottom: none; }
  .detail-col-name { min-width: 140px; }
  .detail-col-num { width: 80px; text-align: right; font-family: var(--font-sans); white-space: nowrap; }
  .dish-name { color: var(--text-muted); }

.lightbox-close {
    position: absolute; top: 10px; right: 10px;
    width: 32px; height: 32px;
    border-radius: 50%;
    background: rgba(0,0,0,0.55);
    color: white;
    font-size: 14px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.12s;
  }
  :global(.lightbox-close-icon) { width: 16px; height: 16px; }
  .lightbox-close:hover { background: rgba(0,0,0,0.75); }

  .gallery-img-wrap { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; background: var(--card); }
  .gallery-img-wrap :global(.gallery-img) { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; transition: transform 0.2s; }
  .gallery-card:hover :global(.gallery-img) { transform: scale(1.04); }
  .zoom-indicator {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid rgba(255, 255, 255, 0.55);
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.62);
    color: #fff;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.25);
    pointer-events: none;
    z-index: 3;
  }
  :global(.zoom-indicator-icon) { width: 15px; height: 15px; }
  .gallery-placeholder,
  .lightbox-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 100%;
    min-height: 160px;
    padding: 18px;
    background:
      linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(59, 130, 246, 0.08)),
      var(--surface);
    color: var(--text-dim);
    text-align: center;
    font-size: 12px;
    font-weight: 600;
  }
  .placeholder-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--success-text);
  }
  :global(.placeholder-icon-svg) { width: 22px; height: 22px; }
  .lightbox-placeholder {
    aspect-ratio: 1;
    min-height: 260px;
  }

  .gallery-info { padding: 9px 10px; background: var(--card); border-top: 1px solid var(--border); display: flex; flex-direction: column; flex: 1; }
  .gallery-name { display: block; font-size: 12px; font-weight: 500; color: var(--text); margin-bottom: 3px; line-height: 1.4; }
  .gallery-signals { display: flex; align-items: center; flex-wrap: wrap; gap: 3px 8px; margin-bottom: 4px; }
  .gallery-rating { display: inline-flex; align-items: center; gap: 3px; color: #b45309; font-size: 10px; font-weight: 700; }
  .gallery-rating :global(svg) { width: 12px; height: 12px; }
  .gallery-occurrences { color: var(--success-text); font-size: 10px; font-weight: 700; white-space: nowrap; }
  .gallery-components { display: block; font-size: 10px; color: var(--text-muted); line-height: 1.4; margin-bottom: 5px; }
  .gallery-detail-unavailable { font-style: italic; }
  .gallery-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: auto; padding-top: 6px; }
  .gallery-restaurant { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .kcal-badge { display: inline-block; padding: 3px 8px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); font-size: 11px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
  .nutrition-unavailable-badge,
  .nutrition-unavailable { color: var(--text-dim); font-size: 11px; font-style: italic; }
  .nutrition-unavailable-badge { white-space: nowrap; flex-shrink: 0; }
  .nutrition-unavailable { text-align: center; }

  @media (max-width: 640px) {
    .controls { width: 100%; }
    .date-row { width: 100%; }
    .date-input { flex: 1; min-width: 0; }
    .gallery-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; padding: 12px; }
    .lightbox { padding: 0; align-items: stretch; justify-content: stretch; }
    .lightbox-inner {
      flex-direction: column;
      width: 100vw;
      max-width: none;
      height: 100dvh;
      max-height: none;
      border-radius: 0;
      overflow-y: auto;
    }
    .lightbox-left { width: 100%; border-right: none; border-bottom: 1px solid var(--border); overflow-y: visible; }
    .lightbox-right { overflow-y: visible; }
    .lightbox-img { max-height: 62dvh; }
    .lightbox-close {
      position: fixed;
      top: max(12px, env(safe-area-inset-top));
      right: max(12px, env(safe-area-inset-right));
      width: 40px;
      height: 40px;
      z-index: 2;
    }
  }
</style>
