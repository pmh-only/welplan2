import type { RequestHandler } from './$types'
import { service } from '$lib/server/service'

export const GET: RequestHandler = async ({ params, url }) => {
  const date = url.searchParams.get('date')
  const mealTimeId = url.searchParams.get('mealTimeId')
  const hallNo = url.searchParams.get('hallNo')
  const courseType = url.searchParams.get('courseType')
  const useNutrientDetail = url.searchParams.get('nutrient') === '1'

  if (!date || !mealTimeId || !hallNo || !courseType) {
    return Response.json({ error: 'Missing required query params' }, { status: 400 })
  }

  try {
    const detail = useNutrientDetail
      ? await service.getMenuNutrientDetail(params.id, date, mealTimeId, hallNo, courseType)
      : await service.getMenuDetail(params.id, date, mealTimeId, hallNo, courseType)
    return Response.json(detail)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return Response.json({ error: msg }, { status: 500 })
  }
}
