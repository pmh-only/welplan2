import type { RequestHandler } from './$types'
import { APP_NAME, APP_VERSION } from '$lib/agent'

export const GET: RequestHandler = () => {
  return Response.json({
    ok: true,
    service: APP_NAME,
    version: APP_VERSION,
    timestamp: new Date().toISOString()
  })
}
