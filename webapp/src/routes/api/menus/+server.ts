import type { RequestHandler } from './$types'

const API_BASE = process.env.API_URL ?? 'http://localhost:3000'

export const GET: RequestHandler = async ({ url }) => {
  const ids = url.searchParams.getAll('id')
  const date = url.searchParams.get('date')
  const mealTimeId = url.searchParams.get('mealTimeId')

  if (!ids.length || !date || !mealTimeId) {
    return Response.json([])
  }

  const results = await Promise.all(
    ids.map((id) =>
      fetch(
        `${API_BASE}/restaurants/${encodeURIComponent(id)}/menus?date=${date}&mealTimeId=${mealTimeId}`
      )
        .then((r) => r.json())
        .then((data) => (Array.isArray(data) ? data : []))
        .catch(() => [])
    )
  )

  return Response.json(results.flat())
}
