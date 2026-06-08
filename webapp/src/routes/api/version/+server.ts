import { APP_NAME, APP_VERSION } from '$lib/agent'
import type { RequestHandler } from './$types'

const UNKNOWN = 'unknown'

function valueOrNull(value: string | undefined): string | null {
  return value && value !== UNKNOWN ? value : null
}

export const GET: RequestHandler = () => {
  const commitSha = valueOrNull(process.env.WELPLAN_COMMIT_SHA)

  return Response.json({
    service: APP_NAME,
    version: APP_VERSION,
    commitSha,
    shortCommitSha: commitSha?.slice(0, 7) ?? null,
    buildTime: valueOrNull(process.env.WELPLAN_BUILD_TIME),
    timestamp: new Date().toISOString()
  })
}
