import { adminOidcConfigured, createAdminLoginRedirect } from '$lib/server/admin-auth'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ cookies, url }) => {
  if (!adminOidcConfigured()) {
    return new Response('Admin OIDC is not configured', { status: 503 })
  }

  return createAdminLoginRedirect(cookies, url)
}
