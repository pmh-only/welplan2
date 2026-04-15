import type { RequestHandler } from './$types'
import { service } from '$lib/server/service'

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q') ?? ''
  try {
    const results = await service.searchRestaurants(q)
    return Response.json(results)
  } catch {
    return Response.json([])
  }
}
