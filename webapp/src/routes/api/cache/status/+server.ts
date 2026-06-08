import { service } from '$lib/server/service'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async () => {
  return Response.json(await service.getCacheStatus())
}
