import type { RequestHandler } from './$types'
import { CONTENT_SIGNAL } from '$lib/agent'

const AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'anthropic-ai',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
  'Bytespider',
  'CCBot',
  'FacebookBot',
  'Amazonbot'
]

export const GET: RequestHandler = ({ url }) => {
  const aiRules = AI_CRAWLERS.flatMap((agent) => [
    `User-agent: ${agent}`,
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /proxy/',
    ''
  ])

  const body = [
    ...aiRules,
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /proxy/',
    '',
    `Content-Signal: ${CONTENT_SIGNAL}`,
    `Sitemap: ${url.origin}/sitemap.xml`,
    `LLMs: ${url.origin}/llms.txt`
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Signal': CONTENT_SIGNAL
    }
  })
}
