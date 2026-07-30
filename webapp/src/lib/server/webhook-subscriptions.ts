import { createHash, randomUUID } from 'node:crypto'
import { and, desc, eq, lt, sql } from 'drizzle-orm'
import type { MealTypeName } from '@pmh-only/welplan2-model'
import {
  DEFAULT_WEBHOOK_CONFIG,
  WEBHOOK_MEAL_TYPES,
  WEBHOOK_PLATFORM_LABELS,
  WEBHOOK_PLATFORMS,
  type WebhookDeliverySummary,
  type WebhookMealSchedule,
  type WebhookScheduleMode,
  type WebhookPlatform,
  type WebhookSubscription,
  type WebhookSubscriptionConfig,
  type WebhookSubscriptionCreated
} from '../webhook-types.js'
import { db, ensureDbInitialized } from './db/index.js'
import { webhookDeliveries, webhookRegistrationLimits, webhookSubscriptions } from './db/schema.js'

const MAX_RESTAURANTS = 20
const MAX_URL_LENGTH = 4096
const REGISTRATION_WINDOW_MS = 15 * 60 * 1000
const MAX_REGISTRATIONS_PER_WINDOW = 5
const mealTypes = new Set<MealTypeName>(WEBHOOK_MEAL_TYPES.map((mealType) => mealType.value))

export class WebhookValidationError extends Error {}

function normalizedString(value: unknown, field: string, maxLength: number, required = false): string {
  if (typeof value !== 'string') {
    if (required) throw new WebhookValidationError(`${field} 항목을 입력해 주세요.`)
    return ''
  }
  const normalized = value.normalize('NFKC').trim()
  if (required && !normalized) throw new WebhookValidationError(`${field} 항목을 입력해 주세요.`)
  if (normalized.length > maxLength) throw new WebhookValidationError(`${field} 항목이 너무 깁니다.`)
  return normalized
}

function normalizedUrl(value: unknown, field: string, required: boolean, allowStoredHttp: boolean): string {
  const raw = normalizedString(value, field, MAX_URL_LENGTH, required)
  if (!raw) return ''

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new WebhookValidationError(`${field} 주소가 올바르지 않습니다.`)
  }

  const allowHttp = allowStoredHttp || ['1', 'true', 'yes', 'on'].includes(
    process.env.WEBHOOK_ALLOW_HTTP?.trim().toLowerCase() ?? ''
  )
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new WebhookValidationError(`${field} 주소는 HTTPS여야 합니다.`)
  }
  if (url.username || url.password) throw new WebhookValidationError(`${field} 주소에 사용자 정보를 포함할 수 없습니다.`)
  return url.toString()
}

function normalizedPlatform(value: unknown): WebhookPlatform {
  if (typeof value === 'string' && WEBHOOK_PLATFORMS.includes(value as WebhookPlatform)) {
    return value as WebhookPlatform
  }
  throw new WebhookValidationError('지원하지 않는 협업 도구입니다.')
}

function normalizedWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) throw new WebhookValidationError('전송 요일을 선택해 주세요.')
  const values = [...new Set(value.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
  if (values.length === 0) throw new WebhookValidationError('전송 요일을 하나 이상 선택해 주세요.')
  return values
}

function normalizedRestaurantIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new WebhookValidationError('식당을 선택해 주세요.')
  const values = [...new Set(value
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter(Boolean))]
  if (values.length === 0) throw new WebhookValidationError('식당을 하나 이상 선택해 주세요.')
  if (values.length > MAX_RESTAURANTS) throw new WebhookValidationError(`식당은 최대 ${MAX_RESTAURANTS}개까지 선택할 수 있습니다.`)
  return values
}

function normalizedMealTypes(value: unknown): MealTypeName[] {
  if (!Array.isArray(value)) throw new WebhookValidationError('식사 시간을 선택해 주세요.')
  const values = [...new Set(value.filter((mealType): mealType is MealTypeName => mealTypes.has(mealType as MealTypeName)))]
  if (values.length === 0) throw new WebhookValidationError('식사 시간을 하나 이상 선택해 주세요.')
  return values
}

function normalizedTime(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new WebhookValidationError('전송 시간을 올바르게 입력해 주세요.')
  }
  return value
}

function normalizedMealSchedules(
  value: unknown,
  legacyMealTypes: MealTypeName[],
  legacySendTime: string,
  scheduleMode: WebhookScheduleMode
): WebhookMealSchedule[] {
  if (!Array.isArray(value)) {
    const mealTypes = legacyMealTypes.filter((mealType) => (
      mealType === 'breakfast' || mealType === 'lunch' || mealType === 'dinner'
    ))
    return [{
      id: 'legacy',
      mealTypes: mealTypes.length > 0 ? mealTypes : ['breakfast', 'lunch', 'dinner'],
      sendTime: legacySendTime,
      enabled: true
    }]
  }

  const legacy = value.find((item): item is Record<string, unknown> => (
    Boolean(item) && typeof item === 'object' && (item as Record<string, unknown>).id === 'legacy'
  ))
  if (legacy) {
    const mealTypes = normalizedMealTypes(legacy.mealTypes).filter((mealType) => (
      mealType === 'breakfast' || mealType === 'lunch' || mealType === 'dinner'
    ))
    return [{
      id: 'legacy',
      mealTypes: mealTypes.length > 0 ? mealTypes : ['breakfast', 'lunch', 'dinner'],
      sendTime: normalizedTime(legacy.sendTime),
      enabled: true
    }]
  }

  if (scheduleMode === 'combined') {
    const combined = value.find((item): item is Record<string, unknown> => (
      Boolean(item) && typeof item === 'object' && (item as Record<string, unknown>).id === 'combined'
    ))
    return [{
      id: 'combined',
      mealTypes: ['breakfast', 'lunch', 'dinner'],
      sendTime: combined ? normalizedTime(combined.sendTime) : legacySendTime,
      enabled: true
    }]
  }

  const inputById = new Map(value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => [item.id, item]))
  const schedules = DEFAULT_WEBHOOK_CONFIG.mealSchedules.map((fallback) => {
    const input = inputById.get(fallback.id)
    return {
      id: fallback.id,
      mealTypes: [...fallback.mealTypes],
      sendTime: input ? normalizedTime(input.sendTime) : fallback.sendTime,
      enabled: input ? normalizedBoolean(input.enabled, fallback.enabled) : false
    }
  })
  if (!schedules.some((schedule) => schedule.enabled)) {
    throw new WebhookValidationError('전송할 식사 시간을 하나 이상 선택해 주세요.')
  }
  return schedules
}

function normalizedBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizedScheduleMode(value: unknown, schedules: unknown): WebhookScheduleMode {
  if (value === 'combined' || value === 'per-meal') return value
  if (Array.isArray(schedules) && schedules.some((item) => (
    Boolean(item) && typeof item === 'object' && ['breakfast', 'lunch', 'dinner'].includes(
      String((item as Record<string, unknown>).id)
    )
  ))) return 'per-meal'
  return 'combined'
}

function normalizedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export function normalizeWebhookSubscriptionConfig(
  value: unknown,
  options: { allowStoredHttp?: boolean } = {}
): WebhookSubscriptionConfig {
  if (!value || typeof value !== 'object') throw new WebhookValidationError('설정 형식이 올바르지 않습니다.')
  const input = value as Record<string, unknown>
  const platform = normalizedPlatform(input.platform)
  const sendTime = normalizedTime(input.sendTime)
  const legacyMealTypes = normalizedMealTypes(input.mealTypes)
  const scheduleMode = normalizedScheduleMode(input.scheduleMode, input.mealSchedules)
  const mealSchedules = normalizedMealSchedules(input.mealSchedules, legacyMealTypes, sendTime, scheduleMode)
  const enabledSchedules = mealSchedules.filter((schedule) => schedule.enabled)

  return {
    name: `${WEBHOOK_PLATFORM_LABELS[platform]} 메뉴 알림`,
    platform,
    webhookUrl: normalizedUrl(input.webhookUrl, '웹훅 URL', true, options.allowStoredHttp === true),
    enabled: true,
    restaurantIds: normalizedRestaurantIds(input.restaurantIds),
    weekdays: normalizedWeekdays(input.weekdays),
    scheduleMode,
    sendTime: enabledSchedules[0]?.sendTime ?? sendTime,
    mealSchedules,
    timezone: DEFAULT_WEBHOOK_CONFIG.timezone,
    targetDateOffset: DEFAULT_WEBHOOK_CONFIG.targetDateOffset,
    mealTypes: [...new Set(enabledSchedules.flatMap((schedule) => schedule.mealTypes))],
    menuFilter: 'take-in',
    combineRestaurants: normalizedBoolean(input.combineRestaurants, true),
    includeComponents: false,
    includeCalories: normalizedBoolean(input.includeCalories, true),
    includeLinks: normalizedBoolean(input.includeLinks, true),
    includeEmptyRestaurants: normalizedBoolean(input.includeEmptyRestaurants, false),
    sendIfNoMenus: normalizedBoolean(input.sendIfNoMenus, true),
    maxMenusPerMealTime: normalizedInteger(input.maxMenusPerMealTime, 1, 30, DEFAULT_WEBHOOK_CONFIG.maxMenusPerMealTime),
    titleTemplate: DEFAULT_WEBHOOK_CONFIG.titleTemplate,
    headerText: '',
    footerText: '',
    botName: DEFAULT_WEBHOOK_CONFIG.botName,
    avatarUrl: '',
    accentColor: DEFAULT_WEBHOOK_CONFIG.accentColor
  }
}

function subscriptionFromRow(row: typeof webhookSubscriptions.$inferSelect): WebhookSubscription | null {
  try {
    const config = normalizeWebhookSubscriptionConfig(JSON.parse(row.data), { allowStoredHttp: true })
    return { ...config, enabled: true, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt }
  } catch {
    return null
  }
}

async function subscriptionRow(id: string): Promise<typeof webhookSubscriptions.$inferSelect | undefined> {
  await ensureDbInitialized()
  const rows = await db.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.id, id)).limit(1).execute()
  return rows[0]
}

export async function consumeWebhookRegistrationLimit(address: string, now = Date.now()): Promise<boolean> {
  await ensureDbInitialized()
  const addressHash = createHash('sha256').update(address).digest('hex')
  const expiredBefore = now - REGISTRATION_WINDOW_MS
  await db.delete(webhookRegistrationLimits)
    .where(lt(webhookRegistrationLimits.windowStartedAt, expiredBefore))
    .execute()
  const rows = await db.insert(webhookRegistrationLimits).values({
    addressHash,
    windowStartedAt: now,
    attempts: 1
  }).onConflictDoUpdate({
    target: webhookRegistrationLimits.addressHash,
    set: {
      windowStartedAt: sql`case
        when ${webhookRegistrationLimits.windowStartedAt} <= ${expiredBefore} then ${now}
        else ${webhookRegistrationLimits.windowStartedAt}
      end`,
      attempts: sql`case
        when ${webhookRegistrationLimits.windowStartedAt} <= ${expiredBefore} then 1
        else ${webhookRegistrationLimits.attempts} + 1
      end`
    }
  }).returning({ attempts: webhookRegistrationLimits.attempts }).execute()
  return (rows[0]?.attempts ?? MAX_REGISTRATIONS_PER_WINDOW + 1) <= MAX_REGISTRATIONS_PER_WINDOW
}

export async function createWebhookSubscription(value: unknown): Promise<WebhookSubscriptionCreated> {
  const config = normalizeWebhookSubscriptionConfig(value)
  const id = randomUUID()
  const now = Date.now()
  await ensureDbInitialized()
  await db.insert(webhookSubscriptions).values({
    id,
    manageTokenHash: createHash('sha256').update(id).digest('hex'),
    platform: config.platform,
    enabled: config.enabled,
    data: JSON.stringify(config),
    createdAt: now,
    updatedAt: now
  }).execute()
  return { subscription: { ...config, id, createdAt: now, updatedAt: now } }
}

export async function getWebhookSubscription(id: string): Promise<WebhookSubscription | null> {
  const row = await subscriptionRow(id)
  return row ? subscriptionFromRow(row) : null
}

async function updateWebhookSubscriptionRow(
  row: typeof webhookSubscriptions.$inferSelect,
  value: unknown
): Promise<WebhookSubscription> {
  const existing = subscriptionFromRow(row)
  if (!existing) throw new WebhookValidationError('저장된 웹훅 설정을 읽을 수 없습니다.')
  const config = normalizeWebhookSubscriptionUpdate(existing, value)
  const now = Date.now()
  await db.update(webhookSubscriptions).set({
    platform: config.platform,
    enabled: config.enabled,
    data: JSON.stringify(config),
    updatedAt: now
  }).where(eq(webhookSubscriptions.id, row.id)).execute()
  return { ...config, id: row.id, createdAt: row.createdAt, updatedAt: now }
}

export function normalizeWebhookSubscriptionUpdate(
  existing: WebhookSubscriptionConfig,
  value: unknown
): WebhookSubscriptionConfig {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const config = normalizeWebhookSubscriptionConfig({ ...existing, ...input })
  if (config.platform !== existing.platform || config.webhookUrl !== existing.webhookUrl) {
    throw new WebhookValidationError('등록 후에는 협업 도구나 전송 채널을 변경할 수 없습니다.')
  }
  return config
}

export async function updateWebhookSubscriptionById(id: string, value: unknown): Promise<WebhookSubscription | null> {
  const row = await subscriptionRow(id)
  return row ? updateWebhookSubscriptionRow(row, value) : null
}

export async function deleteWebhookSubscriptionById(id: string): Promise<boolean> {
  await ensureDbInitialized()
  const deleted = await db.delete(webhookSubscriptions)
    .where(eq(webhookSubscriptions.id, id))
    .returning({ id: webhookSubscriptions.id })
    .execute()
  return deleted.length > 0
}

export async function listEnabledWebhookSubscriptions(): Promise<WebhookSubscription[]> {
  await ensureDbInitialized()
  const rows = await db.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.enabled, true)).execute()
  return rows.flatMap((row) => {
    const subscription = subscriptionFromRow(row)
    return subscription ? [subscription] : []
  })
}

export async function getLatestWebhookDelivery(subscriptionId: string): Promise<WebhookDeliverySummary | undefined> {
  await ensureDbInitialized()
  const rows = await db.select().from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.subscriptionId, subscriptionId), eq(webhookDeliveries.kind, 'scheduled')))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(1)
    .execute()
  const row = rows[0]
  if (!row || (row.status !== 'sending' && row.status !== 'sent' && row.status !== 'skipped' && row.status !== 'failed')) return undefined
  return {
    status: row.status,
    scheduleDate: row.scheduleDate,
    menuDate: row.menuDate,
    attempts: row.attempts,
    responseStatus: row.responseStatus ?? undefined,
    error: row.error ?? undefined,
    sentAt: row.sentAt ?? undefined,
    updatedAt: row.updatedAt
  }
}
