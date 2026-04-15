import type { RequestHandler } from './$types'
import { service } from '$lib/server/service'

export const GET: RequestHandler = async () => {
  try {
    const times = await service.getAllMealTimes()
    return Response.json(times)
  } catch {
    return Response.json([])
  }
}
