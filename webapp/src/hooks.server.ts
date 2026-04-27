import { startPoller } from '$lib/server/poller'
import type { Handle } from '@sveltejs/kit'
import { API_DOC_PATH } from '$lib/agent'
import { createServerLogger } from '$lib/server/log'
import {
  appendVaryValue,
  applyContentSignal,
  buildDiscoveryLinkHeader
} from '$lib/server/discovery'
import { renderMarkdownPage } from '$lib/server/markdown'

const trafficLog = createServerLogger('traffic')

startPoller()

let requestSequence = 0

function nextRequestId(): string {
  requestSequence += 1
  return `req-${requestSequence}`
}

function requestPath(url: URL): string {
  return `${url.pathname}${url.search}`
}

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
  const startedAt = Date.now()
  const requestId = nextRequestId()
  const path = requestPath(event.url)

  trafficLog.info('request started', {
    requestId,
    method: event.request.method,
    path
  })

  try {
    const response = await resolve(event)
    const contentType = response.headers.get('content-type') ?? ''
    let finalResponse = response

    if (contentType.startsWith('text/html')) {
      const headers = new Headers(response.headers)
      appendVaryValue(headers, 'Accept')
      applyContentSignal(headers)

      if (shouldAdvertiseDiscovery(event.url.pathname)) {
        headers.append('Link', buildDiscoveryLinkHeader(path))
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
              headers.set('Link', buildDiscoveryLinkHeader(path))
            } else {
              headers.delete('Link')
            }
            finalResponse = new Response(markdown, {
              status: response.status,
              statusText: response.statusText,
              headers
            })
          }
        } catch (error) {
          trafficLog.warn('markdown render failed', {
            requestId,
            path,
            error
          })
        }
      }

      if (finalResponse === response) {
        finalResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        })
      }
    } else if (
      contentType.startsWith('application/json') ||
      contentType.startsWith('application/linkset+json') ||
      contentType.startsWith('text/plain')
    ) {
      const headers = new Headers(response.headers)
      applyContentSignal(headers)
      finalResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    }

    trafficLog.info('request completed', {
      requestId,
      method: event.request.method,
      path,
      status: finalResponse.status,
      contentType: finalResponse.headers.get('content-type') ?? '',
      durationMs: Date.now() - startedAt
    })

    return finalResponse
  } catch (error) {
    trafficLog.error('request failed', {
      requestId,
      method: event.request.method,
      path,
      durationMs: Date.now() - startedAt,
      error
    })
    throw error
  }
}
