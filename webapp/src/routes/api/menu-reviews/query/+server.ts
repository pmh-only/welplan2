import type { RequestHandler } from './$types'
import {
  existingReviewIdentity,
  MenuReviewError,
  normalizeMenuKeys,
  reviewRequestIsSameOrigin,
  reviewSummaries
} from '$lib/server/menu-reviews'

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  try {
    if (!reviewRequestIsSameOrigin(request, url.origin)) throw new MenuReviewError('리뷰 요청이 올바르지 않습니다.')
    const input = await request.json().catch(() => null) as { menuKeys?: unknown } | null
    const menuKeys = normalizeMenuKeys(input?.menuKeys)
    const identity = existingReviewIdentity(request, cookies, url.protocol === 'https:')
    return json({
      ...(identity ? { token: identity.token } : {}),
      summaries: await reviewSummaries(menuKeys, identity?.sessionId)
    })
  } catch (error) {
    if (error instanceof MenuReviewError) return json({ error: error.message }, error.status)
    throw error
  }
}
