import type { RequestHandler } from './$types'
import { CONTENT_SIGNAL } from '$lib/agent'
import { getAgentSkillsIndex } from '$lib/server/discovery'

export const GET: RequestHandler = () => {
  return new Response(JSON.stringify(getAgentSkillsIndex(), null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Signal': CONTENT_SIGNAL
    }
  })
}
