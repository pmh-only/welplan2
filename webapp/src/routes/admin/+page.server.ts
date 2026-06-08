import { service, type CacheTableName, type NoticeSettings } from '$lib/server/service'
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

export const load: PageServerLoad = async ({ locals, url }) => {
  const table = cacheTableFromUrl(url)
  const page = numberParam(url, 'page', 1)
  const pageSize = numberParam(url, 'pageSize', 20)

  return {
    user: locals.adminUser,
    status: await service.getCacheStatus(),
    cacheTables: CACHE_TABLES,
    cachePage: await service.getCachePage(table, page, pageSize),
    notice: await service.getNoticeSettings()
  }
}

export const actions: Actions = {
  clearCaches: async ({ locals }) => {
    if (!locals.adminUser) return { error: '로그인이 필요합니다' }

    const cleared = await service.clearCaches()
    return {
      message: '캐시를 삭제했습니다',
      cleared,
      status: await service.getCacheStatus(),
      cachePage: await service.getCachePage('restaurants', 1, 20)
    }
  },
  updateNotice: async ({ locals, request }) => {
    if (!locals.adminUser) return { error: '로그인이 필요합니다' }

    const formData = await request.formData()
    const notice: Partial<NoticeSettings> = {
      enabled: formData.get('enabled') === 'on',
      title: stringFormValue(formData, 'title'),
      summary: stringFormValue(formData, 'summary'),
      detail: stringFormValue(formData, 'detail')
    }

    const savedNotice = await service.setNoticeSettings(notice)
    return {
      message: savedNotice.enabled ? '공지를 게시했습니다' : '공지 표시를 중지했습니다',
      notice: savedNotice,
      status: await service.getCacheStatus(),
      cachePage: await service.getCachePage('restaurants', 1, 20)
    }
  }
}
