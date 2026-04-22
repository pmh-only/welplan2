import { startPoller } from '$lib/server/poller'
import type { Handle } from '@sveltejs/kit'
import { API_DOC_PATH } from '$lib/agent'
import {
  appendVaryValue,
  applyContentSignal,
  buildDiscoveryLinkHeader
} from '$lib/server/discovery'
import { renderMarkdownPage } from '$lib/server/markdown'

startPoller()

function wantsMarkdown(accept: string | null): boolean {
  return accept?.toLowerCase().includes('text/markdown') ?? false
}

function shouldAdvertiseDiscovery(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === API_DOC_PATH ||
    pathname.startsWith('/takein/') ||
    pathname.startsWith('/takeout/') ||
    pathname === '/restaurants' ||
    pathname === '/settings'
  )
}

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event)
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.startsWith('text/html')) {
    const headers = new Headers(response.headers)
    appendVaryValue(headers, 'Accept')
    applyContentSignal(headers)

    if (shouldAdvertiseDiscovery(event.url.pathname)) {
      headers.append('Link', buildDiscoveryLinkHeader(`${event.url.pathname}${event.url.search}`))
    }

    if (wantsMarkdown(event.request.headers.get('accept')) && event.request.method === 'GET') {
      try {
        const markdown = await renderMarkdownPage(event)
        if (markdown) {
          headers.set('Content-Type', 'text/markdown; charset=utf-8')
          headers.set('x-markdown-tokens', String(Math.max(1, Math.ceil(markdown.length / 4))))
          headers.delete('Content-Length')
          headers.delete('ETag')
          if (shouldAdvertiseDiscovery(event.url.pathname)) {
            headers.set(
              'Link',
              buildDiscoveryLinkHeader(`${event.url.pathname}${event.url.search}`)
            )
          } else {
            headers.delete('Link')
          }
          return new Response(markdown, {
            status: response.status,
            statusText: response.statusText,
            headers
          })
        }
      } catch {}
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  }

  if (
    contentType.startsWith('application/json') ||
    contentType.startsWith('application/linkset+json') ||
    contentType.startsWith('text/plain')
  ) {
    const headers = new Headers(response.headers)
    applyContentSignal(headers)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  }

  return response
}
