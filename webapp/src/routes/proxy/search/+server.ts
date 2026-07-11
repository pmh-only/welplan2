import type { RequestHandler } from './$types'
import { createService } from '$lib/server/service'
import '$lib/server/env'

const searchService = createService({ allowRemoteFetch: false })

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q') ?? ''
  try {
    const results = await searchService.searchRestaurants(q)
    return Response.json(results)
  } catch (error) {
    console.warn('Restaurant cache search failed', error)
    return Response.json([])
  }
}
