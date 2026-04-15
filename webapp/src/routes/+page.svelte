<script lang="ts">
  import type { MealTime, Menu, Restaurant } from '$lib/types'
  import { formatKoreanDate, proxyImg } from '$lib/utils'

  const repoUrl = 'https://github.com/pmh-only/welplan2'

  type HomePageData = {
    restaurants: Restaurant[]
    mealTimes: MealTime[]
    menus: Menu[]
    date: string
    time: string
  }

  let { data }: { data: HomePageData } = $props()

  const queryChips = [
    '웰스토리 api',
    '웰스토리 식단 조회',
    '웰스토리 식단표',
    '삼성웰스토리 식단 조회',
    '웰스토리 메뉴 조회',
    '삼성전자 식단 조회'
  ]

  const faqItems = [
    {
      question: '이 사이트는 무엇을 보여주는 웰스토리 API 데모인가요?',
      answer:
        'Welplan은 Welstory API 데이터가 실제 식단 조회 화면, 메뉴 이미지, 영양 정보 비교로 어떻게 이어지는지 보여주는 데모입니다.'
    },
    {
      question: '웰스토리 식단 조회와 식단표 확인이 가능한가요?',
      answer:
        '가능합니다. 날짜와 식사 시간을 기준으로 웰스토리 식단표와 메뉴 이미지를 확인하고 갤러리로 이동해 더 자세히 볼 수 있습니다.'
    },
    {
      question: '삼성전자 식단 조회나 삼성웰스토리 메뉴 확인에도 활용할 수 있나요?',
      answer:
        '원하는 식당을 추가하면 사업장별 메뉴 확인에도 활용할 수 있습니다. 이 사이트는 그런 조회 흐름을 시연하는 데 목적이 있습니다.'
    }
  ]

  function restaurantName(id: string): string {
    return data.restaurants.find((restaurant) => restaurant.id === id)?.name ?? id
  }

  const selectedMealTimeName = $derived(
    data.mealTimes.find((mealTime) => mealTime.id === data.time)?.name ?? '식사 시간'
  )
  const dateLabel = $derived(formatKoreanDate(data.date))
  const galleryHref = $derived(`/gallery?date=${data.date}&time=${data.time}`)
  const takeInHref = $derived(`/takein/${data.date}/${data.time}`)
  const takeOutHref = $derived(`/takeout/${data.date}/${data.time}`)

  const featuredMenus = $derived.by(() => {
    const uniqueMenus = new Map<string, Menu>()

    for (const menu of data.menus) {
      if (!menu.imageUrl) continue
      if (menu.name.includes('죽')) continue
      if (menu.isTakeOut && !menu.name.includes('도시락')) continue

      const key = menu.name.trim().toLowerCase()
      if (!uniqueMenus.has(key)) uniqueMenus.set(key, menu)
    }

    return [...uniqueMenus.values()].slice(0, 6)
  })
</script>

<div class="hero-grid">
  <section class="hero-copy card-shell">
    <p class="hero-kicker">Welstory API Demo</p>
    <h2>웰스토리 API로 식단 조회와 메뉴 이미지를 시연하는 데모 사이트</h2>
    <p class="hero-summary">
      Welplan은 <strong>웰스토리 API</strong> 데이터를 바탕으로 <strong>웰스토리 식단 조회</strong>,
      <strong>웰스토리 식단표</strong> 확인, <strong>삼성웰스토리 메뉴</strong> 비교가 어떻게 동작하는지 보여주는
      오픈소스 데모입니다. 실제 메뉴 이미지와 영양 정보를 함께 확인할 수 있습니다.
    </p>
    <p class="repo-note">
      이 데모가 유용했다면 <a href={repoUrl} target="_blank" rel="noreferrer">GitHub 저장소</a>에
      <strong>Star</strong>를 남겨 주세요.
    </p>

    <div class="query-chip-list" aria-label="주요 검색어">
      {#each queryChips as chip}
        <span class="query-chip">{chip}</span>
      {/each}
    </div>

    <div class="stat-grid">
      <article class="stat-card">
        <span class="stat-label">기준 식단</span>
        <strong>{dateLabel}</strong>
        <span class="stat-sub">{selectedMealTimeName}</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">등록 식당</span>
        <strong>{data.restaurants.length}개</strong>
        <span class="stat-sub">직접 선택 가능</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">노출 이미지</span>
        <strong>{featuredMenus.length}장</strong>
        <span class="stat-sub">현재 수집 기준</span>
      </article>
    </div>

    <div class="hero-actions">
      {#if data.restaurants.length === 0}
        <a href="/restaurants" class="primary-btn">식당 추가하고 시작하기</a>
      {:else}
        <a href={galleryHref} class="primary-btn">실시간 메뉴 갤러리 보기</a>
        <a href={takeInHref} class="secondary-btn">테이크 인 메뉴</a>
        <a href={takeOutHref} class="secondary-btn">테이크 아웃 메뉴</a>
      {/if}
      <a href={repoUrl} target="_blank" rel="noreferrer" class="star-btn">GitHub에서 Star 주기</a>
    </div>
  </section>

  <section class="hero-gallery card-shell">
    <div class="hero-gallery-head">
      <div>
        <p class="gallery-kicker">Live Menu Preview</p>
        <h3>오늘 식단 이미지</h3>
      </div>
      {#if data.restaurants.length > 0}
        <a href={galleryHref} class="gallery-link">전체 갤러리</a>
      {/if}
    </div>

    {#if data.restaurants.length === 0}
      <div class="gallery-empty">
        <p>식당을 추가하면 웰스토리 식단 조회 결과와 메뉴 이미지를 이 영역에서 바로 보여줍니다.</p>
      </div>
    {:else if featuredMenus.length === 0}
      <div class="gallery-empty">
        <p>현재 선택된 식사 시간에는 표시할 메뉴 이미지가 없습니다.</p>
      </div>
    {:else}
      <div class="mosaic-grid">
        {#each featuredMenus as menu, index (menu.id)}
          <a class="mosaic-card" href={galleryHref}>
            <img
              src={proxyImg(menu.imageUrl)}
              alt={`${menu.name} 메뉴 사진`}
              loading={index < 3 ? 'eager' : 'lazy'}
            />
            <div class="mosaic-overlay">
              <span class="mosaic-title">{menu.name}</span>
              <span class="mosaic-meta">{restaurantName(menu.restaurantId)}</span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </section>
</div>

<section class="info-section card-shell">
  <div class="info-head">
    <h3>Welstory API 데모에서 확인할 수 있는 것</h3>
  </div>
  <div class="info-grid">
    <article class="info-card">
      <h4>웰스토리 API 응답 시연</h4>
      <p>API로 가져온 메뉴 데이터를 실제 화면에 어떻게 연결하는지 한눈에 볼 수 있습니다.</p>
    </article>
    <article class="info-card">
      <h4>웰스토리 식단 조회</h4>
      <p>날짜와 식사 시간을 바꿔 웰스토리 식단표와 메뉴 이미지를 확인할 수 있습니다.</p>
    </article>
    <article class="info-card">
      <h4>삼성웰스토리 메뉴 비교</h4>
      <p>식당별 메뉴와 영양 정보를 같이 보며 삼성전자 식단 조회 흐름도 시연할 수 있습니다.</p>
    </article>
  </div>
</section>

<section class="faq-section card-shell">
  <div class="info-head">
    <h3>자주 찾는 항목</h3>
  </div>
  <div class="faq-grid">
    {#each faqItems as item}
      <article class="faq-card">
        <h4>{item.question}</h4>
        <p>{item.answer}</p>
      </article>
    {/each}
  </div>
</section>

<style>
  .card-shell {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
  }

  .hero-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    gap: 16px;
    margin-bottom: 16px;
    align-items: start;
  }

  .hero-copy {
    padding: 22px;
    background:
      radial-gradient(circle at top right, rgba(56, 189, 248, 0.14), transparent 32%),
      radial-gradient(circle at bottom left, rgba(16, 185, 129, 0.12), transparent 28%),
      linear-gradient(180deg, #fff, #f8fafc 100%);
  }

  .hero-kicker,
  .gallery-kicker {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0f766e;
    margin-bottom: 10px;
  }

  .hero-copy h2 {
    font-size: clamp(1.7rem, 3vw, 2.4rem);
    line-height: 1.2;
    letter-spacing: -0.03em;
    color: var(--text);
    margin-bottom: 14px;
    max-width: 12ch;
  }

  .hero-summary {
    font-size: 14px;
    line-height: 1.8;
    color: var(--text-muted);
    max-width: 62ch;
  }

  .hero-summary strong,
  .repo-note strong {
    color: var(--text);
  }

  .repo-note {
    margin-top: 10px;
    font-size: 13px;
    line-height: 1.7;
    color: var(--text-dim);
  }

  .repo-note a {
    color: #0f766e;
    font-weight: 700;
    text-decoration: none;
  }

  .repo-note a:hover { text-decoration: underline; }

  .query-chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 18px 0 20px;
  }

  .query-chip {
    display: inline-flex;
    align-items: center;
    padding: 6px 11px;
    border-radius: 999px;
    background: #f1f5f9;
    border: 1px solid #dbe5ef;
    color: #334155;
    font-size: 12px;
    font-weight: 600;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 20px;
  }

  .stat-card {
    padding: 14px;
    border-radius: 16px;
    background: rgba(248, 250, 252, 0.95);
    border: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #64748b;
  }

  .stat-card strong {
    font-size: 1rem;
    color: var(--text);
  }

  .stat-sub {
    font-size: 12px;
    color: var(--text-dim);
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .primary-btn,
  .secondary-btn,
  .star-btn,
  .gallery-link {
    text-decoration: none;
    transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
  }

  .primary-btn,
  .secondary-btn,
  .star-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 0 16px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 700;
  }

  .primary-btn {
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    box-shadow: 0 10px 24px rgba(16, 185, 129, 0.18);
  }

  .secondary-btn,
  .star-btn {
    background: #fff;
    color: #0f172a;
    border: 1px solid #dbe5ef;
  }

  .star-btn {
    background: linear-gradient(180deg, #fffbea, #fff7d6);
    border-color: #facc15;
  }

  .primary-btn:hover,
  .secondary-btn:hover,
  .star-btn:hover,
  .gallery-link:hover,
  .mosaic-card:hover {
    transform: translateY(-1px);
  }

  .hero-gallery {
    padding: 18px;
    background: linear-gradient(180deg, #0f172a, #111827);
    color: #f8fafc;
  }

  .hero-gallery-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .hero-gallery-head h3 {
    font-size: 1.1rem;
    color: #f8fafc;
  }

  .gallery-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    color: #e2e8f0;
    font-size: 12px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.04);
  }

  .gallery-empty {
    min-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 28px 22px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px dashed rgba(148, 163, 184, 0.25);
    color: #cbd5e1;
    line-height: 1.8;
  }

  .mosaic-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: 128px;
    gap: 10px;
  }

  .mosaic-card {
    position: relative;
    border-radius: 18px;
    overflow: hidden;
    min-height: 0;
    box-shadow: 0 14px 30px rgba(2, 6, 23, 0.28);
  }

  .mosaic-card:nth-child(1),
  .mosaic-card:nth-child(4) {
    grid-row: span 2;
  }

  .mosaic-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .mosaic-overlay {
    position: absolute;
    inset: auto 0 0 0;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: linear-gradient(180deg, rgba(15, 23, 42, 0) 0%, rgba(15, 23, 42, 0.88) 100%);
  }

  .mosaic-title {
    font-size: 13px;
    font-weight: 700;
    color: #f8fafc;
    line-height: 1.4;
  }

  .mosaic-meta {
    font-size: 11px;
    color: #cbd5e1;
  }

  .info-section,
  .faq-section {
    margin-bottom: 16px;
  }

  .info-head {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
  }

  .info-head h3 {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    padding-left: 10px;
    border-left: 3px solid var(--green);
  }

  .info-grid,
  .faq-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    padding: 16px;
  }

  .info-card,
  .faq-card {
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 15px;
    background: var(--surface);
  }

  .info-card h4,
  .faq-card h4 {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
    margin-bottom: 8px;
  }

  .info-card p,
  .faq-card p {
    font-size: 12px;
    line-height: 1.8;
    color: var(--text-dim);
  }

  @media (max-width: 960px) {
    .hero-grid,
    .info-grid,
    .faq-grid {
      grid-template-columns: 1fr;
    }

    .stat-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .hero-copy,
    .hero-gallery {
      padding: 16px;
    }

    .mosaic-grid {
      grid-auto-rows: 104px;
      gap: 8px;
    }

    .mosaic-card:nth-child(1),
    .mosaic-card:nth-child(4) {
      grid-row: span 1;
    }
  }
</style>
