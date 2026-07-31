export const APP_NAME = 'Welplan'
export const APP_VERSION = '0.0.1'
export const CONTENT_SIGNAL = 'ai-train=no, search=yes, ai-input=yes'

export const API_CATALOG_PATH = '/.well-known/api-catalog'
export const API_DOC_PATH = '/docs/api'
export const OPENAPI_PATH = '/openapi.json'
export const AGENT_SKILLS_INDEX_PATH = '/.well-known/agent-skills/index.json'
export const MCP_SERVER_CARD_PATH = '/.well-known/mcp/server-card.json'

export type WebMcpToolDefinition = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  readOnlyHint: boolean
  untrustedContentHint: boolean
}

export const WEB_MCP_TOOLS: WebMcpToolDefinition[] = [
  {
    name: 'welplan.search-restaurants',
    title: '식당 검색',
    description: 'Search Welstory and Shinsegae Food restaurants by name or keyword. Returns id, name, vendor, and path for each match.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          description: 'Restaurant name or keyword to search for.'
        }
      },
      required: ['query'],
      additionalProperties: false
    },
    readOnlyHint: true,
    untrustedContentHint: true
  },
  {
    name: 'welplan.open-restaurant',
    title: '식당 메뉴 보기',
    description: 'Navigate to a restaurant\'s daily menu gallery page. Use search-restaurants first to obtain the vendor and id.',
    inputSchema: {
      type: 'object',
      properties: {
        vendor: {
          type: 'string',
          enum: ['welstory', 'shinsegae'],
          description: 'Restaurant vendor.'
        },
        id: {
          type: 'string',
          minLength: 1,
          maxLength: 256,
          description: 'Restaurant identifier returned by search-restaurants.'
        },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'Restaurant name returned by search-restaurants. Include it when available.'
        },
        date: {
          type: 'string',
          pattern: '^\\d{8}$',
          description: 'Date in YYYYMMDD format. Defaults to today when omitted.'
        }
      },
      required: ['vendor', 'id'],
      additionalProperties: false
    },
    readOnlyHint: false,
    untrustedContentHint: true
  },
  {
    name: 'welplan.get-current-page',
    title: '현재 페이지 정보',
    description: 'Return a structured summary of the currently visible Welplan page.',
    inputSchema: {
      type: 'object',
      additionalProperties: false
    },
    readOnlyHint: true,
    untrustedContentHint: true
  }
]
