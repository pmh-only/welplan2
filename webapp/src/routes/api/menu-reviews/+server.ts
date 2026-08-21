import type { RequestHandler } from './$types'
import {
  createMenuReview,
  MenuReviewError,
  normalizeMenuReview,
  reviewRequestIsSameOrigin
} from '$lib/server/menu-reviews'

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}

export const POST: RequestHandler = async ({ request, url }) => {
  try {
    if (!reviewRequestIsSameOrigin(request, url.origin)) throw new MenuReviewError('리뷰 요청이 올바르지 않습니다.')
    const review = normalizeMenuReview(await request.json().catch(() => null))
    const summary = await createMenuReview(review)
    return json({ summary }, 201)
  } catch (error) {
    if (error instanceof MenuReviewError) return json({ error: error.message }, error.status)
    throw error
  }
}
