import { service } from '$lib/server/service'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async () => {
  const notice = await service.getNoticeSettings()

  return {
    notice,
    pageDescription: notice.summary || notice.detail || 'Welplan 공지사항'
  }
}
