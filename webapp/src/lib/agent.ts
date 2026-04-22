export const APP_NAME = 'Welplan'
export const APP_VERSION = '0.0.1'
export const CONTENT_SIGNAL = 'ai-train=no, search=yes, ai-input=yes'

export const API_CATALOG_PATH = '/.well-known/api-catalog'
export const API_DOC_PATH = '/docs/api'
export const OPENAPI_PATH = '/openapi.json'
export const AGENT_SKILLS_INDEX_PATH = '/.well-known/agent-skills/index.json'
export const MCP_SERVER_CARD_PATH = '/.well-known/mcp/server-card.json'

export type AgentPageName = 'gallery' | 'takein' | 'takeout' | 'restaurants' | 'settings'

export type WebMcpToolDefinition = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  readOnlyHint: boolean
}

export const WEB_MCP_TOOLS: WebMcpToolDefinition[] = [
  {
    name: 'welplan.open-page',
    title: 'Open Welplan page',
    description:
      'Navigate to the gallery, take-in, takeout, restaurant settings, or application settings views.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
          enum: ['gallery', 'takein', 'takeout', 'restaurants', 'settings']
        },
        date: {
          type: 'string',
          description: 'Optional date in YYYYMMDD format for gallery, takein, or takeout views.'
        },
        time: {
          type: 'string',
          description: 'Optional meal time id for gallery, takein, or takeout views.'
        }
      },
      required: ['page'],
      additionalProperties: false
    },
    readOnlyHint: false
  },
  {
    name: 'welplan.search-restaurants',
    title: 'Search restaurants',
    description: 'Search available Welstory and Shinsegae Food restaurants by name or keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Restaurant name or keyword to search for.'
        }
      },
      required: ['query'],
      additionalProperties: false
    },
    readOnlyHint: true
  },
  {
    name: 'welplan.get-current-page',
    title: 'Get current page',
    description: 'Return a structured summary of the currently visible Welplan page.',
    inputSchema: {
      type: 'object',
      additionalProperties: false
    },
    readOnlyHint: true
  },
  {
    name: 'welplan.get-cache-status',
    title: 'Get cache status',
    description: 'Inspect server-side cache counts used by the Welplan web application.',
    inputSchema: {
      type: 'object',
      additionalProperties: false
    },
    readOnlyHint: true
  }
]

export function routeForAgentPage(page: string, date?: string, time?: string): string | null {
  switch (page) {
    case 'gallery': {
      const params = new URLSearchParams()
      if (date) params.set('date', date)
      if (time) params.set('time', time)
      const query = params.toString()
      return query ? `/?${query}` : '/'
    }
    case 'takein':
      return date && time ? `/takein/${date}/${time}` : '/takein'
    case 'takeout':
      return date && time ? `/takeout/${date}/${time}` : '/takeout'
    case 'restaurants':
      return '/restaurants'
    case 'settings':
      return '/settings'
    default:
      return null
  }
}
