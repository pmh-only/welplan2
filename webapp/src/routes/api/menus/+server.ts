import type { RequestHandler } from './$types'
import { service } from '$lib/server/service'

export const GET: RequestHandler = async ({ url }) => {
  const ids = url.searchParams.getAll('id')
  const date = url.searchParams.get('date')
  const mealTimeId = url.searchParams.get('mealTimeId')

  if (!ids.length || !date || !mealTimeId) {
    return Response.json([])
  }

  const results = await Promise.all(
    ids.map((id) =>
      service.getMenus(id, date, mealTimeId).catch(() => [])
    )
  )

  return Response.json(results.flat())
}
