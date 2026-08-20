import type { RequestHandler } from './$types'
import { handleMcpRequest } from '$lib/server/mcp'
import { service } from '$lib/server/service'

const handle: RequestHandler = ({ request, url }) => handleMcpRequest(request, service, url.origin)

export const GET = handle
export const POST = handle
export const DELETE = handle
export const OPTIONS = handle
