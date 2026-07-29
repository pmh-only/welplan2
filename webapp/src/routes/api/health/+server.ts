import type { RequestHandler } from './$types'
import { APP_NAME, APP_VERSION } from '$lib/agent'
import { service } from '$lib/server/service'

export const GET: RequestHandler = async () => {
  const response = {
    service: APP_NAME,
    version: APP_VERSION,
    timestamp: new Date().toISOString()
  }

  try {
    await service.assertCacheReadable()
    return Response.json({ ok: true, ...response })
  } catch {
    return Response.json({ ok: false, ...response }, { status: 503 })
  }
}
