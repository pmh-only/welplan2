import '$lib/server/env'
import type { RequestHandler } from './$types'

const RELATION = 'delegate_permission/common.handle_all_urls'

function configuredPackageName(): string | null {
  const value = process.env.TWA_PACKAGE_NAME?.trim()
  return value || null
}

function configuredFingerprints(): string[] {
  const raw =
    process.env.TWA_SHA256_CERT_FINGERPRINTS ?? process.env.TWA_SHA256_CERT_FINGERPRINT ?? ''
  return [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ]
}

function assetLinksStatements() {
  const packageName = configuredPackageName()
  const fingerprints = configuredFingerprints()

  if (!packageName || fingerprints.length === 0) return null

  return [
    {
      relation: [RELATION],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints
      }
    }
  ]
}

function jsonResponse(body: string | null, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}

function unconfiguredResponse(body: string | null): Response {
  return new Response(body, {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  })
}

function responseFor(includeBody: boolean): Response {
  const statements = assetLinksStatements()

  if (!statements) {
    return unconfiguredResponse(
      includeBody ? 'TWA_PACKAGE_NAME and TWA_SHA256_CERT_FINGERPRINTS are not configured.\n' : null
    )
  }

  return jsonResponse(includeBody ? JSON.stringify(statements, null, 2) : null)
}

export const GET: RequestHandler = () => responseFor(true)

export const HEAD: RequestHandler = () => responseFor(false)
