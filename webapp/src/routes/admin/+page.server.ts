import { service } from '$lib/server/service'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  return {
    user: locals.adminUser,
    status: await service.getCacheStatus()
  }
}

export const actions: Actions = {
  clearCaches: async ({ locals }) => {
    if (!locals.adminUser) return { error: '로그인이 필요합니다' }

    const cleared = await service.clearCaches()
    return {
      message: '캐시를 삭제했습니다',
      cleared,
      status: await service.getCacheStatus()
    }
  }
}
