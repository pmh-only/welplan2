import type { RequestHandler } from './$types'
import {
  createMenuReview,
  MenuReviewError,
  normalizeMenuReview,
  reviewIdentity,
  reviewRequestIsSameOrigin
} from '$lib/server/menu-reviews'

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}

export const POST: RequestHandler = async ({ request, cookies, getClientAddress, url }) => {
  try {
    if (!reviewRequestIsSameOrigin(request, url.origin)) throw new MenuReviewError('리뷰 요청이 올바르지 않습니다.')
    const review = normalizeMenuReview(await request.json().catch(() => null))
    const identity = await reviewIdentity(request, cookies, getClientAddress(), url.protocol === 'https:')
    const summary = await createMenuReview(review, identity.sessionId)
    return json({ token: identity.token, summary }, 201)
  } catch (error) {
    if (error instanceof MenuReviewError) return json({ error: error.message }, error.status)
    throw error
  }
}
