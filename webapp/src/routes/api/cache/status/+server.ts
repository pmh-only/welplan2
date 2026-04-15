import { service } from '$lib/server/service'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = () => {
  return Response.json(service.getCacheStatus())
}
