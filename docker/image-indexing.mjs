import { ServerResponse } from 'node:http'

export const IMAGE_ROBOTS_DIRECTIVES = 'noindex, noimageindex, nosnippet'

const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)$/i

export function isImagePath(url = '') {
  const pathname = url.split(/[?#]/, 1)[0]
  return pathname === '/img' || pathname.startsWith('/img/') || IMAGE_EXTENSION.test(pathname)
}

export function isImageContentType(contentType) {
  const value = Array.isArray(contentType) ? contentType[0] : contentType
  return typeof value === 'string' && value.toLowerCase().startsWith('image/')
}

function contentTypeFrom(headers) {
  if (!headers) return undefined

  if (Array.isArray(headers)) {
    for (let index = 0; index < headers.length; index += 2) {
      if (String(headers[index]).toLowerCase() === 'content-type') return headers[index + 1]
    }
    return undefined
  }

  if (typeof headers.get === 'function') return headers.get('content-type') ?? undefined

  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'content-type') return value
  }
}

function protectImageResponse(response, headers) {
  const contentType = contentTypeFrom(headers) ?? response.getHeader('content-type')
  if (isImagePath(response.req?.url) || isImageContentType(contentType)) {
    response.setHeader('X-Robots-Tag', IMAGE_ROBOTS_DIRECTIVES)
  }
}

const originalWriteHead = ServerResponse.prototype.writeHead

ServerResponse.prototype.writeHead = function (statusCode, statusMessage, headers) {
  protectImageResponse(this, typeof statusMessage === 'string' ? headers : statusMessage)
  return originalWriteHead.apply(this, arguments)
}
