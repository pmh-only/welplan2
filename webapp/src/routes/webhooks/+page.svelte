<script lang="ts">
  import { goto } from '$app/navigation'
  import { onMount, untrack } from 'svelte'
  import { Check, ChevronRight, FlaskConical, Plus, Search, Send, Trash2, Utensils } from '@lucide/svelte'
  import { PRIVACY_VERSION, type TermsVersion } from '$lib/legal'
  import type { Restaurant } from '$lib/types'
  import {
    DEFAULT_WEBHOOK_CONFIG,
    WEBHOOK_PLATFORM_LABELS,
    WEBHOOK_PLATFORMS,
    type WebhookPlatform,
    type WebhookSubscription,
    type WebhookSubscriptionConfig,
    type WebhookSubscriptionCreated
  } from '$lib/webhook-types'
  import { restaurantPathTags } from '$lib/utils'

  type CreationTestStatus = 'sent' | 'skipped' | 'failed'
  type SlackOAuthResult = { configured: boolean; webhookUrl?: string; channel?: string; teamName?: string; error?: string }
  type PageData = { restaurants?: Restaurant[]; internalId?: string; creationTest?: CreationTestStatus; slackOAuth?: SlackOAuthResult; termsVersion: TermsVersion; registrationCounts?: Record<WebhookPlatform, number> }
  type Feedback = { kind: 'success' | 'error' | 'info'; text: string }

  const weekdays = [
    { value: 1, label: '월' }, { value: 2, label: '화' }, { value: 3, label: '수' },
    { value: 4, label: '목' }, { value: 5, label: '금' }, { value: 6, label: '토' },
    { value: 0, label: '일' }
  ]
  const scheduledMealLabels = { breakfast: '아침', lunch: '점심', dinner: '저녁' } as const
  const platformMeta: Record<WebhookPlatform, { icon: string; color: string; hint: string }> = {
    discord: { icon: '/webhook-brands/discord.svg', color: '#5865f2', hint: '채널 설정에서 만든 Incoming Webhook URL' },
    slack: { icon: '/webhook-brands/slack.svg', color: '#4a154b', hint: 'Slack 앱의 Incoming Webhook URL' },
    'google-chat': { icon: '/webhook-brands/google-chat.svg', color: '#0f9d58', hint: 'Google Chat 스페이스의 웹훅 URL' },
    'microsoft-teams': { icon: '/webhook-brands/microsoft-teams.svg', color: '#6264a7', hint: 'Teams Workflows의 HTTP POST URL' },
    mattermost: { icon: '/webhook-brands/mattermost.svg', color: '#0058cc', hint: 'Mattermost Incoming Webhook URL' },
    dooray: { icon: '/webhook-brands/dooray.webp', color: '#3b82f6', hint: 'Dooray! 메신저 Incoming URL' },
    swit: { icon: '/webhook-brands/swit.png', color: '#6d5dfc', hint: 'Swit 채널 Incoming Webhook URL' },
    jandi: { icon: '/webhook-brands/jandi.png', color: '#00a988', hint: '잔디 Connect Incoming Webhook URL' }
  }
  const platformGuides: Record<WebhookPlatform, { steps: string[]; note?: string }> = {
    discord: {
      steps: ['메시지를 받을 채널의 설정을 엽니다.', '연동 → 웹후크에서 새 웹후크를 만듭니다.', '웹후크 URL 복사를 눌러 아래 입력란에 붙여넣습니다.']
    },
    slack: {
      steps: ['Slack에 연결 버튼을 누릅니다.', 'Welplan Slack 앱을 설치할 워크스페이스를 선택합니다.', '메뉴 알림을 받을 채널을 선택하고 허용합니다.', 'Welplan으로 돌아오면 선택한 채널의 Webhook이 자동으로 연결됩니다.'],
      note: '사용자가 Slack 앱이나 Webhook URL을 직접 만들 필요가 없습니다.'
    },
    'google-chat': {
      steps: ['메시지를 받을 Google Chat 스페이스를 엽니다.', '스페이스 설정의 앱 및 통합 관리에서 웹훅을 추가합니다.', '이름을 입력해 저장한 뒤 생성된 URL을 복사합니다.']
    },
    'microsoft-teams': {
      steps: ['Teams에서 Workflows 앱을 엽니다.', '웹훅 요청이 수신되면 채널에 게시 템플릿을 선택합니다.', '대상 팀과 채널을 선택하고 호출 권한을 누구나로 설정합니다.', 'Workflow를 저장한 뒤 표시되는 HTTP POST URL을 복사합니다.'],
      note: 'Teams 채널 주소가 아니라 Workflow가 발급한 URL이 필요합니다.'
    },
    mattermost: {
      steps: ['제품 메뉴에서 통합 → Incoming Webhook을 엽니다.', 'Incoming Webhook 추가를 누르고 메시지를 받을 채널을 선택합니다.', '저장 후 생성된 Webhook URL을 복사합니다.']
    },
    dooray: {
      steps: ['대화방 우측 상단의 정보에서 서비스 연동을 엽니다.', '서비스 추가를 누르고 Incoming에 봇 이름을 입력합니다.', '추가 후 표시되는 연동 URL을 복사합니다.']
    },
    swit: {
      steps: ['메시지를 받을 채널 이름을 누르고 Incoming webhooks를 엽니다.', 'New webhook을 누르고 게시 유형으로 Messages를 선택합니다.', 'Create 후 Copy webhook URL을 눌러 URL을 복사합니다.']
    },
    jandi: {
      steps: ['우측 메뉴에서 잔디 커넥트를 엽니다.', 'Webhook 수신의 연동 항목 추가하기를 누릅니다.', '프로필과 메시지를 받을 토픽을 설정해 추가합니다.', '생성된 Webhook URL을 복사합니다.']
    }
  }

  let { data }: { data: PageData } = $props()
  let draft = $state<WebhookSubscriptionConfig>(freshDraft())
  let selectedRestaurants = $state<Restaurant[]>(untrack(() => (data.restaurants ?? []).slice(0, 20)))
  let restaurantQuery = $state('')
  let restaurantResults = $state<Restaurant[]>(untrack(() => data.restaurants ?? []))
  let searching = $state(false)
  let editingId = $state<string | null>(untrack(() => data.internalId ?? null))
  let currentSubscription = $state<WebhookSubscription | null>(null)
  let saving = $state(false)
  let testingId = $state<string | null>(null)
  let loadingEditor = $state(Boolean(untrack(() => data.internalId)))
  let editorUnavailable = $state(false)
  let showGuide = $state(false)
  let legalAccepted = $state(false)
  let feedback = $state<Feedback | null>(untrack(() => creationTestFeedback(data.creationTest)))
  let searchSequence = 0

  const selectedIds = $derived(new Set(selectedRestaurants.map((restaurant) => restaurant.id)))
  const visibleRestaurantResults = $derived(restaurantResults.filter((restaurant) => !selectedIds.has(restaurant.id)))
  const selectedPlatform = $derived(platformMeta[draft.platform])
  const slackInstallPath = $derived(`/webhooks/slack/install?returnTo=${encodeURIComponent(editingId ? `/webhooks/${editingId}` : '/webhooks')}`)
  const termsVersion = untrack(() => data.termsVersion)
  const termsPath = `/terms/${termsVersion}`

  function freshDraft(): WebhookSubscriptionConfig {
    return {
      ...DEFAULT_WEBHOOK_CONFIG,
      webhookUrl: data.slackOAuth?.webhookUrl ?? '',
      restaurantIds: [],
      weekdays: [...DEFAULT_WEBHOOK_CONFIG.weekdays],
      mealTypes: [...DEFAULT_WEBHOOK_CONFIG.mealTypes],
      mealSchedules: DEFAULT_WEBHOOK_CONFIG.mealSchedules.map((schedule) => ({
        ...schedule,
        mealTypes: [...schedule.mealTypes]
      }))
    }
  }

  function editableMealSchedules(config: WebhookSubscriptionConfig): WebhookSubscriptionConfig['mealSchedules'] {
    const combined = config.mealSchedules.find((schedule) => schedule.id === 'legacy' || schedule.id === 'combined')
    if (combined) {
      return DEFAULT_WEBHOOK_CONFIG.mealSchedules.map((schedule) => ({
        ...schedule,
        mealTypes: [...schedule.mealTypes],
        sendTime: combined.sendTime,
        enabled: combined.mealTypes.includes(schedule.mealTypes[0])
      }))
    }
    return config.mealSchedules.map((schedule) => ({ ...schedule, mealTypes: [...schedule.mealTypes] }))
  }

  function creationTestFeedback(status: CreationTestStatus | undefined): Feedback | null {
    if (status === 'sent') return { kind: 'success', text: '웹훅을 등록하고 테스트 메시지를 전송했습니다.' }
    if (status === 'skipped') return { kind: 'info', text: '웹훅을 등록했습니다. 현재 조건에 맞는 메뉴가 없어 테스트 전송은 생략했습니다.' }
    if (status === 'failed') return { kind: 'error', text: '웹훅은 등록했지만 테스트 전송에 실패했습니다. URL과 메뉴 조건을 확인해 주세요.' }
    return null
  }

  async function apiError(response: Response): Promise<string> {
    const body = await response.json().catch(() => ({})) as { error?: string }
    return body.error ?? `요청에 실패했습니다. (HTTP ${response.status})`
  }

  async function loadSubscription() {
    if (!editingId) return
    loadingEditor = true
    try {
      const response = await fetch(`/api/webhooks/subscriptions/${editingId}`)
      if (!response.ok) throw new Error(await apiError(response))
      const subscription = await response.json() as WebhookSubscription
      const { id, createdAt, updatedAt, restaurants, lastDelivery, ...config } = subscription
      draft = {
        ...config,
        ...(data.slackOAuth?.webhookUrl ? { platform: 'slack' as const, webhookUrl: data.slackOAuth.webhookUrl } : {}),
        restaurantIds: [...config.restaurantIds],
        weekdays: [...config.weekdays],
        mealTypes: [...config.mealTypes],
        mealSchedules: editableMealSchedules(config)
      }
      selectedRestaurants = restaurants ?? []
      currentSubscription = { ...subscription, id, createdAt, updatedAt, lastDelivery }
    } catch (error) {
      editorUnavailable = true
      feedback = { kind: 'error', text: error instanceof Error ? error.message : '웹훅 설정을 불러오지 못했습니다.' }
    } finally {
      loadingEditor = false
    }
  }

  async function searchRestaurants() {
    const sequence = ++searchSequence
    searching = true
    try {
      const response = await fetch(`/proxy/search?q=${encodeURIComponent(restaurantQuery.trim())}`)
      if (!response.ok) throw new Error()
      const result = await response.json() as Restaurant[]
      if (sequence === searchSequence) restaurantResults = result
    } catch {
      if (sequence === searchSequence) feedback = { kind: 'error', text: '식당 검색에 실패했습니다.' }
    } finally {
      if (sequence === searchSequence) searching = false
    }
  }

  function selectPlatform(platform: WebhookPlatform) {
    if (editingId) return
    draft.platform = platform
    draft.name = `${WEBHOOK_PLATFORM_LABELS[platform]} 메뉴 알림`
    showGuide = false
  }

  function addRestaurant(restaurant: Restaurant) {
    if (selectedRestaurants.length >= 20) {
      feedback = { kind: 'error', text: '식당은 최대 20개까지 선택할 수 있습니다.' }
      return
    }
    if (!selectedIds.has(restaurant.id)) selectedRestaurants = [...selectedRestaurants, restaurant]
  }

  function removeRestaurant(restaurantId: string) {
    selectedRestaurants = selectedRestaurants.filter((restaurant) => restaurant.id !== restaurantId)
  }

  function toggleWeekday(day: number) {
    draft.weekdays = draft.weekdays.includes(day)
      ? draft.weekdays.filter((value) => value !== day)
      : [...draft.weekdays, day].sort()
  }

  async function saveSubscription(event: SubmitEvent) {
    event.preventDefault()
    if (selectedRestaurants.length === 0) {
      feedback = { kind: 'error', text: '메뉴를 받을 식당을 하나 이상 선택해 주세요.' }
      return
    }
    if (draft.weekdays.length === 0 || (
      draft.scheduleMode === 'per-meal' && !draft.mealSchedules.some((schedule) => schedule.enabled)
    )) {
      feedback = { kind: 'error', text: '요일과 식사 시간을 하나 이상 선택해 주세요.' }
      return
    }
    if (!editingId && !legalAccepted) {
      feedback = { kind: 'error', text: '서비스 이용약관에 동의하고 개인정보 처리방침을 확인해 주세요.' }
      return
    }

    saving = true
    feedback = null
    const body = {
      ...draft,
      restaurantIds: selectedRestaurants.map((restaurant) => restaurant.id),
      ...(editingId ? {} : {
        legalAcceptance: {
          accepted: legalAccepted,
          termsVersion,
          privacyVersion: PRIVACY_VERSION
        }
      })
    }
    try {
      if (editingId) {
        const response = await fetch(`/api/webhooks/subscriptions/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        if (!response.ok) throw new Error(await apiError(response))
        const updated = await response.json() as WebhookSubscription
        currentSubscription = updated
        feedback = { kind: 'success', text: '웹훅 설정을 저장했습니다.' }
      } else {
        const response = await fetch('/api/webhooks/subscriptions/v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        if (!response.ok) throw new Error(await apiError(response))
        const created = await response.json() as WebhookSubscriptionCreated
        await goto(`/webhooks/${created.subscription.id}?test=sent`)
      }
    } catch (error) {
      feedback = { kind: 'error', text: error instanceof Error ? error.message : '저장에 실패했습니다.' }
    } finally {
      saving = false
    }
  }

  async function requestTestDelivery(id: string): Promise<{ status: CreationTestStatus; feedback: Feedback }> {
    try {
      const response = await fetch(`/api/webhooks/subscriptions/${id}/test`, { method: 'POST' })
      if (!response.ok) throw new Error(await apiError(response))
      const result = await response.json() as { messageCount: number; skipped: boolean }
      return result.skipped
        ? { status: 'skipped', feedback: { kind: 'info', text: '현재 조건에 맞는 메뉴가 없어 테스트 전송을 건너뛰었습니다.' } }
        : { status: 'sent', feedback: { kind: 'success', text: `테스트 메시지 ${result.messageCount}개를 전송했습니다.` } }
    } catch (error) {
      return {
        status: 'failed',
        feedback: { kind: 'error', text: error instanceof Error ? error.message : '테스트 전송에 실패했습니다.' }
      }
    }
  }

  async function testSubscription() {
    if (!editingId) return
    testingId = editingId
    feedback = null
    try {
      feedback = (await requestTestDelivery(editingId)).feedback
    } finally {
      testingId = null
    }
  }

  async function deleteSubscription() {
    if (!editingId || !window.confirm(`'${draft.name}' 웹훅을 삭제할까요?`)) return
    try {
      const response = await fetch(`/api/webhooks/subscriptions/${editingId}`, { method: 'DELETE' })
      if (!response.ok) {
        feedback = { kind: 'error', text: await apiError(response) }
        return
      }
      await goto('/webhooks')
    } catch {
      feedback = { kind: 'error', text: '네트워크 오류로 웹훅 설정을 삭제하지 못했습니다.' }
    }
  }

  onMount(() => {
    if (data.slackOAuth?.error) {
      feedback = { kind: 'error', text: data.slackOAuth.error }
    } else if (data.slackOAuth?.webhookUrl) {
      const destination = [data.slackOAuth.teamName, data.slackOAuth.channel].filter(Boolean).join(' · ')
      feedback = { kind: 'success', text: `Slack 채널을 연결했습니다.${destination ? ` (${destination})` : ''}` }
    }
    if (editingId) void loadSubscription()
    void searchRestaurants()
  })
</script>

<svelte:head>
  <meta name="robots" content="noindex, follow" />
</svelte:head>

<div class="webhook-page">
  {#if !editingId}
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">WELPLAN WEBHOOKS</span>
        <h1>오늘의 메뉴를<br />팀 채널이 먼저 알려드려요.</h1>
        <p>8개 협업 도구에 여러 식당의 메뉴를 원하는 요일과 시간에 맞춰 자동으로 전달합니다.</p>
      </div>
      <div class="hero-platforms" aria-label="지원하는 협업 도구">
        {#each WEBHOOK_PLATFORMS as platform}
          <div class="hero-platform">
            <span class="brand-icon"><img src={platformMeta[platform].icon} alt="" aria-hidden="true" /></span>
            <strong>{WEBHOOK_PLATFORM_LABELS[platform]}</strong>
            <span class="registration-count" aria-label={`${data.registrationCounts?.[platform] ?? 0}개 등록됨`}>
              {data.registrationCounts?.[platform] ?? 0}
            </span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <form class="builder" class:builder-loading={loadingEditor || editorUnavailable} onsubmit={saveSubscription}>
    <div class="builder-head">
      <div>
        <span class="section-number">{editingId ? 'EDIT WEBHOOK' : 'NEW WEBHOOK'}</span>
        <h2>{editingId ? '웹훅 설정 편집' : '새 메뉴 알림 만들기'}</h2>
        {#if editingId}<small class="internal-id">Internal ID · {editingId}</small>{/if}
      </div>
    </div>

    <section class="form-section">
      <div class="form-section-title"><span>01</span><div><h3>받을 채널</h3><p>사용 중인 협업 도구와 Incoming Webhook URL을 연결합니다.</p></div></div>
      <div class="platform-picker">
        {#each WEBHOOK_PLATFORMS as platform}
          <button type="button" disabled={Boolean(editingId)} class:chosen={draft.platform === platform} style={`--platform-color: ${platformMeta[platform].color}`} onclick={() => selectPlatform(platform)}>
            <span class="brand-icon platform-monogram"><img src={platformMeta[platform].icon} alt="" aria-hidden="true" /></span>
            <strong>{WEBHOOK_PLATFORM_LABELS[platform]}</strong>
            {#if draft.platform === platform}<Check class="platform-check" size={15} />{/if}
          </button>
        {/each}
      </div>
      <div class="field-grid">
        <div class="wide-field webhook-url-field">
          <div class="field-label"><label for="webhook-url">{draft.platform === 'slack' ? 'Slack 채널' : 'Webhook URL'}</label><button type="button" aria-expanded={showGuide} aria-controls="webhook-setup-guide" onclick={() => { showGuide = !showGuide }}>만드는 방법 <ChevronRight class={showGuide ? 'guide-open' : ''} size={12} /></button></div>
          {#if draft.platform === 'slack'}
            <div class="slack-connect-row">
              {#if editingId}
                <span class="connection-status"><Check size={14} /> Slack Webhook 연결됨</span>
              {:else if data.slackOAuth?.configured}
                <a class="slack-connect-btn" href={slackInstallPath}>{draft.webhookUrl ? '다른 Slack 채널 연결' : 'Slack에 연결'}</a>
              {:else}
                <button class="slack-connect-btn" type="button" disabled>Slack에 연결</button>
              {/if}
              {#if !editingId && draft.webhookUrl}<span class="connection-status"><Check size={14} /> Slack Webhook 연결됨</span>{/if}
            </div>
            {#if !editingId && !data.slackOAuth?.configured}<small>서버에 Slack OAuth 앱 설정이 필요합니다.</small>{/if}
          {:else}
            <input id="webhook-url" type="url" required readonly={Boolean(editingId)} maxlength="4096" autocomplete="off" placeholder={selectedPlatform.hint} bind:value={draft.webhookUrl} />
            {#if draft.platform === 'microsoft-teams'}<small>Workflows의 “Teams 웹훅 요청을 받았을 때” URL을 입력하고 호출 권한을 “누구나”로 설정하세요.</small>{/if}
          {/if}
          {#if editingId}<small>등록 후에는 협업 도구와 전송 채널을 변경할 수 없습니다.</small>{/if}
          {#if showGuide}
            <div id="webhook-setup-guide" class="webhook-guide">
              <strong>{WEBHOOK_PLATFORM_LABELS[draft.platform]} Webhook 만들기</strong>
              <ol>{#each platformGuides[draft.platform].steps as step}<li>{step}</li>{/each}</ol>
              {#if platformGuides[draft.platform].note}<p>{platformGuides[draft.platform].note}</p>{/if}
            </div>
          {/if}
        </div>
      </div>
    </section>

    <section class="form-section">
      <div class="form-section-title"><span>02</span><div><h3>식당 구성</h3><p>최대 20개 식당을 선택하고 한 메시지로 합칠지 정합니다.</p></div></div>
      <div class="restaurant-builder">
        <div class="restaurant-search-panel">
          <label class="search-box">
            <Search size={15} />
            <input type="search" placeholder="식당 이름 검색" bind:value={restaurantQuery} oninput={() => void searchRestaurants()} />
            {#if searching}<small>검색 중</small>{/if}
          </label>
          <div class="restaurant-results">
            {#each visibleRestaurantResults.slice(0, 30) as restaurant (restaurant.id)}
              <button type="button" onclick={() => addRestaurant(restaurant)}>
                <div><strong>{restaurant.name}</strong><span>{restaurantPathTags(restaurant)}</span></div>
                <Plus size={15} />
              </button>
            {/each}
            {#if visibleRestaurantResults.length === 0 && !searching}<p>추가할 식당이 없습니다.</p>{/if}
          </div>
        </div>
        <div class="selected-panel">
          <div class="selected-head"><span>전송할 식당</span><strong>{selectedRestaurants.length}/20</strong></div>
          <div class="selected-list">
            {#each selectedRestaurants as restaurant (restaurant.id)}
              <div>
                <Utensils size={14} />
                <span><strong>{restaurant.name}</strong><small>{restaurant.vendor === 'welstory' ? '삼성웰스토리' : '신세계푸드'}</small></span>
                <button type="button" aria-label={`${restaurant.name} 제거`} onclick={() => removeRestaurant(restaurant.id)}>×</button>
              </div>
            {/each}
            {#if selectedRestaurants.length === 0}<p>왼쪽 검색 결과에서 식당을 추가하세요.</p>{/if}
          </div>
        </div>
      </div>
      <label class="switch-row">
        <span><strong>여러 식당 합쳐 보내기</strong><small>끄면 식당마다 별도 메시지로 전송합니다.</small></span>
        <input type="checkbox" bind:checked={draft.combineRestaurants} /><i></i>
      </label>
    </section>

    <section class="form-section schedule-section">
      <div class="form-section-title"><span>03</span><div><h3>전송 스케줄</h3><p>세 끼를 한 번에 보내거나 식사별 시간에 나누어 보냅니다.</p></div></div>
      <div class="choice-block schedule-mode"><span class="choice-label">전송 방식</span><div class="segmented"><label><input type="radio" value="combined" bind:group={draft.scheduleMode} /><span>한꺼번에</span></label><label><input type="radio" value="per-meal" bind:group={draft.scheduleMode} /><span>식사별로</span></label></div></div>
      <div class="schedule-controls">
        <div class="schedule-field">
          <span>전송 요일</span>
          <div class="weekday-picker" aria-label="전송 요일">
            {#each weekdays as day}
              <button type="button" class:chosen={draft.weekdays.includes(day.value)} onclick={() => toggleWeekday(day.value)}>{day.label}</button>
            {/each}
          </div>
        </div>
        {#if draft.scheduleMode === 'combined'}
          <label class="schedule-field combined-time"><span>전송 시간</span><input type="time" required bind:value={draft.sendTime} /></label>
        {:else}
          <div class="schedule-field">
            <span>식사별 전송 시간</span>
            <div class="meal-schedule-picker">
              {#each draft.mealSchedules as schedule (schedule.id)}
                {#if schedule.id === 'breakfast' || schedule.id === 'lunch' || schedule.id === 'dinner'}
                  <label class="meal-schedule" class:disabled={!schedule.enabled}>
                    <span><input type="checkbox" bind:checked={schedule.enabled} />{scheduledMealLabels[schedule.id]}</span>
                    <input type="time" required={schedule.enabled} disabled={!schedule.enabled} bind:value={schedule.sendTime} />
                  </label>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </section>

    <section class="form-section">
      <div class="form-section-title"><span>04</span><div><h3>메뉴 내용</h3><p>테이크인 메뉴만 전송하며 메시지에 표시할 내용을 조정합니다.</p></div></div>
      <div class="option-grid">
        <label class="check-option"><input type="checkbox" bind:checked={draft.includeCalories} /><span><strong>칼로리</strong><small>제공되는 열량을 표시</small></span></label>
        <label class="check-option"><input type="checkbox" bind:checked={draft.includeLinks} /><span><strong>메뉴 링크</strong><small>Welplan 상세 페이지 연결</small></span></label>
        <label class="check-option"><input type="checkbox" bind:checked={draft.includeEmptyRestaurants} /><span><strong>빈 식당 표시</strong><small>메뉴가 없어도 식당 이름 표시</small></span></label>
        <label class="check-option"><input type="checkbox" bind:checked={draft.sendIfNoMenus} /><span><strong>빈 알림 전송</strong><small>전체 메뉴가 없어도 안내 전송</small></span></label>
        <label class="number-option"><span><strong>식사별 최대 메뉴</strong><small>1~30개</small></span><input type="number" min="1" max="30" bind:value={draft.maxMenusPerMealTime} /></label>
      </div>
    </section>

    <div class="form-footer">
      {#if !editingId}
        <div class="legal-consent">
          <input id="legal-acceptance" type="checkbox" required bind:checked={legalAccepted} />
          <label for="legal-acceptance">
            <a href={termsPath} target="_blank" rel="noreferrer">서비스 이용약관</a>에 동의하고
            <a href="/privacy" target="_blank" rel="noreferrer">개인정보 처리방침</a>을 확인했습니다.
          </label>
        </div>
      {/if}
      {#if feedback}
        <div class="feedback feedback-{feedback.kind}" role="status">{feedback.text}</div>
      {/if}
      <div class="form-actions">
        {#if editingId}
          <button type="button" class="delete-btn" disabled={editorUnavailable} onclick={deleteSubscription}><Trash2 size={15} /> 삭제</button>
          <button type="button" class="test-btn" disabled={editorUnavailable || testingId === editingId} onclick={testSubscription}><FlaskConical size={15} /> {testingId === editingId ? '전송 중...' : '테스트 전송'}</button>
        {/if}
        <button type="submit" class="submit-btn" disabled={editorUnavailable || saving}>
          <Send size={16} /> {saving ? '저장 중...' : editingId ? '변경사항 저장' : '웹훅 등록'}
        </button>
      </div>
    </div>
  </form>
</div>

<style>
  .webhook-page { display: grid; gap: 18px; }
  .hero { position: relative; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr); gap: 34px; padding: clamp(28px, 5vw, 58px); border-radius: 18px; color: #ecfdf5; background: #0b2e2a; box-shadow: var(--shadow); }
  .hero::before { content: ''; position: absolute; width: 420px; height: 420px; right: -180px; top: -220px; border-radius: 50%; background: #16a34a; opacity: .18; }
  .hero::after { content: ''; position: absolute; inset: auto 0 0; height: 2px; background: linear-gradient(90deg, #34d399, transparent); }
  .hero-copy, .hero-platforms { position: relative; z-index: 1; }
  .eyebrow, .section-number { color: #34d399; font-size: 10px; font-weight: 800; letter-spacing: .14em; }
  .hero h1 { margin: 10px 0 15px; font-size: clamp(2rem, 4.2vw, 3.45rem); line-height: 1.16; letter-spacing: -.055em; }
  .hero p { max-width: 580px; color: #a7f3d0; font-size: 14px; line-height: 1.8; }
  .hero-platforms { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-content: center; }
  .hero-platform { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.12); border-radius: 9px; background: rgba(255,255,255,.055); backdrop-filter: blur(10px); }
  .brand-icon { display: grid; place-items: center; width: 30px; height: 30px; flex: 0 0 30px; overflow: hidden; border: 1px solid rgba(148,163,184,.28); border-radius: 8px; background: var(--card); box-shadow: 0 1px 2px rgba(15,23,42,.12); }
  .brand-icon img { display: block; width: 21px; height: 21px; object-fit: contain; }
  .hero-platform strong { font-size: 12px; font-weight: 600; }
  .registration-count { margin-left: auto; padding: 1px 6px; border-radius: 99px; color: #a7f3d0; background: rgba(16,185,129,.16); font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .feedback { padding: 12px 15px; border: 1px solid; border-radius: 9px; font-size: 13px; }
  .feedback-success { color: var(--success-text); border-color: #6ee7b7; background: var(--success-bg); }
  .feedback-error { color: var(--danger-text); border-color: #fca5a5; background: var(--danger-bg); }
  .feedback-info { color: var(--info-text); border-color: #93c5fd; background: var(--info-bg); }
  .builder { overflow: hidden; border: 1px solid var(--border); border-radius: 14px; background: var(--card); box-shadow: var(--shadow-sm); }
  .builder-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .builder-head h2 { margin-top: 4px; font-size: 1.18rem; letter-spacing: -.025em; }
  .builder-loading .form-section, .builder-loading .form-actions { opacity: .5; pointer-events: none; }
  .builder-head { padding: 20px clamp(18px, 3vw, 28px); color: #f8fafc; background: #172c2a; }
  .builder-head .section-number { color: #6ee7b7; }
  .internal-id { display: block; margin-top: 5px; color: #94a3b8; font-size: 9px; font-weight: 500; letter-spacing: .02em; }
  .form-section { padding: clamp(22px, 3vw, 32px) clamp(18px, 4vw, 42px); border-bottom: 1px solid var(--border); }
  .form-section-title { display: flex; gap: 12px; margin-bottom: 22px; }
  .form-section-title > span { display: grid; place-items: center; width: 29px; height: 29px; flex: 0 0 29px; border-radius: 50%; color: var(--success-text); background: var(--success-bg); font-size: 10px; font-weight: 800; }
  .form-section-title h3 { font-size: 1rem; letter-spacing: -.02em; }
  .form-section-title p { margin-top: 2px; color: var(--text-dim); font-size: 11px; }
  .platform-picker { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin-bottom: 20px; }
  .platform-picker button { position: relative; display: flex; align-items: center; gap: 8px; min-width: 0; padding: 9px; border: 1px solid var(--border); border-radius: 9px; color: var(--text-muted); background: var(--surface); text-align: left; }
  .platform-picker button:hover, .platform-picker button.chosen { border-color: var(--platform-color); background: var(--card); }
  .platform-picker button:disabled { cursor: default; opacity: .55; }
  .platform-picker button.chosen:disabled { opacity: 1; }
  .platform-picker strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
  .platform-check { position: absolute; top: 6px; right: 6px; color: var(--platform-color); }
  .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .wide-field { grid-column: 1 / -1; }
  .field-grid label, .webhook-url-field { display: grid; gap: 6px; color: var(--text-muted); font-size: 11px; font-weight: 600; }
  .field-label { display: flex; justify-content: space-between; align-items: center; }
  .field-label button { display: inline-flex; align-items: center; gap: 2px; color: var(--success-text); font-size: 11px; font-weight: 700; }
  :global(.field-label .guide-open) { transform: rotate(90deg); }
  .webhook-guide { margin-top: 4px; padding: 14px 16px; border: 1px solid #a7f3d0; border-radius: 8px; color: var(--text-muted); background: var(--green-dim); font-weight: 400; }
  .webhook-guide > strong { color: var(--success-text); font-size: 12px; }
  .webhook-guide ol { display: grid; gap: 6px; margin: 10px 0 0; padding-left: 20px; line-height: 1.55; }
  .webhook-guide p { margin-top: 10px; padding-top: 9px; border-top: 1px solid #bbf7d0; color: #b45309; }
  .slack-connect-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-height: 39px; }
  .slack-connect-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 39px; padding: 8px 15px; border-radius: 7px; color: #fff; background: #4a154b; font-size: 12px; font-weight: 700; text-decoration: none; }
  .slack-connect-btn:hover { background: #611f69; }
  .slack-connect-btn:disabled { cursor: not-allowed; opacity: .5; }
  .connection-status { display: inline-flex; align-items: center; gap: 5px; color: var(--success-text); font-size: 11px; font-weight: 700; }
  input:not([type='checkbox']):not([type='radio']) { width: 100%; min-height: 39px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 7px; color: var(--text); background: var(--card); outline: none; font: inherit; font-weight: 400; }
  input:not([type='checkbox']):not([type='radio']):focus { border-color: #34d399; box-shadow: 0 0 0 3px #ecfdf5; }
  .field-grid small { color: #b45309; font-size: 10px; font-weight: 400; }
  .restaurant-builder { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(280px, .8fr); overflow: hidden; min-height: 260px; border: 1px solid var(--border); border-radius: 9px; }
  .restaurant-search-panel, .selected-panel { min-width: 0; padding: 12px; }
  .selected-panel { border-left: 1px solid var(--border); background: var(--surface); }
  .search-box { display: flex; align-items: center; gap: 7px; padding: 0 9px; border: 1px solid var(--border); border-radius: 7px; color: var(--text-dim); }
  .search-box input { min-height: 36px; padding: 7px 0; border: 0; box-shadow: none; background: transparent; }
  .search-box small { white-space: nowrap; font-size: 9px; }
  .restaurant-results, .selected-list { max-height: 230px; overflow: auto; margin-top: 8px; }
  .restaurant-results button, .selected-list > div { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px; border-radius: 6px; color: var(--text); text-align: left; }
  .restaurant-results button:hover { background: var(--success-bg); }
  .restaurant-results button div, .selected-list > div > span { display: grid; min-width: 0; }
  .restaurant-results strong, .selected-list strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
  .restaurant-results span, .selected-list small { overflow: hidden; color: var(--text-dim); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .restaurant-results p, .selected-list > p { padding: 28px 8px; color: var(--text-dim); font-size: 11px; text-align: center; }
  .selected-head { display: flex; justify-content: space-between; color: var(--text-muted); font-size: 10px; font-weight: 700; }
  .selected-list > div { justify-content: initial; border-bottom: 1px solid var(--border); }
  .selected-list > div > span { flex: 1; }
  .selected-list button { color: #94a3b8; font-size: 18px; }
  .switch-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 14px; padding: 12px 13px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
  .switch-row > span { display: grid; }
  .switch-row strong { font-size: 11px; }
  .switch-row small { color: var(--text-dim); font-size: 9px; }
  .switch-row input { position: absolute; opacity: 0; pointer-events: none; }
  .switch-row i { position: relative; width: 36px; height: 20px; flex: 0 0 36px; border-radius: 99px; background: #cbd5e1; transition: .15s; }
  .switch-row i::after { content: ''; position: absolute; width: 16px; height: 16px; left: 2px; top: 2px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: .15s; }
  .switch-row input:checked + i { background: #10b981; }
  .switch-row input:checked + i::after { transform: translateX(16px); }
  .schedule-controls { display: grid; grid-template-columns: minmax(0, 309px) minmax(330px, 1fr); align-items: start; gap: 20px; }
  .schedule-field { display: grid; min-width: 0; gap: 6px; color: var(--text-muted); font-size: 11px; font-weight: 600; }
  .weekday-picker { display: grid; grid-template-columns: repeat(7, minmax(0, 39px)); gap: 6px; }
  .weekday-picker button { width: 100%; max-width: 39px; aspect-ratio: 1; min-width: 0; border: 1px solid var(--border); border-radius: 50%; color: var(--text-muted); background: var(--surface); font-size: 11px; }
  .weekday-picker button.chosen { border-color: var(--green); color: var(--success-text); background: var(--success-bg); font-weight: 700; }
  .meal-schedule-picker { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
  .meal-schedule { display: grid; gap: 5px; min-width: 0; }
  .meal-schedule > span { display: flex; align-items: center; gap: 5px; }
  .meal-schedule > span input { width: 14px; min-height: 14px; accent-color: #10b981; }
  .meal-schedule.disabled { opacity: .5; }
  .combined-time { width: 140px; }
  .choice-block { display: grid; grid-template-columns: 100px minmax(0, 1fr); align-items: center; gap: 12px; margin-bottom: 15px; }
  .schedule-mode { margin-bottom: 20px; }
  .choice-label { color: var(--text-muted); font-size: 11px; font-weight: 700; }
  .segmented { display: inline-flex; width: fit-content; overflow: hidden; border: 1px solid var(--border); border-radius: 7px; }
  .segmented label { cursor: pointer; }
  .segmented input { position: absolute; opacity: 0; }
  .segmented span { display: block; padding: 7px 16px; border-right: 1px solid var(--border); color: var(--text-muted); background: var(--surface); font-size: 11px; }
  .segmented label:last-child span { border-right: 0; }
  .segmented input:checked + span { color: var(--success-text); background: var(--success-bg); font-weight: 700; }
  .option-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
  .check-option, .number-option { display: flex; align-items: center; gap: 9px; min-height: 60px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
  .check-option input { width: 16px; min-height: 16px; accent-color: #10b981; }
  .check-option span, .number-option span { display: grid; }
  .check-option strong, .number-option strong { font-size: 10px; }
  .check-option small, .number-option small { color: var(--text-dim); font-size: 9px; }
  .number-option { justify-content: space-between; }
  .number-option input { width: 66px; min-height: 34px; }
  .form-footer { background: var(--surface); }
  .legal-consent { display: flex; align-items: flex-start; gap: 9px; margin: 14px clamp(18px, 4vw, 42px) 0; padding: 11px 13px; border: 1px solid var(--border); border-radius: 8px; color: var(--text-muted); background: var(--card); font-size: 11px; line-height: 1.6; }
  .legal-consent input { width: 16px; min-height: 16px; margin-top: 1px; flex: 0 0 16px; accent-color: #10b981; }
  .legal-consent label { cursor: pointer; }
  .legal-consent a { color: var(--success-text); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
  .form-footer .feedback { margin: 14px clamp(18px, 4vw, 42px) 0; }
  .form-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 14px clamp(18px, 4vw, 42px) 18px; }
  .delete-btn, .test-btn, .submit-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 9px 16px; border-radius: 8px; font-size: 12px; font-weight: 700; }
  .delete-btn { margin-right: auto; border: 1px solid #fecaca; color: var(--danger-text); background: var(--danger-bg); }
  .test-btn { border: 1px solid var(--border); color: var(--text-muted); background: var(--card); }
  .submit-btn { display: inline-flex; align-items: center; gap: 7px; color: #fff; background: #047857; }
  .submit-btn:hover { background: #065f46; }
  .submit-btn:disabled { opacity: .6; }
  @media (max-width: 760px) {
    .hero { grid-template-columns: 1fr; padding: 26px 20px; }
    .hero-platforms { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .platform-picker { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .restaurant-builder { grid-template-columns: 1fr; }
    .selected-panel { border-top: 1px solid var(--border); border-left: 0; }
    .option-grid, .field-grid { grid-template-columns: 1fr; }
    .schedule-controls { grid-template-columns: 1fr; gap: 14px; }
    .weekday-picker { grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
    .weekday-picker button { font-size: 10px; }
    .wide-field { grid-column: auto; }
    .choice-block { grid-template-columns: 1fr; gap: 6px; }
  }
  @media (max-width: 430px) {
    .hero-platform strong { font-size: 10px; }
    .builder-head { align-items: flex-start; }
    .segmented { width: 100%; }
    .segmented label { flex: 1; text-align: center; }
    .form-footer { position: sticky; bottom: 0; z-index: 3; box-shadow: 0 -8px 18px rgba(15,23,42,.08); }
  }
</style>
