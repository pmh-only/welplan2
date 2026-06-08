import { service } from '$lib/server/service'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async () => {
  const cleared = await service.clearCaches()
  return Response.json({
    message: '캐시를 삭제했습니다',
    cleared,
    status: await service.getCacheStatus()
  })
}
