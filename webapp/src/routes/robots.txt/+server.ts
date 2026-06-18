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
    `LLMs: ${url.origin}/llms.txt`,
    '#DaumWebMasterTool:9d02dc282ff7f8bc36a7b30369793ae3578d4ec0702ccdd0ca1b5414ce008597:LIrpZAQGS3+EKpQKpgrqqw=='
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Signal': CONTENT_SIGNAL
    }
  })
}
