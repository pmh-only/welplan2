import { error } from '@sveltejs/kit'
import { readIndexNowKey } from '$lib/server/indexnow'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = ({ params }) => {
  const key = readIndexNowKey()
  if (!key || params.indexnowKey !== key) {
    error(404, 'Not found')
  }

  return new Response(key, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
