import type { RequestHandler } from './$types'
import { CONTENT_SIGNAL } from '$lib/agent'
import { getSkill } from '$lib/server/discovery'

export const GET: RequestHandler = () => {
  const skill = getSkill('welplan-menus')
  if (!skill) return new Response('Not found', { status: 404 })

  return new Response(skill.content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Signal': CONTENT_SIGNAL
    }
  })
}
