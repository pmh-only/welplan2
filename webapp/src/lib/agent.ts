export const APP_NAME = 'Welplan'
export const APP_VERSION = '0.0.1'
export const CONTENT_SIGNAL = 'ai-train=no, search=yes, ai-input=yes'

export const API_CATALOG_PATH = '/.well-known/api-catalog'
export const API_DOC_PATH = '/docs/api'
export const OPENAPI_PATH = '/openapi.json'
export const AGENT_SKILLS_INDEX_PATH = '/.well-known/agent-skills/index.json'
export const MCP_SERVER_CARD_PATH = '/.well-known/mcp/server-card.json'
export const MCP_ENDPOINT_PATH = '/mcp'

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

export const STREAMABLE_HTTP_MCP_TOOLS: WebMcpToolDefinition[] = [
  {
    name: 'search_restaurants',
    title: '식당 검색',
    description: 'Search Welstory and Shinsegae Food cafeteria restaurants by name, location, or keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          description: 'Restaurant name, location, or keyword.'
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          default: 10,
          description: 'Maximum number of matches to return.'
        }
      },
      required: ['query'],
      additionalProperties: false
    },
    readOnlyHint: true,
    untrustedContentHint: true
  },
  {
    name: 'get_restaurant_menu',
    title: '날짜별 식당 메뉴 조회',
    description: 'Get every meal period and menu for a restaurant on a date. Use search_restaurants first.',
    inputSchema: {
      type: 'object',
      properties: {
        vendor: {
          type: 'string',
          enum: ['welstory', 'shinsegae'],
          description: 'Restaurant vendor returned by search_restaurants.'
        },
        restaurantId: {
          type: 'string',
          minLength: 1,
          maxLength: 256,
          description: 'Restaurant identifier returned by search_restaurants.'
        },
        date: {
          type: 'string',
          pattern: '^(?:\\d{8}|\\d{4}-\\d{2}-\\d{2})$',
          description: 'Menu date in YYYYMMDD or YYYY-MM-DD format.'
        }
      },
      required: ['vendor', 'restaurantId', 'date'],
      additionalProperties: false
    },
    readOnlyHint: true,
    untrustedContentHint: true
  }
]
