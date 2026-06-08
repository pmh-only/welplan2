import { clearAdminSession, redirectResponse } from '$lib/server/admin-auth'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ cookies, url }) => {
  clearAdminSession(cookies)
  return redirectResponse(new URL('/', url.origin))
}
