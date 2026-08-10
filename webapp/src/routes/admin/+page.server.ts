import { deliverDiscordWorkerAlert } from '$lib/server/webhook-delivery'
import {
  normalizeWorkerProblemAlertSettings,
  service,
  type CacheTableName,
  type NoticeSettings,
  type WorkerProblemAlertSettings
} from '$lib/server/service'
import type { Restaurant, Vendor } from '$lib/types'
import type { Actions, PageServerLoad } from './$types'

const CACHE_TABLES: CacheTableName[] = [
  'restaurants',
  'mealTimes',
  'menus',
  'menuDetails',
  'menuNutrientDetails',
  'precomputedPages',
  'images'
]

function cacheTableFromUrl(url: URL): CacheTableName {
  const table = url.searchParams.get('cacheTable')
  return CACHE_TABLES.includes(table as CacheTableName) ? table as CacheTableName : 'restaurants'
}

function numberParam(url: URL, name: string, fallback: number): number {
  const value = Number(url.searchParams.get(name))
  return Number.isFinite(value) ? value : fallback
}

function stringFormValue(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

function isVendor(value: unknown): value is Vendor {
  return value === 'welstory' || value === 'shinsegae'
}

function restaurantFormValue(restaurant: Pick<Restaurant, 'id' | 'vendor'>): string {
  return JSON.stringify({ vendor: restaurant.vendor, id: restaurant.id })
}

function parseRestaurantFormValue(value: string): Pick<Restaurant, 'id' | 'vendor'> | null {
  try {
    const parsed = JSON.parse(value) as { vendor?: unknown, id?: unknown }
    if (!isVendor(parsed.vendor) || typeof parsed.id !== 'string' || parsed.id.length === 0) return null
    return { vendor: parsed.vendor, id: parsed.id }
  } catch {
    return null
  }
}

function parseAdditionalPathsText(value: string): string[][] {
  return value
    .split(/\r?\n/)
    .map((line) => line.split('/').map((part) => part.normalize('NFKC').trim()).filter(Boolean))
    .filter((path) => path.length > 0)
}

function additionalPathsText(paths: string[][] | undefined): string {
  return paths?.map((path) => path.join(' / ')).join('\n') ?? ''
}

function adminRestaurant(restaurant: Restaurant) {
  return {
    value: restaurantFormValue(restaurant),
    id: restaurant.id,
    name: restaurant.name,
    vendor: restaurant.vendor,
    path: restaurant.path ?? [],
    additionalPaths: restaurant.additionalPaths ?? []
  }
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const table = cacheTableFromUrl(url)
  const page = numberParam(url, 'page', 1)
  const pageSize = numberParam(url, 'pageSize', 20)

  return {
    user: locals.adminUser,
    status: await service.getCacheStatus(),
    cacheTables: CACHE_TABLES,
    cachePage: await service.getCachePage(table, page, pageSize),
    notice: await service.getNoticeSettings(),
    workerProblemAlert: await service.getWorkerProblemAlertSettings(),
    additionalPathRestaurants: (await service.getRestaurants())
      .sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id, 'ko'))
      .map(adminRestaurant)
  }
}

export const actions: Actions = {
  clearCaches: async ({ locals }) => {
    if (!locals.adminUser) return { action: 'cache_clear', error: '로그인이 필요합니다' }

    const cleared = await service.clearCaches()
    return {
      action: 'cache_clear',
      message: '캐시를 삭제했습니다',
      cleared,
      status: await service.getCacheStatus(),
      cachePage: await service.getCachePage('restaurants', 1, 20)
    }
  },
  updateNotice: async ({ locals, request }) => {
    if (!locals.adminUser) return { action: 'notice_update', error: '로그인이 필요합니다' }

    const formData = await request.formData()
    const notice: Partial<NoticeSettings> = {
      enabled: formData.get('enabled') === 'on',
      title: stringFormValue(formData, 'title'),
      summary: stringFormValue(formData, 'summary'),
      detail: stringFormValue(formData, 'detail'),
      contentHtml: stringFormValue(formData, 'contentHtml')
    }

    const savedNotice = await service.setNoticeSettings(notice)
    return {
      action: 'notice_update',
      message: savedNotice.enabled ? '공지를 게시했습니다' : '공지 표시를 중지했습니다',
      notice: savedNotice,
      status: await service.getCacheStatus(),
      cachePage: await service.getCachePage('restaurants', 1, 20)
    }
  },
  updateWorkerProblemAlert: async ({ locals, request }) => {
    if (!locals.adminUser) return { action: 'worker_alert_update', error: '로그인이 필요합니다' }

    const formData = await request.formData()
    const settings: Partial<WorkerProblemAlertSettings> = {
      enabled: formData.get('enabled') === 'on',
      discordWebhookUrl: stringFormValue(formData, 'discordWebhookUrl'),
      discordRoleId: stringFormValue(formData, 'discordRoleId')
    }

    try {
      if (formData.get('intent') === 'test') {
        const testSettings = normalizeWorkerProblemAlertSettings(settings, true)
        if (!testSettings.enabled) throw new Error('테스트하려면 알림을 활성화하고 웹훅 URL을 입력해 주세요')
        await deliverDiscordWorkerAlert(
          testSettings.discordWebhookUrl,
          '✅ **Welplan worker 알림 테스트**\n관리자 페이지에 설정한 Discord 웹훅이 정상적으로 동작합니다.',
          `admin-worker-alert-test:${Date.now()}`,
          testSettings.discordRoleId
        )
      }
      const savedSettings = await service.setWorkerProblemAlertSettings(settings)
      return {
        action: 'worker_alert_update',
        message: formData.get('intent') === 'test'
          ? '설정을 저장하고 Discord 테스트 알림을 전송했습니다'
          : savedSettings.enabled ? 'Worker 문제 알림을 활성화했습니다' : 'Worker 문제 알림을 비활성화했습니다',
        workerProblemAlert: savedSettings,
        status: await service.getCacheStatus(),
        cachePage: await service.getCachePage('restaurants', 1, 20)
      }
    } catch (error) {
      return {
        action: 'worker_alert_update',
        error: error instanceof Error ? error.message : 'Worker 문제 알림 설정에 실패했습니다',
        status: await service.getCacheStatus(),
        cachePage: await service.getCachePage('restaurants', 1, 20)
      }
    }
  },
  updateRestaurantAdditionalPaths: async ({ locals, request }) => {
    if (!locals.adminUser) return { action: 'restaurant_paths_update', error: '로그인이 필요합니다' }

    const formData = await request.formData()
    const target = parseRestaurantFormValue(stringFormValue(formData, 'restaurant'))
    if (!target) return { action: 'restaurant_paths_update', error: '식당을 선택해 주세요' }

    try {
      const paths = parseAdditionalPathsText(stringFormValue(formData, 'additionalPaths'))
      const restaurant = await service.setRestaurantAdditionalPaths(target, paths)
      return {
        action: 'restaurant_paths_update',
        message: paths.length > 0 ? '추가 경로를 저장했습니다' : '추가 경로를 삭제했습니다',
        restaurantAdditionalPaths: {
          restaurant: restaurantFormValue(restaurant),
          additionalPathsText: additionalPathsText(restaurant.additionalPaths)
        },
        status: await service.getCacheStatus(),
        cachePage: await service.getCachePage('restaurants', 1, 20)
      }
    } catch (error) {
      return {
        action: 'restaurant_paths_update',
        error: error instanceof Error ? error.message : '추가 경로 저장에 실패했습니다',
        status: await service.getCacheStatus(),
        cachePage: await service.getCachePage('restaurants', 1, 20)
      }
    }
  }
}
