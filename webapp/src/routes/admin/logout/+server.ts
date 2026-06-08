import { clearAdminSession } from '$lib/server/admin-auth'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ cookies, url }) => {
  clearAdminSession(cookies)
  return Response.redirect(new URL('/', url.origin), 302)
}
