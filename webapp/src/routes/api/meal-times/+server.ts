import type { RequestHandler } from './$types'

const API_BASE = process.env.API_URL ?? 'http://localhost:3000'

export const GET: RequestHandler = async () => {
  try {
    const res = await fetch(`${API_BASE}/restaurants/meal-times`)
    const body = await res.text()
    return new Response(body, { headers: { 'Content-Type': 'application/json' } })
  } catch {
    return Response.json([])
  }
}
