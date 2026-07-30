import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { createHash, randomUUID } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { and, eq, lt, lte, or, sql } from 'drizzle-orm'
import type { MealTime, MealTypeName, Menu, Restaurant } from '@pmh-only/welplan2-model'
import { restaurantDatedPath } from '../restaurant-routes.js'
import {
  WEBHOOK_MEAL_TYPES,
  type WebhookPlatform,
  type WebhookSubscription,
  type WebhookSubscriptionConfig
} from '../webhook-types.js'
import type { CafeteriaService } from './service.js'
import { db, ensureDbInitialized } from './db/index.js'
import { webhookDeliveries } from './db/schema.js'

const MAX_DELIVERY_ATTEMPTS = 5
const STALE_CLAIM_MS = 10 * 60 * 1000
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const nextRequestAtByDestination = new Map<string, number>()
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const MEAL_TYPE_BY_ID: Record<string, MealTypeName> = {
  1: 'breakfast',
  2: 'lunch',
  3: 'dinner',
  4: 'supper',
  5: 'snack'
}

type ZonedDateTime = {
  date: string
  weekday: number
  hour: number
  minute: number
}

type MenuSection = {
  mealTime: MealTime
  menus: Menu[]
}

type RestaurantMenuSnapshot = {
  restaurant: Restaurant
  sections: MenuSection[]
}

type OutboundMessage = {
  title: string
  text: string
}

export type DueWebhookSchedule = {
  scheduleId: string
  scheduleDate: string
  menuDate: string
  mealTypes: MealTypeName[]
}

export type WebhookDeliveryClaim = {
  key: string
  attempts: number
  completedParts: number
  claimToken: string
  scheduleId: string
  scheduleDate: string
  menuDate: string
}

export type WebhookDeliveryResult = {
  messageCount: number
  responseStatus?: number
  skipped: boolean
}

export type RetryableWebhookSchedule = Omit<DueWebhookSchedule, 'mealTypes'> & {
  subscriptionId: string
}

type WebhookDeliveryOptions = {
  startPart?: number
  heartbeat?: () => void | Promise<void>
  bindParts?: (payloadHash: string) => number | Promise<number>
  onPartDelivered?: (completedParts: number, responseStatus: number) => void | Promise<void>
}

type SafeWebhookTarget = {
  url: URL
  address: string
  family: 4 | 6
}

export class WebhookDeliveryError extends Error {
  constructor(message: string, readonly responseStatus?: number, readonly retryAfterMs?: number) {
    super(message)
  }
}

function dateTimeInZone(date: Date, timeZone: string): ZonedDateTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    date: `${values.year}${values.month}${values.day}`,
    weekday: WEEKDAY_INDEX[values.weekday] ?? date.getUTCDay(),
    hour: Number(values.hour),
    minute: Number(values.minute)
  }
}

function shiftCompactDate(date: string, days: number): string {
  const shifted = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)) + days))
  return `${shifted.getUTCFullYear()}${String(shifted.getUTCMonth() + 1).padStart(2, '0')}${String(shifted.getUTCDate()).padStart(2, '0')}`
}

export function dueWebhookSchedules(subscription: WebhookSubscription, now = new Date()): DueWebhookSchedule[] {
  if (!subscription.enabled) return []
  const current = dateTimeInZone(now, subscription.timezone)
  if (!subscription.weekdays.includes(current.weekday)) return []

  const created = dateTimeInZone(new Date(subscription.createdAt), subscription.timezone)
  return subscription.mealSchedules.flatMap((schedule) => {
    if (!schedule.enabled) return []
    const [sendHour, sendMinute] = schedule.sendTime.split(':').map(Number)
    const scheduledMinute = sendHour * 60 + sendMinute
    if (current.hour * 60 + current.minute < scheduledMinute) return []
    if (created.date === current.date && created.hour * 60 + created.minute >= scheduledMinute) return []
    return [{
      scheduleId: schedule.id,
      scheduleDate: current.date,
      menuDate: shiftCompactDate(current.date, subscription.targetDateOffset),
      mealTypes: [...schedule.mealTypes]
    }]
  })
}

export function dueWebhookSchedule(subscription: WebhookSubscription, now = new Date()): DueWebhookSchedule | null {
  return dueWebhookSchedules(subscription, now)[0] ?? null
}

export function webhookScheduleMealTypes(subscription: WebhookSubscription, scheduleId: string): MealTypeName[] {
  const schedule = subscription.mealSchedules.find((schedule) => schedule.id === scheduleId)
  return schedule?.enabled ? [...schedule.mealTypes] : []
}

export function webhookMenuDate(subscription: WebhookSubscription, now = new Date()): string {
  const current = dateTimeInZone(now, subscription.timezone)
  return shiftCompactDate(current.date, subscription.targetDateOffset)
}

function isAllMealTypesSelected(subscription: WebhookSubscription): boolean {
  return WEBHOOK_MEAL_TYPES.every((mealType) => subscription.mealTypes.includes(mealType.value))
}

function shouldIncludeMealTime(mealTime: MealTime, subscription: WebhookSubscription): boolean {
  const type = mealTime.type ?? MEAL_TYPE_BY_ID[mealTime.id]
  return type ? subscription.mealTypes.includes(type) : isAllMealTypesSelected(subscription)
}

function filterMenus(menus: Menu[], subscription: WebhookSubscription): Menu[] {
  const filtered = menus.filter((menu) => {
    if (subscription.menuFilter === 'take-in') return !menu.isTakeOut
    if (subscription.menuFilter === 'take-out') return menu.isTakeOut
    return true
  })
  return filtered.slice(0, subscription.maxMenusPerMealTime)
}

async function menuSnapshot(
  service: CafeteriaService,
  subscription: WebhookSubscription,
  menuDate: string,
  heartbeat?: () => void | Promise<void>
): Promise<RestaurantMenuSnapshot[]> {
  const snapshots: RestaurantMenuSnapshot[] = []

  for (const restaurantId of subscription.restaurantIds) {
    await heartbeat?.()
    const restaurant = await service.getRestaurant(restaurantId)
    await heartbeat?.()
    if (!restaurant) throw new WebhookDeliveryError(`설정된 식당 '${restaurantId}'을 찾을 수 없습니다.`)
    const mealTimes = await service.getMealTimes(restaurant.id)
    await heartbeat?.()
    const sections: MenuSection[] = []

    for (const mealTime of mealTimes.filter((item) => shouldIncludeMealTime(item, subscription))) {
      const menus = filterMenus(await service.getMenus(restaurant.id, menuDate, mealTime.id), subscription)
      await heartbeat?.()
      if (menus.length > 0) sections.push({ mealTime, menus })
    }

    if (sections.length > 0 || subscription.includeEmptyRestaurants) {
      snapshots.push({ restaurant, sections })
    }
  }

  return snapshots
}

function menuDateLabel(date: string): { date: string; weekday: string } {
  const value = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8))))
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return {
    date: `${date.slice(0, 4)}년 ${Number(date.slice(4, 6))}월 ${Number(date.slice(6, 8))}일`,
    weekday: weekdays[value.getUTCDay()]
  }
}

function renderTemplate(template: string, menuDate: string, restaurantCount: number): string {
  const label = menuDateLabel(menuDate)
  return template
    .replaceAll('{date}', label.date)
    .replaceAll('{weekday}', label.weekday)
    .replaceAll('{restaurantCount}', String(restaurantCount))
}

function menuName(menu: Menu): string {
  return menu.parentName ? `${menu.parentName} - ${menu.name}` : menu.name
}

function inlineText(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

function escapedText(platform: WebhookPlatform, value: string): string {
  const text = inlineText(value)
  if (platform === 'slack') {
    return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  }
  if (platform === 'google-chat') {
    return text.replace(/([*_~`])/g, '\\$1').replaceAll('<', '‹').replaceAll('>', '›')
  }
  if (platform === 'mattermost') {
    return text.replaceAll('@', '@\u200b').replace(/([\\`*_[\]()~])/g, '\\$1')
  }
  if (platform === 'swit' || platform === 'jandi') return text
  return text.replace(/([\\`*_[\]()~])/g, '\\$1')
}

function strongText(platform: WebhookPlatform, value: string): string {
  const text = escapedText(platform, value)
  if (platform === 'slack' || platform === 'google-chat') return `*${text}*`
  if (platform === 'swit' || platform === 'jandi') return text
  return `**${text}**`
}

function headingText(platform: WebhookPlatform, value: string): string {
  const text = escapedText(platform, value)
  if (platform === 'discord' || platform === 'mattermost' || platform === 'dooray') return `## ${text}`
  return strongText(platform, value)
}

function linkedText(platform: WebhookPlatform, label: string, url: string): string {
  const text = escapedText(platform, label)
  if (platform === 'slack' || platform === 'google-chat') return `<${url}|${text}>`
  if (platform === 'swit') return `${text}: ${url}`
  return `[${text}](${url})`
}

function snapshotText(
  snapshot: RestaurantMenuSnapshot,
  subscription: WebhookSubscription,
  menuDate: string,
  origin: string | undefined
): string {
  const platform = subscription.platform
  const lines = [headingText(platform, snapshot.restaurant.name), '']
  if (snapshot.sections.length === 0) lines.push('등록된 메뉴가 없습니다.')

  for (const [sectionIndex, section] of snapshot.sections.entries()) {
    if (sectionIndex > 0) lines.push('')
    lines.push(strongText(platform, section.mealTime.name))
    for (const menu of section.menus) {
      const calories = subscription.includeCalories && menu.nutrition?.calories != null
        ? ` (${Math.round(menu.nutrition.calories)} kcal)`
        : ''
      lines.push(`- ${escapedText(platform, menuName(menu))}${calories}`)
      if (subscription.includeComponents) {
        const components = menu.components.map((component) => escapedText(platform, component.name)).filter(Boolean)
        if (components.length > 0) {
          const indent = platform === 'google-chat' ? '    ' : '  '
          const marker = platform === 'swit' || platform === 'jandi' ? '' : '- '
          lines.push(`${indent}${marker}${components.join(' · ')}`)
        }
      }
    }
  }

  if (subscription.includeLinks) {
    if (!origin) throw new WebhookDeliveryError('메뉴 링크 전송에는 Worker의 ORIGIN 설정이 필요합니다.')
    lines.push('', linkedText(
      platform,
      '메뉴 자세히 보기',
      new URL(restaurantDatedPath(snapshot.restaurant, menuDate), origin).toString()
    ))
  }
  return lines.join('\n')
}

function outboundMessages(
  snapshots: RestaurantMenuSnapshot[],
  subscription: WebhookSubscription,
  menuDate: string,
  origin: string | undefined
): OutboundMessage[] {
  if (!origin) throw new WebhookDeliveryError('웹훅 관리 링크 전송에는 Worker의 ORIGIN 설정이 필요합니다.')
  const hasMenus = snapshots.some((snapshot) => snapshot.sections.some((section) => section.menus.length > 0))
  if (!hasMenus && !subscription.sendIfNoMenus) return []

  const title = renderTemplate(subscription.titleTemplate, menuDate, snapshots.length)
  const header = renderTemplate(subscription.headerText, menuDate, snapshots.length)
  const footer = renderTemplate(subscription.footerText, menuDate, snapshots.length)
  const managementLink = linkedText(
    subscription.platform,
    '웹훅 설정 관리',
    new URL(`/webhooks/${encodeURIComponent(subscription.id)}`, origin).toString()
  )
  const visibleSnapshots = snapshots.length > 0 ? snapshots : []

  if (subscription.combineRestaurants) {
    const body = visibleSnapshots.length > 0
      ? visibleSnapshots.map((snapshot) => snapshotText(snapshot, subscription, menuDate, origin)).join('\n\n')
      : '등록된 메뉴가 없습니다.'
    return [{ title, text: [header, body, footer, managementLink].filter(Boolean).join('\n\n') }]
  }

  if (visibleSnapshots.length === 0) {
    return [{ title, text: [header, '등록된 메뉴가 없습니다.', footer, managementLink].filter(Boolean).join('\n\n') }]
  }

  return visibleSnapshots.map((snapshot) => ({
    title: `${title} · ${snapshot.restaurant.name}`,
    text: [header, snapshotText(snapshot, subscription, menuDate, origin), footer, managementLink].filter(Boolean).join('\n\n')
  }))
}

function platformTextLimit(platform: WebhookPlatform): number {
  switch (platform) {
    case 'discord': return 1900
    case 'slack': return 3900
    case 'jandi': return 4500
    case 'dooray': return 9000
    case 'swit': return 9000
    case 'mattermost': return 16_383
    case 'google-chat': return 1900
    case 'microsoft-teams': return 4000
    default: return 35_000
  }
}

function splitText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text]
  const chunks: string[] = []
  let current = ''
  for (const line of text.split('\n')) {
    if (line.length > limit) {
      if (current) chunks.push(current)
      const characters = Array.from(line)
      for (let index = 0; index < characters.length; index += limit) {
        chunks.push(characters.slice(index, index + limit).join(''))
      }
      current = ''
      continue
    }
    const next = current ? `${current}\n${line}` : line
    if (next.length > limit) {
      chunks.push(current)
      current = line
    } else {
      current = next
    }
  }
  if (current) chunks.push(current)
  return chunks
}

function payloadForPlatform(
  subscription: WebhookSubscription,
  message: OutboundMessage,
  continuation: boolean
): Record<string, unknown> {
  const rawTitle = continuation ? `${message.title} (계속)` : message.title
  const title = escapedText(subscription.platform, rawTitle)
  const text = message.text

  switch (subscription.platform) {
    case 'discord':
      return { content: `**${title}**\n${text}`, allowed_mentions: { parse: [] } }
    case 'slack':
      return { text: `*${title}*\n${text}` }
    case 'google-chat':
      return { text: `*${title}*\n${text}` }
    case 'microsoft-teams':
      return {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.2',
            fallbackText: inlineText(rawTitle),
            body: [
              { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Large', wrap: true },
              { type: 'TextBlock', text, wrap: true }
            ]
          }
        }]
      }
    case 'mattermost':
      return {
        text: `**${title}**\n${text}`,
        username: subscription.botName,
        ...(subscription.avatarUrl ? { icon_url: subscription.avatarUrl } : {})
      }
    case 'dooray':
      return {
        botName: subscription.botName,
        ...(subscription.avatarUrl ? { botIconImage: subscription.avatarUrl } : {}),
        text: `**${title}**\n${text}`
      }
    case 'swit':
      return { text: `${title}\n${text}` }
    case 'jandi':
      return {
        body: title,
        connectColor: subscription.accentColor,
        connectInfo: [{ title, description: text }]
      }
  }
}

function assertPayloadFitsPlatform(platform: WebhookPlatform, payload: Record<string, unknown>): void {
  const serializedBytes = Buffer.byteLength(JSON.stringify(payload))
  if (platform === 'google-chat' && serializedBytes >= 32_000) {
    throw new WebhookDeliveryError('Google Chat 메시지가 32KB 제한을 초과했습니다.')
  }
  if (platform === 'microsoft-teams' && serializedBytes >= 27_000) {
    throw new WebhookDeliveryError('Microsoft Teams 메시지가 크기 제한을 초과했습니다.')
  }
  if (platform === 'jandi' && serializedBytes >= 256_000) {
    throw new WebhookDeliveryError('잔디 메시지가 256KB 제한을 초과했습니다.')
  }

  const text = platform === 'discord'
    ? payload.content
    : platform === 'jandi'
      ? payload.body
      : payload.text
  if (typeof text !== 'string') return
  const characters = Array.from(text).length
  if (platform === 'discord' && characters > 2000) {
    throw new WebhookDeliveryError('Discord 메시지가 2,000자 제한을 초과했습니다.')
  }
  if (platform === 'google-chat' && characters > 2000) {
    throw new WebhookDeliveryError('Google Chat 메시지가 2,000자 제한을 초과했습니다.')
  }
  if (platform === 'mattermost' && characters > 16_383) {
    throw new WebhookDeliveryError('Mattermost 메시지가 글자 수 제한을 초과했습니다.')
  }
}

function testPayloadForPlatform(subscription: WebhookSubscriptionConfig): Record<string, unknown> {
  const text = 'Welplan 웹훅 테스트가 정상적으로 도착했습니다.'
  switch (subscription.platform) {
    case 'discord':
      return { content: text, allowed_mentions: { parse: [] } }
    case 'slack':
    case 'google-chat':
    case 'swit':
      return { text }
    case 'microsoft-teams':
      return {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.2',
            fallbackText: text,
            body: [{ type: 'TextBlock', text, wrap: true }]
          }
        }]
      }
    case 'mattermost':
      return { text, username: subscription.botName }
    case 'dooray':
      return { botName: subscription.botName, text }
    case 'jandi':
      return { body: text }
  }
}

function envFlag(name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(process.env[name]?.trim().toLowerCase() ?? '')
}

function requestTimeoutMs(): number {
  const parsed = Number(process.env.WEBHOOK_REQUEST_TIMEOUT_MS)
  return Number.isFinite(parsed) && parsed >= 100 && parsed <= 60_000 ? parsed : DEFAULT_REQUEST_TIMEOUT_MS
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true
  const [a, b] = parts
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIpv4(address)
  const normalized = address.toLowerCase()
  if (normalized.startsWith('::ffff:')) return isPrivateIpv4(normalized.slice(7))
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') ||
    normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)
}

async function lookupWithDeadline(hostname: string): Promise<{ address: string; family: number }[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      lookup(hostname, { all: true }).catch(() => []),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new WebhookDeliveryError('웹훅 호스트 확인 시간이 초과되었습니다.')),
          requestTimeoutMs()
        )
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function assertSafeWebhookTarget(rawUrl: string): Promise<SafeWebhookTarget> {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:' && !(envFlag('WEBHOOK_ALLOW_HTTP') && url.protocol === 'http:')) {
    throw new WebhookDeliveryError('웹훅 URL은 HTTPS여야 합니다.')
  }
  const hostname = url.hostname.startsWith('[') && url.hostname.endsWith(']')
    ? url.hostname.slice(1, -1)
    : url.hostname
  const literalFamily = isIP(hostname)
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookupWithDeadline(hostname)
  if (addresses.length === 0) throw new WebhookDeliveryError('웹훅 호스트를 확인할 수 없습니다.')
  if (!envFlag('WEBHOOK_ALLOW_PRIVATE_NETWORKS') && addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new WebhookDeliveryError('내부 네트워크 웹훅은 사용할 수 없습니다.')
  }
  const target = addresses.find(({ family }) => family === 4) ?? addresses[0]
  return { url, address: target.address, family: target.family as 4 | 6 }
}

function retryAfterMs(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return undefined
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(raw)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined
}

function responseRetryAfterMs(
  platform: WebhookPlatform,
  status: number,
  header: string | string[] | undefined,
  detail: string
): number | undefined {
  const fromHeader = retryAfterMs(header)
  if (fromHeader !== undefined || platform !== 'discord' || status !== 429) return fromHeader
  try {
    const seconds = Number((JSON.parse(detail) as { retry_after?: unknown }).retry_after)
    return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined
  } catch {
    return undefined
  }
}

function responseJson(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

function isSuccessfulWebhookResponse(platform: WebhookPlatform, status: number, body: string): boolean {
  switch (platform) {
    case 'discord':
      return status === 200 && typeof responseJson(body)?.id === 'string'
    case 'slack':
    case 'mattermost':
      return status === 200 && body.trim() === 'ok'
    case 'google-chat':
      return status === 200 && typeof responseJson(body)?.name === 'string'
    case 'microsoft-teams':
      return status === 200 || status === 202
    case 'dooray':
    case 'swit':
    case 'jandi':
      return status === 200
  }
}

async function postWebhook(
  subscription: WebhookSubscriptionConfig,
  payload: Record<string, unknown>,
  deliveryKey: string
): Promise<number> {
  const target = await assertSafeWebhookTarget(subscription.webhookUrl)
  if (subscription.platform === 'discord') target.url.searchParams.set('wait', 'true')
  await waitForRequestSlot(subscription)
  const body = JSON.stringify(payload)
  return await new Promise<number>((resolve, reject) => {
    let settled = false
    const deadline: { timer?: ReturnType<typeof setTimeout> } = {}
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      if (deadline.timer) clearTimeout(deadline.timer)
      callback()
    }
    const requester = target.url.protocol === 'https:' ? httpsRequest : httpRequest
    const request = requester(target.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': subscription.platform === 'discord'
          ? 'DiscordBot (https://welplan.pmh.codes, 1.0)'
          : 'Welplan-Webhook/1.0',
        'X-Welplan-Delivery': deliveryKey,
        'Content-Length': Buffer.byteLength(body),
        ...(subscription.platform === 'jandi'
          ? { Accept: 'application/vnd.tosslab.jandi-v2+json' }
          : {})
      },
      lookup: (_hostname, options, callback) => {
        if (typeof options === 'object' && options.all) {
          const allCallback = callback as unknown as (
            error: NodeJS.ErrnoException | null,
            addresses: { address: string; family: number }[]
          ) => void
          allCallback(null, [{ address: target.address, family: target.family }])
          return
        }
        callback(null, target.address, target.family)
      }
    }, (response) => {
      let detail = ''
      response.setEncoding('utf8')
      const responseFailed = () => finish(() => reject(new WebhookDeliveryError('웹훅 서버 응답을 읽을 수 없습니다.')))
      response.on('error', responseFailed)
      response.on('aborted', responseFailed)
      response.on('data', (chunk: string) => {
        if (detail.length < 64_000) detail += chunk.slice(0, 64_000 - detail.length)
      })
      response.on('end', () => {
        const status = response.statusCode ?? 0
        if (isSuccessfulWebhookResponse(subscription.platform, status, detail)) {
          finish(() => resolve(status))
          return
        }
        const normalizedDetail = detail.replace(/\s+/g, ' ').trim().slice(0, 300)
        const unexpectedSuccess = status >= 200 && status < 300
          ? ' 웹훅 제공자의 예상 응답 형식과 일치하지 않습니다.'
          : ''
        finish(() => reject(new WebhookDeliveryError(
          `웹훅 서버가 HTTP ${status} 오류를 반환했습니다.${unexpectedSuccess}${normalizedDetail ? ` ${normalizedDetail}` : ''}`,
          status,
          responseRetryAfterMs(subscription.platform, status, response.headers['retry-after'], detail)
        )))
      })
    })
    const timeoutMs = requestTimeoutMs()
    request.setTimeout(timeoutMs, () => request.destroy(new Error('timeout')))
    deadline.timer = setTimeout(() => request.destroy(new Error('deadline exceeded')), timeoutMs)
    request.on('error', (error: NodeJS.ErrnoException) => finish(() => reject(new WebhookDeliveryError(
      `웹훅 서버에 연결할 수 없습니다.${error.code ? ` (${error.code})` : ''}`
    ))))
    request.end(body)
  })
}

function requestIntervalMs(platform: WebhookPlatform): number {
  if (platform === 'google-chat' || platform === 'slack') return 1100
  if (platform === 'dooray') return 1100
  if (platform === 'jandi') return 1250
  return 400
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForRequestSlot(subscription: WebhookSubscriptionConfig): Promise<void> {
  const interval = requestIntervalMs(subscription.platform)
  const key = `${subscription.platform}\0${subscription.webhookUrl}`
  const now = Date.now()
  const requestAt = Math.max(now, nextRequestAtByDestination.get(key) ?? now)
  const nextRequestAt = requestAt + interval
  nextRequestAtByDestination.set(key, nextRequestAt)

  const cleanup = setTimeout(() => {
    if (nextRequestAtByDestination.get(key) === nextRequestAt) nextRequestAtByDestination.delete(key)
  }, Math.max(0, nextRequestAt - Date.now()))
  cleanup.unref()

  if (requestAt > now) await wait(requestAt - now)
}

export async function deliverWebhookTest(
  subscription: WebhookSubscriptionConfig,
  deliveryKey: string
): Promise<WebhookDeliveryResult> {
  const payload = testPayloadForPlatform(subscription)
  assertPayloadFitsPlatform(subscription.platform, payload)
  const responseStatus = await postWebhook(subscription, payload, deliveryKey)
  return { messageCount: 1, responseStatus, skipped: false }
}

export async function deliverWebhookSubscription(
  service: CafeteriaService,
  subscription: WebhookSubscription,
  menuDate: string,
  origin: string | undefined,
  deliveryKey: string,
  options: WebhookDeliveryOptions = {}
): Promise<WebhookDeliveryResult> {
  await options.heartbeat?.()
  const snapshots = await menuSnapshot(service, subscription, menuDate, options.heartbeat)
  const messages = outboundMessages(snapshots, subscription, menuDate, origin)
  if (messages.length === 0) return { messageCount: 0, skipped: true }

  const limit = platformTextLimit(subscription.platform)
  const parts: Record<string, unknown>[] = []
  for (const message of messages) {
    const titleAllowance = message.title.length + 16
    const chunks = splitText(message.text, Math.max(500, limit - titleAllowance))
    for (const [index, chunk] of chunks.entries()) {
      const payload = payloadForPlatform(subscription, { ...message, text: chunk }, index > 0)
      assertPayloadFitsPlatform(subscription.platform, payload)
      parts.push(payload)
    }
  }

  const payloadHash = createHash('sha256')
    .update(subscription.platform)
    .update('\0')
    .update(subscription.webhookUrl)
    .update('\0')
    .update(JSON.stringify(parts))
    .digest('hex')
  const requestedStartPart = options.bindParts
    ? await options.bindParts(payloadHash)
    : options.startPart ?? 0
  const startPart = Math.max(0, Math.min(parts.length, requestedStartPart))
  let responseStatus: number | undefined
  for (let index = startPart; index < parts.length; index++) {
    await options.heartbeat?.()
    responseStatus = await postWebhook(subscription, parts[index], `${deliveryKey}:${index + 1}`)
    await options.onPartDelivered?.(index + 1, responseStatus)
  }
  return { messageCount: parts.length, responseStatus, skipped: false }
}

function retryableDeliveryCondition(now: number) {
  return or(
    and(
      eq(webhookDeliveries.status, 'failed'),
      lte(webhookDeliveries.nextAttemptAt, now),
      lt(webhookDeliveries.attempts, MAX_DELIVERY_ATTEMPTS)
    ),
    and(
      eq(webhookDeliveries.status, 'sending'),
      lte(webhookDeliveries.claimedAt, now - STALE_CLAIM_MS),
      lt(webhookDeliveries.attempts, MAX_DELIVERY_ATTEMPTS)
    )
  )
}

const claimSelection = {
  key: webhookDeliveries.key,
  attempts: webhookDeliveries.attempts,
  completedParts: webhookDeliveries.completedParts,
  claimToken: webhookDeliveries.claimToken,
  payloadHash: webhookDeliveries.payloadHash,
  scheduleId: webhookDeliveries.scheduleId,
  scheduleDate: webhookDeliveries.scheduleDate,
  menuDate: webhookDeliveries.menuDate
}

export async function renewWebhookDeliveryClaim(
  claim: WebhookDeliveryClaim,
  now = Date.now()
): Promise<void> {
  const updated = await db.update(webhookDeliveries).set({
    claimedAt: now,
    updatedAt: now
  }).where(and(
    eq(webhookDeliveries.key, claim.key),
    eq(webhookDeliveries.claimToken, claim.claimToken),
    eq(webhookDeliveries.status, 'sending')
  )).returning({ key: webhookDeliveries.key }).execute()
  if (updated.length === 0) throw new WebhookDeliveryError('웹훅 전송 작업의 소유권이 만료되었습니다.')
}

export async function bindWebhookDeliveryPayload(
  claim: WebhookDeliveryClaim,
  payloadHash: string,
  now = Date.now()
): Promise<number> {
  const updated = await db.update(webhookDeliveries).set({
    completedParts: sql`case
      when ${webhookDeliveries.payloadHash} is null or ${webhookDeliveries.payloadHash} = ${payloadHash}
        then ${webhookDeliveries.completedParts}
      else 0
    end`,
    payloadHash,
    claimedAt: now,
    updatedAt: now
  }).where(and(
    eq(webhookDeliveries.key, claim.key),
    eq(webhookDeliveries.claimToken, claim.claimToken),
    eq(webhookDeliveries.status, 'sending')
  )).returning({ completedParts: webhookDeliveries.completedParts }).execute()
  if (!updated[0]) throw new WebhookDeliveryError('웹훅 전송 작업의 소유권이 만료되었습니다.')
  return updated[0].completedParts
}

export async function claimWebhookDelivery(
  subscriptionId: string,
  schedule: DueWebhookSchedule,
  now = Date.now()
): Promise<WebhookDeliveryClaim | null> {
  await ensureDbInitialized()
  const key = schedule.scheduleId === 'legacy'
    ? `${subscriptionId}:${schedule.scheduleDate}`
    : `${subscriptionId}:${schedule.scheduleDate}:${schedule.scheduleId}`
  const claimToken = randomUUID()
  const inserted = await db.insert(webhookDeliveries).values({
    key,
    subscriptionId,
    kind: 'scheduled',
    scheduleId: schedule.scheduleId,
    scheduleDate: schedule.scheduleDate,
    menuDate: schedule.menuDate,
    status: 'sending',
    attempts: 1,
    completedParts: 0,
    claimToken,
    claimedAt: now,
    createdAt: now,
    updatedAt: now
  }).onConflictDoNothing().returning(claimSelection).execute()
  if (inserted[0]?.claimToken) return inserted[0] as WebhookDeliveryClaim

  const nextClaimToken = randomUUID()
  const claimed = await db.update(webhookDeliveries).set({
    status: 'sending',
    attempts: sql`${webhookDeliveries.attempts} + 1`,
    claimToken: nextClaimToken,
    claimedAt: now,
    updatedAt: now,
    error: null
  }).where(and(eq(webhookDeliveries.key, key), retryableDeliveryCondition(now))).returning(claimSelection).execute()
  return claimed[0]?.claimToken ? claimed[0] as WebhookDeliveryClaim : null
}

export async function listRetryableWebhookSchedules(now = Date.now()): Promise<RetryableWebhookSchedule[]> {
  await ensureDbInitialized()
  return await db.select({
    subscriptionId: webhookDeliveries.subscriptionId,
    scheduleId: webhookDeliveries.scheduleId,
    scheduleDate: webhookDeliveries.scheduleDate,
    menuDate: webhookDeliveries.menuDate
  }).from(webhookDeliveries).where(retryableDeliveryCondition(now)).execute()
}

export async function recordWebhookDeliveryPart(
  claim: WebhookDeliveryClaim,
  completedParts: number,
  responseStatus: number,
  now = Date.now()
): Promise<void> {
  const updated = await db.update(webhookDeliveries).set({
    completedParts,
    responseStatus,
    claimedAt: now,
    updatedAt: now
  }).where(and(
    eq(webhookDeliveries.key, claim.key),
    eq(webhookDeliveries.claimToken, claim.claimToken),
    eq(webhookDeliveries.status, 'sending')
  )).returning({ key: webhookDeliveries.key }).execute()
  if (updated.length === 0) throw new WebhookDeliveryError('웹훅 전송 작업의 소유권이 만료되었습니다.')
}

export async function completeWebhookDelivery(
  claim: WebhookDeliveryClaim,
  result: WebhookDeliveryResult,
  now = Date.now()
): Promise<void> {
  await db.update(webhookDeliveries).set({
    status: result.skipped ? 'skipped' : 'sent',
    responseStatus: result.responseStatus ?? null,
    error: result.skipped ? '메뉴가 없어 전송을 건너뜀' : null,
    sentAt: now,
    nextAttemptAt: null,
    updatedAt: now
  }).where(and(
    eq(webhookDeliveries.key, claim.key),
    eq(webhookDeliveries.claimToken, claim.claimToken),
    eq(webhookDeliveries.status, 'sending')
  )).execute()
}

export async function failWebhookDelivery(
  claim: WebhookDeliveryClaim,
  error: unknown,
  now = Date.now()
): Promise<void> {
  const backoff = Math.min(60 * 60 * 1000, 60 * 1000 * (2 ** Math.max(0, claim.attempts - 1)))
  const retryDelay = error instanceof WebhookDeliveryError
    ? Math.max(backoff, error.retryAfterMs ?? 0)
    : backoff
  const message = error instanceof Error ? error.message.slice(0, 1000) : '알 수 없는 전송 오류'
  const responseStatus = error instanceof WebhookDeliveryError ? error.responseStatus : undefined
  await db.update(webhookDeliveries).set({
    status: 'failed',
    responseStatus: responseStatus ?? null,
    error: message,
    nextAttemptAt: now + retryDelay,
    updatedAt: now
  }).where(and(
    eq(webhookDeliveries.key, claim.key),
    eq(webhookDeliveries.claimToken, claim.claimToken),
    eq(webhookDeliveries.status, 'sending')
  )).execute()
}

export async function claimWebhookTestDelivery(subscriptionId: string, now = Date.now()): Promise<string | null> {
  await ensureDbInitialized()
  await db.delete(webhookDeliveries).where(and(
    eq(webhookDeliveries.kind, 'test'),
    lt(webhookDeliveries.createdAt, now - 24 * 60 * 60 * 1000)
  )).execute()
  const key = `test:${subscriptionId}:${Math.floor(now / 60_000)}`
  const inserted = await db.insert(webhookDeliveries).values({
    key,
    subscriptionId,
    kind: 'test',
    scheduleDate: 'test',
    menuDate: 'test',
    status: 'sent',
    attempts: 1,
    completedParts: 0,
    createdAt: now,
    updatedAt: now
  }).onConflictDoNothing().returning({ key: webhookDeliveries.key }).execute()
  return inserted[0]?.key ?? null
}
