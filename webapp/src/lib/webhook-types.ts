import type { MealTypeName, Restaurant } from '@pmh-only/welplan2-model'

export const WEBHOOK_PLATFORMS = [
  'discord',
  'slack',
  'google-chat',
  'microsoft-teams',
  'mattermost',
  'dooray',
  'swit',
  'jandi'
] as const

export type WebhookPlatform = typeof WEBHOOK_PLATFORMS[number]
export type WebhookMenuFilter = 'all' | 'take-in' | 'take-out'
export type WebhookTargetDateOffset = 0 | 1
export type WebhookScheduleMode = 'combined' | 'per-meal'
export type WebhookMealSchedule = {
  id: 'breakfast' | 'lunch' | 'dinner' | 'combined' | 'legacy'
  mealTypes: MealTypeName[]
  sendTime: string
  enabled: boolean
}

export type WebhookSubscriptionConfig = {
  name: string
  platform: WebhookPlatform
  webhookUrl: string
  enabled: boolean
  restaurantIds: string[]
  weekdays: number[]
  scheduleMode: WebhookScheduleMode
  sendTime: string
  mealSchedules: WebhookMealSchedule[]
  timezone: string
  targetDateOffset: WebhookTargetDateOffset
  mealTypes: MealTypeName[]
  menuFilter: WebhookMenuFilter
  combineRestaurants: boolean
  includeComponents: boolean
  includeCalories: boolean
  includeLinks: boolean
  includeEmptyRestaurants: boolean
  sendIfNoMenus: boolean
  maxMenusPerMealTime: number
  titleTemplate: string
  headerText: string
  footerText: string
  botName: string
  avatarUrl: string
  accentColor: string
}

export type WebhookDeliverySummary = {
  status: 'sending' | 'sent' | 'skipped' | 'failed'
  scheduleDate: string
  menuDate: string
  attempts: number
  responseStatus?: number
  error?: string
  sentAt?: number
  updatedAt: number
}

export type WebhookSubscription = WebhookSubscriptionConfig & {
  id: string
  createdAt: number
  updatedAt: number
  restaurants?: Restaurant[]
  lastDelivery?: WebhookDeliverySummary
}

export type WebhookSubscriptionCreated = {
  subscription: WebhookSubscription
}

export const WEBHOOK_PLATFORM_LABELS: Record<WebhookPlatform, string> = {
  discord: 'Discord',
  slack: 'Slack',
  'google-chat': 'Google Chat',
  'microsoft-teams': 'Microsoft Teams',
  mattermost: 'Mattermost',
  dooray: 'Dooray!',
  swit: 'Swit',
  jandi: '잔디'
}

export const WEBHOOK_MEAL_TYPES: { value: MealTypeName; label: string }[] = [
  { value: 'breakfast', label: '아침' },
  { value: 'lunch', label: '점심' },
  { value: 'dinner', label: '저녁' },
  { value: 'supper', label: '야식' },
  { value: 'snack', label: '간식' },
  { value: 'dawn', label: '새벽' }
]

export const DEFAULT_WEBHOOK_CONFIG: WebhookSubscriptionConfig = {
  name: '',
  platform: 'slack',
  webhookUrl: '',
  enabled: true,
  restaurantIds: [],
  weekdays: [1, 2, 3, 4, 5],
  scheduleMode: 'per-meal',
  sendTime: '09:00',
  mealSchedules: [
    { id: 'breakfast', mealTypes: ['breakfast'], sendTime: '08:00', enabled: true },
    { id: 'lunch', mealTypes: ['lunch'], sendTime: '11:00', enabled: true },
    { id: 'dinner', mealTypes: ['dinner'], sendTime: '17:00', enabled: true }
  ],
  timezone: 'Asia/Seoul',
  targetDateOffset: 0,
  mealTypes: ['breakfast', 'lunch', 'dinner'],
  menuFilter: 'take-in',
  combineRestaurants: true,
  includeComponents: false,
  includeCalories: true,
  includeLinks: true,
  includeEmptyRestaurants: false,
  sendIfNoMenus: true,
  maxMenusPerMealTime: 12,
  titleTemplate: '{date} 메뉴',
  headerText: '',
  footerText: '',
  botName: 'Welplan',
  avatarUrl: '',
  accentColor: '#10b981'
}
