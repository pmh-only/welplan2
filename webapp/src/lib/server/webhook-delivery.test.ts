import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { MealTime, Menu, Restaurant } from '@pmh-only/welplan2-model'
import {
  activeTermsVersion,
  PRIVACY_VERSION,
  TERMS_EFFECTIVE_AT,
  TERMS_PRIOR_VERSION,
  TERMS_VERSION
} from '../legal.js'
import { DEFAULT_WEBHOOK_CONFIG, WEBHOOK_PLATFORMS, type WebhookSubscription } from '../webhook-types.js'
import type { CafeteriaService } from './service.js'
import {
  deliverDiscordWorkerAlert,
  deliverWebhookSubscription,
  deliverWebhookTest,
  dueWebhookSchedule,
  dueWebhookSchedules,
  WebhookDeliveryError,
  webhookMenuDate
} from './webhook-delivery.js'
import {
  assertWebhookRegistrationRequest,
  normalizeWebhookLegalAcceptance,
  normalizeWebhookSubscriptionConfig,
  normalizeWebhookSubscriptionUpdate
} from './webhook-subscriptions.js'

let server: Server
let webhookUrl = ''
let requests: { path: string; body: string; bytes: number; headers: IncomingHttpHeaders; receivedAt: number }[] = []
let failRequestNumber: number | undefined

const restaurant: Restaurant = { id: 'restaurant-1', name: '테스트 식당', vendor: 'shinsegae' }
const mealTime: MealTime = { id: '2', name: '점심', type: 'lunch' }
const menu: Menu = {
  id: 'menu-1',
  name: '비빔밥',
  date: '20260730',
  mealTimeId: mealTime.id,
  restaurantId: restaurant.id,
  vendor: restaurant.vendor,
  components: [{ name: '국' }, { name: '김치' }],
  nutrition: { calories: 640 },
  isTakeOut: false
}

function subscription(overrides: Partial<WebhookSubscription> = {}): WebhookSubscription {
  return {
    ...DEFAULT_WEBHOOK_CONFIG,
    id: 'subscription-1',
    createdAt: Date.parse('2026-07-28T00:00:00Z'),
    updatedAt: Date.parse('2026-07-28T00:00:00Z'),
    webhookUrl,
    restaurantIds: [restaurant.id],
    mealTypes: ['lunch'],
    weekdays: [4],
    scheduleMode: 'combined',
    sendTime: '09:00',
    mealSchedules: [{ id: 'legacy', mealTypes: ['lunch'], sendTime: '09:00', enabled: true }],
    ...overrides
  }
}

test('calculates due schedules in the subscription timezone', () => {
  const item = subscription({ targetDateOffset: 1 })
  assert.deepEqual(dueWebhookSchedule(item, new Date('2026-07-30T00:00:00Z')), {
    scheduleId: 'legacy',
    scheduleDate: '20260730',
    menuDate: '20260731',
    mealTypes: ['lunch']
  })
  assert.equal(webhookMenuDate(item, new Date('2026-07-30T00:00:00Z')), '20260731')
  assert.equal(dueWebhookSchedule(item, new Date('2026-07-29T23:59:00Z')), null)
  assert.equal(dueWebhookSchedule(item, new Date('2026-07-31T00:00:00Z')), null)
})

test('returns independent due schedules for breakfast, lunch, and dinner', () => {
  const item = subscription({
    scheduleMode: 'per-meal',
    mealSchedules: [
      { id: 'breakfast', mealTypes: ['breakfast'], sendTime: '08:00', enabled: true },
      { id: 'lunch', mealTypes: ['lunch'], sendTime: '11:00', enabled: true },
      { id: 'dinner', mealTypes: ['dinner'], sendTime: '17:00', enabled: true }
    ]
  })
  assert.deepEqual(
    dueWebhookSchedules(item, new Date('2026-07-30T03:00:00Z')).map((schedule) => schedule.scheduleId),
    ['breakfast', 'lunch']
  )
  assert.deepEqual(
    dueWebhookSchedules(item, new Date('2026-07-30T08:00:00Z')).map((schedule) => schedule.scheduleId),
    ['breakfast', 'lunch', 'dinner']
  )
})

test('does not backfill a schedule created after its send time', () => {
  const item = subscription({ createdAt: Date.parse('2026-07-30T00:05:00Z') })
  assert.equal(dueWebhookSchedule(item, new Date('2026-07-30T01:00:00Z')), null)
})

test('forces webhook subscriptions enabled', () => {
  const normalized = normalizeWebhookSubscriptionConfig({
    ...subscription({ enabled: false }),
    webhookUrl: 'https://example.com/webhook',
    name: 'Custom name',
    titleTemplate: 'Custom title',
    headerText: 'Custom header',
    footerText: 'Custom footer',
    botName: 'Custom bot',
    avatarUrl: 'https://example.com/icon.png',
    accentColor: '#ff0000',
    includeComponents: true,
    menuFilter: 'take-out',
    timezone: 'America/New_York',
    targetDateOffset: 1
  })
  assert.equal(normalized.enabled, true)
  assert.equal(normalized.name, 'Slack 메뉴 알림')
  assert.equal(normalized.titleTemplate, DEFAULT_WEBHOOK_CONFIG.titleTemplate)
  assert.equal(normalized.headerText, '')
  assert.equal(normalized.footerText, '')
  assert.equal(normalized.botName, DEFAULT_WEBHOOK_CONFIG.botName)
  assert.equal(normalized.avatarUrl, '')
  assert.equal(normalized.accentColor, DEFAULT_WEBHOOK_CONFIG.accentColor)
  assert.equal(normalized.includeComponents, false)
  assert.equal(normalized.timezone, 'Asia/Seoul')
  assert.equal(normalized.targetDateOffset, 0)
  assert.equal(normalized.menuFilter, 'take-in')
})

test('requires explicit legal acceptance for webhook registration', () => {
  const acceptedAt = TERMS_EFFECTIVE_AT - 1
  const currentAcceptance = {
    legalAcceptance: { accepted: true, termsVersion: TERMS_PRIOR_VERSION, privacyVersion: PRIVACY_VERSION }
  }
  assert.deepEqual(normalizeWebhookLegalAcceptance(currentAcceptance, acceptedAt), {
    termsVersion: TERMS_PRIOR_VERSION,
    privacyVersion: PRIVACY_VERSION,
    acceptedAt
  })
  assert.throws(() => normalizeWebhookLegalAcceptance({}), /이용약관에 동의/)
  assert.throws(() => normalizeWebhookLegalAcceptance({
    legalAcceptance: { ...currentAcceptance.legalAcceptance, termsVersion: 'outdated' }
  }), /변경되었습니다/)
})

test('activates the amended terms on their announced effective date', () => {
  assert.equal(activeTermsVersion(TERMS_EFFECTIVE_AT - 1), TERMS_PRIOR_VERSION)
  assert.equal(activeTermsVersion(TERMS_EFFECTIVE_AT), TERMS_VERSION)
})

test('accepts webhook registrations only from same-origin JSON requests', () => {
  const request = (contentType: string, origin?: string) => new Request('https://welplan.example.com/api/webhooks/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...(origin ? { Origin: origin } : {}) },
    body: '{}'
  })
  assert.doesNotThrow(() => assertWebhookRegistrationRequest(
    request('application/json; charset=utf-8', 'https://welplan.example.com'),
    'https://welplan.example.com'
  ))
  assert.doesNotThrow(() => assertWebhookRegistrationRequest(
    request('application/json'),
    'https://welplan.example.com'
  ))
  assert.throws(() => assertWebhookRegistrationRequest(
    request('text/plain', 'https://attacker.example.com'),
    'https://welplan.example.com'
  ), /JSON 요청/)
  assert.throws(() => assertWebhookRegistrationRequest(
    request('application/json', 'https://attacker.example.com'),
    'https://welplan.example.com'
  ), /다른 사이트/)
})

test('normalizes enabled meal schedules into delivery meal types', () => {
  const normalized = normalizeWebhookSubscriptionConfig({
    ...subscription(),
    webhookUrl: 'https://example.com/webhook',
    scheduleMode: 'per-meal',
    mealSchedules: [
      { id: 'breakfast', sendTime: '07:30', enabled: false },
      { id: 'lunch', sendTime: '10:45', enabled: true },
      { id: 'dinner', sendTime: '16:30', enabled: true }
    ]
  })
  assert.deepEqual(normalized.mealTypes, ['lunch', 'dinner'])
  assert.equal(normalized.sendTime, '10:45')
  assert.deepEqual(normalized.mealSchedules, [
    { id: 'breakfast', mealTypes: ['breakfast'], sendTime: '07:30', enabled: false },
    { id: 'lunch', mealTypes: ['lunch'], sendTime: '10:45', enabled: true },
    { id: 'dinner', mealTypes: ['dinner'], sendTime: '16:30', enabled: true }
  ])
})

test('normalizes combined delivery into one three-meal schedule', () => {
  const normalized = normalizeWebhookSubscriptionConfig({
    ...subscription(),
    webhookUrl: 'https://example.com/webhook',
    scheduleMode: 'combined',
    sendTime: '12:15',
    mealSchedules: DEFAULT_WEBHOOK_CONFIG.mealSchedules
  })
  assert.equal(normalized.scheduleMode, 'combined')
  assert.equal(normalized.sendTime, '12:15')
  assert.deepEqual(normalized.mealTypes, ['breakfast', 'lunch', 'dinner'])
  assert.deepEqual(normalized.mealSchedules, [{
    id: 'combined',
    mealTypes: ['breakfast', 'lunch', 'dinner'],
    sendTime: '12:15',
    enabled: true
  }])
})

test('rejects destination changes while updating a subscription', () => {
  const existing = subscription({ webhookUrl: 'https://hooks.slack.com/services/T/B/secret' })
  assert.throws(
    () => normalizeWebhookSubscriptionUpdate(existing, { webhookUrl: 'https://hooks.slack.com/services/T/B/other' }),
    /전송 채널을 변경할 수 없습니다/
  )
  assert.throws(
    () => normalizeWebhookSubscriptionUpdate(existing, { platform: 'discord' }),
    /협업 도구나 전송 채널을 변경할 수 없습니다/
  )
})

const originalAllowHttp = process.env.WEBHOOK_ALLOW_HTTP
const originalAllowPrivate = process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS

before(async () => {
  process.env.WEBHOOK_ALLOW_HTTP = 'on'
  process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS = 'on'
  server = createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      requests.push({
        path: request.url ?? '/',
        body,
        bytes: Buffer.byteLength(body),
        headers: request.headers,
        receivedAt: Date.now()
      })
      if (request.url === '/redirect') {
        response.writeHead(307, { Location: '/target' }).end()
      } else if (request.url?.startsWith('/discord-rate-limit')) {
        response.writeHead(429, { 'Content-Type': 'application/json' }).end(JSON.stringify({ retry_after: 0.25 }))
      } else if (request.url === '/invalid-slack') {
        response.writeHead(200).end()
      } else if (request.url?.startsWith('/invalid-discord')) {
        response.writeHead(204).end()
      } else if (request.url === '/stream') {
        response.writeHead(200, { 'Content-Type': 'text/plain' })
        const timer = setInterval(() => response.write('x'), 25)
        response.on('close', () => clearInterval(timer))
      } else if (requests.length === failRequestNumber) {
        response.writeHead(429, { 'Retry-After': '0' }).end('rate limited')
      } else if (request.url?.includes('discord')) {
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: 'message-1' }))
      } else if (request.url?.includes('google-chat')) {
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ name: 'spaces/space/messages/message' }))
      } else if (request.url?.includes('microsoft-teams')) {
        response.writeHead(202).end()
      } else if (request.url?.includes('mattermost')) {
        response.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok')
      } else if (request.url?.includes('slack') || request.url === '/webhook') {
        response.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok')
      } else {
        response.writeHead(200).end()
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('test server did not start')
  webhookUrl = `http://127.0.0.1:${address.port}/webhook`
})

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  if (originalAllowHttp === undefined) delete process.env.WEBHOOK_ALLOW_HTTP
  else process.env.WEBHOOK_ALLOW_HTTP = originalAllowHttp
  if (originalAllowPrivate === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS
  else process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS = originalAllowPrivate
})

test('renders and posts a compatible payload for every supported platform', async () => {
  requests = []
  const service = {
    getRestaurant: async () => restaurant,
    getMealTimes: async () => [mealTime],
    getMenus: async () => [menu]
  } as unknown as CafeteriaService

  const expectedKeys: Record<(typeof WEBHOOK_PLATFORMS)[number], string> = {
    discord: 'components',
    slack: 'blocks',
    'google-chat': 'cardsV2',
    'microsoft-teams': 'attachments',
    mattermost: 'attachments',
    dooray: 'attachments',
    swit: 'text',
    jandi: 'connectInfo'
  }

  for (const platform of WEBHOOK_PLATFORMS) {
    requests.length = 0
    const result = await deliverWebhookSubscription(
      service,
      subscription({ platform, webhookUrl: `${webhookUrl}/${platform}` }),
      '20260730',
      'https://welplan.example.com',
      `test:${platform}`
    )
    assert.equal(result.messageCount, 1, platform)
    assert.equal(result.responseStatus, platform === 'microsoft-teams' ? 202 : 200, platform)
    assert.equal(requests.length, 1, platform)
    const payload = JSON.parse(requests[0].body) as Record<string, unknown>
    assert.ok(expectedKeys[platform] in payload, platform)
    assert.match(JSON.stringify(payload), /비빔밥/, platform)
    assert.match(JSON.stringify(payload), /webhooks\/subscription-1/, platform)

    if (platform === 'discord') {
      assert.deepEqual(Object.keys(payload).sort(), ['allowed_mentions', 'components', 'flags'])
      assert.equal(payload.flags, 32_768)
      assert.deepEqual(payload.allowed_mentions, { parse: [] })
      const container = (payload.components as Record<string, unknown>[])[0]
      assert.equal(container.type, 17)
      assert.equal(container.accent_color, 0x10b981)
      const components = container.components as Record<string, unknown>[]
      assert.deepEqual(components.map((component) => component.type), [10, 14, 10, 14, 10])
      assert.match(String(components[0].content), /^# 🍽️ 2026년 7월 30일 메뉴/)
      assert.match(String(components[2].content), /## 🏢 테스트 식당/)
      assert.match(String(components[4].content), /웹훅 설정 관리/)
      assert.equal(requests[0].path, '/webhook/discord?wait=true&with_components=true')
      assert.equal(requests[0].headers['user-agent'], 'DiscordBot (https://welplan.pmh.codes, 1.0)')
    } else if (platform === 'slack') {
      assert.deepEqual(Object.keys(payload), ['text', 'blocks'])
      const blocks = payload.blocks as Record<string, unknown>[]
      assert.deepEqual(blocks.map((block) => block.type), ['header', 'section', 'divider', 'context'])
      assert.equal((blocks[0].text as Record<string, unknown>).type, 'plain_text')
      assert.match(String((blocks[0].text as Record<string, unknown>).text), /^🍽️ 2026년 7월 30일 메뉴/)
      assert.match(JSON.stringify(blocks[1]), /\*🏢 테스트 식당\*/)
      assert.match(JSON.stringify(blocks[3]), /웹훅 설정 관리/)
      assert.doesNotMatch(JSON.stringify(blocks), /"type":"actions"/)
    } else if (platform === 'google-chat') {
      assert.deepEqual(Object.keys(payload), ['fallbackText', 'cardsV2'])
      const card = (payload.cardsV2 as Record<string, unknown>[])[0].card as Record<string, unknown>
      assert.equal((card.header as Record<string, unknown>).subtitle, 'Welplan 메뉴 알림')
      const sections = card.sections as Record<string, unknown>[]
      const contentWidget = (sections[0].widgets as Record<string, unknown>[])[0]
      const paragraph = contentWidget.textParagraph as Record<string, unknown>
      assert.match(String(paragraph.text), /<b>🏢 테스트 식당<\/b>/)
      assert.match(String(paragraph.text), /<br>/)
      const buttonWidget = (sections[1].widgets as Record<string, unknown>[])[0]
      const button = ((buttonWidget.buttonList as Record<string, unknown>).buttons as Record<string, unknown>[])[0]
      assert.equal(((button.onClick as Record<string, unknown>).openLink as Record<string, unknown>).url, 'https://welplan.example.com/webhooks/subscription-1')
    } else if (platform === 'microsoft-teams') {
      assert.deepEqual(Object.keys(payload).sort(), ['attachments', 'type'])
      assert.equal(payload.type, 'message')
      const attachment = (payload.attachments as Record<string, unknown>[])[0]
      assert.equal(attachment.contentType, 'application/vnd.microsoft.card.adaptive')
      assert.equal(attachment.contentUrl, null)
      const card = attachment.content as Record<string, unknown>
      assert.equal(card.type, 'AdaptiveCard')
      assert.equal(card.version, '1.2')
      assert.match(String(card.fallbackText), /^2026년 7월 30일 메뉴:/)
      assert.doesNotMatch(JSON.stringify(card.body), /##/)
      assert.equal(((card.body as Record<string, unknown>[])[2]).type, 'Container')
      assert.deepEqual((card.actions as Record<string, unknown>[])[0], {
        type: 'Action.OpenUrl',
        title: '웹훅 설정 관리',
        url: 'https://welplan.example.com/webhooks/subscription-1'
      })
    } else if (platform === 'mattermost') {
      assert.deepEqual(Object.keys(payload).sort(), ['attachments', 'text', 'username'])
      assert.equal(payload.username, 'Welplan')
      assert.match(String(payload.text), /^### 🍽️/)
      const attachment = (payload.attachments as Record<string, unknown>[])[0]
      assert.equal(attachment.color, '#10b981')
      assert.equal(attachment.title_link, 'https://welplan.example.com/webhooks/subscription-1')
      assert.match(String(attachment.text), /## 🏢 테스트 식당/)
    } else if (platform === 'dooray') {
      assert.deepEqual(Object.keys(payload).sort(), ['attachments', 'botName', 'text'])
      assert.equal(payload.botName, 'Welplan')
      assert.equal(payload.text, '🍽️ Welplan 메뉴 알림')
      const attachment = (payload.attachments as Record<string, unknown>[])[0]
      assert.equal(attachment.color, 'green')
      assert.equal(attachment.titleLink, 'https://welplan.example.com/webhooks/subscription-1')
      assert.match(String(attachment.text), /## 🏢 테스트 식당/)
    } else if (platform === 'swit') {
      assert.deepEqual(Object.keys(payload), ['text'])
      assert.doesNotMatch(String(payload.text), /##|\*\*/)
      assert.match(String(payload.text), /^🍽️ 2026년 7월 30일 메뉴/)
      assert.match(String(payload.text), /⚙️ 웹훅 설정 관리/)
    } else if (platform === 'jandi') {
      assert.deepEqual(Object.keys(payload).sort(), ['body', 'connectColor', 'connectInfo'])
      assert.equal(payload.body, '[⚙️ 웹훅 설정 관리](https://welplan.example.com/webhooks/subscription-1)')
      assert.equal(payload.connectColor, '#10b981')
      assert.equal((payload.connectInfo as Record<string, unknown>[])[0]?.title, '🍽️ 2026년 7월 30일 메뉴')
      assert.doesNotMatch(String((payload.connectInfo as Record<string, unknown>[])[0]?.description), /##|\*\*/)
      assert.equal(requests[0].headers.accept, 'application/vnd.tosslab.jandi-v2+json')
    }
    assert.equal(requests[0].headers['content-type'], 'application/json; charset=UTF-8')
  }
})

test('sends a minimal test message without loading or rendering menus', async () => {
  requests = []
  for (const platform of WEBHOOK_PLATFORMS) {
    const result = await deliverWebhookTest(
      subscription({ platform, webhookUrl: `${webhookUrl}/simple-${platform}` }),
      `simple:${platform}`
    )
    assert.equal(result.messageCount, 1, platform)
  }

  assert.equal(requests.length, WEBHOOK_PLATFORMS.length)
  for (const [index, request] of requests.entries()) {
    const platform = WEBHOOK_PLATFORMS[index]
    const payload = JSON.parse(request.body) as Record<string, unknown>
    assert.match(request.body, /Welplan 웹훅 테스트가 정상적으로 도착했습니다/)
    assert.doesNotMatch(request.body, /비빔밥|테스트 식당|webhooks\/subscription-1/)
    if (platform === 'discord') assert.deepEqual(Object.keys(payload).sort(), ['allowed_mentions', 'content'])
    if (platform === 'slack' || platform === 'google-chat' || platform === 'swit') {
      assert.deepEqual(Object.keys(payload), ['text'])
    }
    if (platform === 'microsoft-teams') {
      assert.deepEqual(Object.keys(payload).sort(), ['attachments', 'type'])
      assert.equal(((payload.attachments as Record<string, unknown>[])[0]?.content as Record<string, unknown>).version, '1.2')
    }
    if (platform === 'mattermost') assert.deepEqual(Object.keys(payload).sort(), ['text', 'username'])
    if (platform === 'dooray') assert.deepEqual(Object.keys(payload).sort(), ['botName', 'text'])
    if (platform === 'jandi') {
      assert.deepEqual(Object.keys(payload), ['body'])
      assert.equal(request.headers.accept, 'application/vnd.tosslab.jandi-v2+json')
    }
  }
})

test('sends worker alerts to Discord with mentions disabled', async () => {
  requests = []
  const responseStatus = await deliverDiscordWorkerAlert(
    `${webhookUrl}/discord-worker-alert`,
    'Worker failed for @everyone',
    'worker-alert-test'
  )

  assert.equal(responseStatus, 200)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].path, '/webhook/discord-worker-alert?wait=true')
  assert.equal(requests[0].headers['x-welplan-delivery'], 'worker-alert-test')
  assert.deepEqual(JSON.parse(requests[0].body), {
    content: 'Worker failed for @everyone',
    allowed_mentions: { parse: [] }
  })
})

test('rejects success responses that do not match provider contracts', async () => {
  await assert.rejects(
    deliverWebhookTest(subscription({ webhookUrl: `${webhookUrl.replace('/webhook', '')}/invalid-slack` }), 'invalid-slack'),
    /예상 응답 형식/
  )
  await assert.rejects(
    deliverWebhookTest(subscription({
      platform: 'discord',
      webhookUrl: `${webhookUrl.replace('/webhook', '')}/invalid-discord`
    }), 'invalid-discord'),
    /예상 응답 형식/
  )
})

test('limits Dooray deliveries to one request per second', async () => {
  requests = []
  const restaurants: Restaurant[] = [
    { ...restaurant, id: 'restaurant-1' },
    { ...restaurant, id: 'restaurant-2' }
  ]
  const service = {
    getRestaurant: async (id: string) => restaurants.find((item) => item.id === id) ?? null,
    getMealTimes: async () => [mealTime],
    getMenus: async (id: string) => [{ ...menu, id: `menu-${id}`, restaurantId: id }]
  } as unknown as CafeteriaService

  await deliverWebhookSubscription(
    service,
    subscription({
      platform: 'dooray',
      webhookUrl: `${webhookUrl}/dooray-rate`,
      restaurantIds: restaurants.map((item) => item.id),
      combineRestaurants: false
    }),
    '20260730',
    'https://welplan.example.com',
    'dooray-rate'
  )

  assert.equal(requests.length, 2)
  assert.ok(requests[1].receivedAt - requests[0].receivedAt >= 1050)
})

test('shares JANDI rate limits by destination across deliveries', async () => {
  requests = []
  const service = {
    getRestaurant: async () => restaurant,
    getMealTimes: async () => [mealTime],
    getMenus: async () => [menu]
  } as unknown as CafeteriaService
  const item = subscription({ platform: 'jandi', webhookUrl: `${webhookUrl}/jandi-rate` })

  await Promise.all([
    deliverWebhookSubscription(service, item, '20260730', 'https://welplan.example.com', 'jandi-rate-1'),
    deliverWebhookSubscription(service, item, '20260730', 'https://welplan.example.com', 'jandi-rate-2')
  ])

  assert.equal(requests.length, 2)
  assert.ok(requests[1].receivedAt - requests[0].receivedAt >= 1200)
})

test('skips delivery when no menus match and empty notifications are disabled', async () => {
  requests = []
  const service = {
    getRestaurant: async () => restaurant,
    getMealTimes: async () => [mealTime],
    getMenus: async () => []
  } as unknown as CafeteriaService
  const result = await deliverWebhookSubscription(
    service,
    subscription({ sendIfNoMenus: false }),
    '20260730',
    'https://welplan.example.com',
    'test:empty'
  )
  assert.deepEqual(result, { messageCount: 0, skipped: true })
  assert.equal(requests.length, 0)
})

test('resumes after the last successful message part', async () => {
  requests = []
  failRequestNumber = 2
  let completedParts = 0
  const restaurants: Restaurant[] = [
    { ...restaurant, id: 'restaurant-1', name: '첫 번째 식당' },
    { ...restaurant, id: 'restaurant-2', name: '두 번째 식당' }
  ]
  const service = {
    getRestaurant: async (id: string) => restaurants.find((item) => item.id === id) ?? null,
    getMealTimes: async () => [mealTime],
    getMenus: async (id: string) => [{ ...menu, id: `menu-${id}`, restaurantId: id }]
  } as unknown as CafeteriaService
  const item = subscription({
    restaurantIds: restaurants.map((item) => item.id),
    combineRestaurants: false
  })

  await assert.rejects(
    deliverWebhookSubscription(service, item, '20260730', 'https://welplan.example.com', 'partial', {
      onPartDelivered: (count) => { completedParts = count }
    }),
    /HTTP 429/
  )
  assert.equal(completedParts, 1)
  failRequestNumber = undefined
  await deliverWebhookSubscription(service, item, '20260730', 'https://welplan.example.com', 'partial', {
    startPart: completedParts,
    onPartDelivered: (count) => { completedParts = count }
  })
  assert.equal(completedParts, 2)
  assert.equal(requests.length, 3)
  assert.equal(requests.filter((request) => request.body.includes('첫 번째 식당')).length, 1)
})

test('does not follow webhook redirects', async () => {
  requests = []
  const service = {
    getRestaurant: async () => restaurant,
    getMealTimes: async () => [mealTime],
    getMenus: async () => [menu]
  } as unknown as CafeteriaService
  await assert.rejects(
    deliverWebhookSubscription(
      service,
      subscription({ webhookUrl: webhookUrl.replace('/webhook', '/redirect') }),
      '20260730',
      'https://welplan.example.com',
      'redirect'
    ),
    /HTTP 307/
  )
  assert.deepEqual(requests.map((request) => request.path), ['/redirect'])
})

test('uses Discord JSON retry_after when the header is absent', async () => {
  requests = []
  const service = {
    getRestaurant: async () => restaurant,
    getMealTimes: async () => [mealTime],
    getMenus: async () => [menu]
  } as unknown as CafeteriaService

  await assert.rejects(
    deliverWebhookSubscription(
      service,
      subscription({ platform: 'discord', webhookUrl: `${webhookUrl.replace('/webhook', '')}/discord-rate-limit` }),
      '20260730',
      'https://welplan.example.com',
      'discord-rate-limit'
    ),
    (error) => error instanceof WebhookDeliveryError && error.responseStatus === 429 && error.retryAfterMs === 250
  )
})

test('posts through a DNS-pinned hostname', async () => {
  requests = []
  const service = {
    getRestaurant: async () => restaurant,
    getMealTimes: async () => [mealTime],
    getMenus: async () => [menu]
  } as unknown as CafeteriaService

  const result = await deliverWebhookSubscription(
    service,
    subscription({ webhookUrl: webhookUrl.replace('127.0.0.1', 'localhost') }),
    '20260730',
    'https://welplan.example.com',
    'hostname'
  )
  assert.equal(result.responseStatus, 200)
  assert.equal(requests.length, 1)
})

test('keeps Teams payloads below the platform byte limit', async () => {
  requests = []
  const largeMenu = { ...menu, name: '🍱'.repeat(10_000) }
  const service = {
    getRestaurant: async () => restaurant,
    getMealTimes: async () => [mealTime],
    getMenus: async () => [largeMenu]
  } as unknown as CafeteriaService
  const result = await deliverWebhookSubscription(
    service,
    subscription({ platform: 'microsoft-teams' }),
    '20260730',
    'https://welplan.example.com',
    'teams-size'
  )
  assert.ok(result.messageCount > 1)
  assert.ok(requests.every((request) => request.bytes < 28_000), requests.map((request) => request.bytes).join(','))
})

test('splits rich cards within Slack, Google Chat, and JANDI limits', async () => {
  const largeMenu = { ...menu, name: '한'.repeat(5000) }
  const service = {
    getRestaurant: async () => restaurant,
    getMealTimes: async () => [mealTime],
    getMenus: async () => [largeMenu]
  } as unknown as CafeteriaService

  for (const platform of ['slack', 'google-chat', 'jandi'] as const) {
    requests = []
    const result = await deliverWebhookSubscription(
      service,
      subscription({ platform, webhookUrl: `${webhookUrl}/${platform}-size` }),
      '20260730',
      'https://welplan.example.com',
      `${platform}-size`
    )
    assert.ok(result.messageCount > 1, platform)
    for (const request of requests) {
      const payload = JSON.parse(request.body) as Record<string, unknown>
      if (platform === 'slack') {
        const blocks = payload.blocks as Record<string, unknown>[]
        const section = blocks.find((block) => block.type === 'section') as Record<string, unknown>
        assert.ok(Array.from(String((section.text as Record<string, unknown>).text)).length <= 3000)
      } else if (platform === 'google-chat') {
        assert.ok(request.bytes < 32_000)
      } else {
        const info = payload.connectInfo as Record<string, unknown>[]
        const displayed = [payload.body, ...info.flatMap((item) => [item.title, item.description])]
          .filter((item): item is string => typeof item === 'string')
          .join('\n')
        assert.ok(Array.from(displayed).length <= 5000)
        assert.ok(request.bytes < 256_000)
      }
    }
  }
})

test('keeps fallback mentions inert and rich markup balanced', async () => {
  const hostileMenu = { ...menu, name: '<!channel> @channel <menu&>'.repeat(100) }
  const service = {
    getRestaurant: async () => restaurant,
    getMealTimes: async () => [mealTime],
    getMenus: async () => [hostileMenu]
  } as unknown as CafeteriaService

  requests = []
  await deliverWebhookSubscription(
    service,
    subscription({ platform: 'slack', webhookUrl: `${webhookUrl}/slack-safe-fallback` }),
    '20260730',
    'https://welplan.example.com',
    'slack-safe-fallback'
  )
  for (const request of requests) {
    const payload = JSON.parse(request.body) as { text: string }
    assert.doesNotMatch(payload.text, /<!channel>/)
  }

  requests = []
  await deliverWebhookSubscription(
    service,
    subscription({ platform: 'mattermost', webhookUrl: `${webhookUrl}/mattermost-safe-fallback` }),
    '20260730',
    'https://welplan.example.com',
    'mattermost-safe-fallback'
  )
  for (const request of requests) {
    const payload = JSON.parse(request.body) as { attachments: { fallback: string }[] }
    assert.doesNotMatch(payload.attachments[0].fallback, /@channel/)
  }

  requests = []
  await deliverWebhookSubscription(
    service,
    subscription({ platform: 'google-chat', webhookUrl: `${webhookUrl}/google-chat-balanced` }),
    '20260730',
    'https://welplan.example.com',
    'google-chat-balanced'
  )
  for (const request of requests) {
    const payload = JSON.parse(request.body) as Record<string, unknown>
    const card = (payload.cardsV2 as Record<string, unknown>[])[0].card as Record<string, unknown>
    const section = (card.sections as Record<string, unknown>[])[0]
    const widget = (section.widgets as Record<string, unknown>[])[0]
    const text = String((widget.textParagraph as Record<string, unknown>).text)
    assert.equal(text.match(/<b>/g)?.length ?? 0, text.match(/<\/b>/g)?.length ?? 0)
    assert.equal(text.match(/<a href=/g)?.length ?? 0, text.match(/<\/a>/g)?.length ?? 0)
  }
})

test('keeps Mattermost posts below its default character limit', async () => {
  requests = []
  const largeMenu = { ...menu, name: '한'.repeat(20_000) }
  const service = {
    getRestaurant: async () => restaurant,
    getMealTimes: async () => [mealTime],
    getMenus: async () => [largeMenu]
  } as unknown as CafeteriaService
  const result = await deliverWebhookSubscription(
    service,
    subscription({ platform: 'mattermost', webhookUrl: `${webhookUrl}/mattermost-size` }),
    '20260730',
    'https://welplan.example.com',
    'mattermost-size'
  )

  assert.ok(result.messageCount > 1)
  assert.ok(requests.every((request) => {
    const payload = JSON.parse(request.body) as { attachments: { text: string }[] }
    return Array.from(payload.attachments[0].text).length <= 16_383
  }))
})

test('propagates menu data failures instead of sending an empty menu', async () => {
  requests = []
  const service = {
    getRestaurant: async () => restaurant,
    getMealTimes: async () => { throw new Error('vendor unavailable') },
    getMenus: async () => []
  } as unknown as CafeteriaService
  await assert.rejects(
    deliverWebhookSubscription(service, subscription(), '20260730', 'https://welplan.example.com', 'failure'),
    /vendor unavailable/
  )
  assert.equal(requests.length, 0)
})

test('enforces a wall-clock deadline on streaming webhook responses', async () => {
  requests = []
  const originalTimeout = process.env.WEBHOOK_REQUEST_TIMEOUT_MS
  process.env.WEBHOOK_REQUEST_TIMEOUT_MS = '150'
  const service = {
    getRestaurant: async () => restaurant,
    getMealTimes: async () => [mealTime],
    getMenus: async () => [menu]
  } as unknown as CafeteriaService
  const startedAt = Date.now()
  try {
    await assert.rejects(
      deliverWebhookSubscription(
        service,
        subscription({ webhookUrl: webhookUrl.replace('/webhook', '/stream') }),
        '20260730',
        'https://welplan.example.com',
        'deadline'
      ),
      /응답|연결/
    )
    assert.ok(Date.now() - startedAt < 1000)
  } finally {
    if (originalTimeout === undefined) delete process.env.WEBHOOK_REQUEST_TIMEOUT_MS
    else process.env.WEBHOOK_REQUEST_TIMEOUT_MS = originalTimeout
  }
})

test('checks claim ownership after menu preparation and before posting', async () => {
  requests = []
  let heartbeatCount = 0
  const service = {
    getRestaurant: async () => restaurant,
    getMealTimes: async () => [mealTime],
    getMenus: async () => [menu]
  } as unknown as CafeteriaService
  await assert.rejects(
    deliverWebhookSubscription(
      service,
      subscription(),
      '20260730',
      'https://welplan.example.com',
      'ownership',
      {
        heartbeat: () => {
          heartbeatCount++
          if (heartbeatCount === 5) throw new Error('claim expired')
        }
      }
    ),
    /claim expired/
  )
  assert.equal(requests.length, 0)
})
