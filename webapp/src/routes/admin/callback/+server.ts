import { completeAdminLogin, redirectResponse } from '$lib/server/admin-auth'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ cookies, url }) => {
  const returnTo = await completeAdminLogin(cookies, url)
  return redirectResponse(new URL(returnTo, url.origin))
}
