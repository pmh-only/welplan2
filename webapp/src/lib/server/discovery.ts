import { createHash } from 'node:crypto'
import {
  AGENT_SKILLS_INDEX_PATH,
  API_CATALOG_PATH,
  API_DOC_PATH,
  APP_NAME,
  APP_VERSION,
  CONTENT_SIGNAL,
  MCP_SERVER_CARD_PATH,
  OPENAPI_PATH,
  WEB_MCP_TOOLS
} from '$lib/agent'

type SkillDefinition = {
  name: string
  description: string
  content: string
}

const SKILLS: SkillDefinition[] = [
  {
    name: 'welplan-menus',
    description: 'Browse Welplan gallery, take-in, and takeout menu views by date and meal time.',
    content: `---
name: welplan-menus
description: Browse Welplan gallery, take-in, and takeout menu views by date and meal time.
---

# Welplan Menus

Use this skill when the task is to browse cafeteria menus, gallery images, or meal details in Welplan.

## Main routes

- / serves the menu gallery and accepts optional date and time query parameters.
- /takein/YYYYMMDD/MEAL_TIME_ID shows dine-in menus.
- /takeout/YYYYMMDD/MEAL_TIME_ID shows takeout menus.

## Agent-friendly access

- Send Accept: text/markdown when fetching HTML pages to get a markdown representation.
- Read /.well-known/api-catalog, /openapi.json, and /docs/api for structured API discovery.

## Notes

- Menu availability depends on the selected restaurants stored in the user cookie.
- Gallery entries prioritize menu images and aggregate duplicate menu names across restaurants.
`
  },
  {
    name: 'welplan-restaurants',
    description:
      'Search cafeteria locations and inspect the restaurants currently selected in Welplan.',
    content: `---
name: welplan-restaurants
description: Search cafeteria locations and inspect the restaurants currently selected in Welplan.
---

# Welplan Restaurants

Use this skill when the task is to discover available restaurants or inspect the current restaurant selection.

## Main routes

- /restaurants shows the current restaurant list and the interactive search UI.
- /proxy/search?q=... returns matching restaurants as JSON.

## Browser tools

If WebMCP is available, use welplan.search-restaurants for structured browser-side search.

## Notes

- The current restaurant list is stored in the welplan_restaurants cookie.
- Search results include both Samsung Welstory and Shinsegae Food restaurants when available.
`
  },
  {
    name: 'welplan-cache',
    description: 'Inspect Welplan cache health and server-side cache maintenance endpoints.',
    content: `---
name: welplan-cache
description: Inspect Welplan cache health and server-side cache maintenance endpoints.
---

# Welplan Cache

Use this skill when the task involves cache visibility, health checks, or cache maintenance.

## Endpoints

- /api/health returns a lightweight service status payload.
- /api/cache/status returns cache counts.
- /api/cache/clear clears cached data and requires a POST request.

## Browser tools

If WebMCP is available, use welplan.get-cache-status for a structured read-only cache summary.

## Notes

- Cache clear is a mutating operation and should be used deliberately.
- The settings page also exposes these actions for interactive use.
`
  }
]

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

export function getSkill(name: string): SkillDefinition | undefined {
  return SKILLS.find((skill) => skill.name === name)
}

export function getAgentSkillsIndex() {
  return {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: SKILLS.map((skill) => ({
      name: skill.name,
      type: 'skill-md',
      description: skill.description,
      url: `/.well-known/agent-skills/${skill.name}/SKILL.md`,
      digest: sha256(skill.content)
    }))
  }
}

export function getApiCatalog(origin: string) {
  return {
    linkset: [
      {
        anchor: `${origin}/api/health`,
        'service-desc': [
          {
            href: `${origin}${OPENAPI_PATH}`,
            type: 'application/vnd.oai.openapi+json;version=3.1'
          }
        ],
        'service-doc': [
          {
            href: `${origin}${API_DOC_PATH}`,
            type: 'text/html'
          }
        ],
        status: [
          {
            href: `${origin}/api/health`,
            type: 'application/json'
          }
        ]
      },
      {
        anchor: `${origin}/proxy/search`,
        'service-desc': [
          {
            href: `${origin}${OPENAPI_PATH}`,
            type: 'application/vnd.oai.openapi+json;version=3.1'
          }
        ],
        'service-doc': [
          {
            href: `${origin}${API_DOC_PATH}`,
            type: 'text/html'
          }
        ],
        status: [
          {
            href: `${origin}/api/health`,
            type: 'application/json'
          }
        ]
      }
    ]
  }
}

export function getOpenApiDocument(origin: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: `${APP_NAME} HTTP API`,
      version: APP_VERSION,
      description:
        'Discovery and operational endpoints exposed by the Welplan web application for menu browsing, restaurant search, and cache inspection.'
    },
    servers: [{ url: origin }],
    paths: {
      '/api/health': {
        get: {
          summary: 'Service health status',
          operationId: 'getHealth',
          responses: {
            200: {
              description: 'Service status payload',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      service: { type: 'string' },
                      version: { type: 'string' },
                      timestamp: { type: 'string', format: 'date-time' }
                    },
                    required: ['ok', 'service', 'version', 'timestamp']
                  }
                }
              }
            }
          }
        }
      },
      '/api/cache/status': {
        get: {
          summary: 'Inspect cache counts',
          operationId: 'getCacheStatus',
          responses: {
            200: {
              description: 'Current cache counters',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: {
                      oneOf: [{ type: 'number' }, { type: 'boolean' }]
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/cache/clear': {
        post: {
          summary: 'Clear cached menu data',
          operationId: 'clearCache',
          responses: {
            200: {
              description: 'Cache clear result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      cleared: { type: 'number' },
                      status: {
                        type: 'object',
                        additionalProperties: {
                          oneOf: [{ type: 'number' }, { type: 'boolean' }]
                        }
                      }
                    },
                    required: ['message', 'cleared', 'status']
                  }
                }
              }
            }
          }
        }
      },
      '/proxy/search': {
        get: {
          summary: 'Search restaurants',
          operationId: 'searchRestaurants',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Restaurant name or keyword to search for.'
            }
          ],
          responses: {
            200: {
              description: 'Matching restaurants',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        vendor: { type: 'string' },
                        path: {
                          type: 'array',
                          items: { type: 'string' }
                        }
                      },
                      required: ['id', 'name', 'vendor']
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/proxy/{id}/menus/detail': {
        get: {
          summary: 'Fetch menu detail or nutrient detail',
          operationId: 'getMenuDetail',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Restaurant identifier.'
            },
            {
              name: 'date',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Date in YYYYMMDD format.'
            },
            {
              name: 'mealTimeId',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Meal time identifier.'
            },
            {
              name: 'hallNo',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Hall number used by the upstream menu provider.'
            },
            {
              name: 'courseType',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Course type used by the upstream menu provider.'
            },
            {
              name: 'nutrient',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['1'] },
              description:
                'Set to 1 to request nutrient detail instead of the basic detail payload.'
            }
          ],
          responses: {
            200: {
              description: 'Menu detail payload',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        nutrition: {
                          type: 'object',
                          additionalProperties: { type: 'number' }
                        },
                        isMain: { type: 'boolean' }
                      },
                      required: ['name']
                    }
                  }
                }
              }
            },
            400: {
              description: 'Missing required query parameters'
            },
            500: {
              description: 'Upstream or internal error'
            }
          }
        }
      }
    }
  }
}

export function getMcpServerCard(origin: string) {
  return {
    serverInfo: {
      name: 'welplan',
      version: APP_VERSION
    },
    title: APP_NAME,
    description:
      'Browser-exposed WebMCP tools for navigating Welplan, searching restaurants, and inspecting page and cache state.',
    transport: {
      type: 'webmcp',
      endpoint: `${origin}/`
    },
    capabilities: {
      tools: WEB_MCP_TOOLS.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        readOnlyHint: tool.readOnlyHint
      })),
      markdown: {
        endpoint: `${origin}/`,
        contentType: 'text/markdown'
      },
      agentSkills: {
        endpoint: `${origin}${AGENT_SKILLS_INDEX_PATH}`
      }
    }
  }
}

export function buildDiscoveryLinkHeader(pathnameAndSearch: string): string {
  return [
    `</${pathnameAndSearch.startsWith('/') ? pathnameAndSearch.slice(1) : pathnameAndSearch}>; rel="alternate"; type="text/markdown"; title="Markdown representation"`,
    `<${API_CATALOG_PATH}>; rel="api-catalog"; type="application/linkset+json"; title="${APP_NAME} API catalog"`,
    `<${API_DOC_PATH}>; rel="service-doc"; type="text/html"; title="${APP_NAME} API documentation"`,
    `<${OPENAPI_PATH}>; rel="service-desc"; type="application/vnd.oai.openapi+json;version=3.1"; title="${APP_NAME} OpenAPI document"`,
    `</api/health>; rel="status"; type="application/json"; title="${APP_NAME} service health"`,
    `<${AGENT_SKILLS_INDEX_PATH}>; rel="describedby"; type="application/json"; title="${APP_NAME} agent skills index"`,
    `<${MCP_SERVER_CARD_PATH}>; rel="describedby"; type="application/json"; title="${APP_NAME} MCP server card"`
  ].join(', ')
}

export function appendVaryValue(headers: Headers, value: string): void {
  const existing = headers.get('Vary')
  if (!existing) {
    headers.set('Vary', value)
    return
  }

  const values = new Set(
    existing
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  )
  values.add(value)
  headers.set('Vary', [...values].join(', '))
}

export function applyContentSignal(headers: Headers): void {
  headers.set('Content-Signal', CONTENT_SIGNAL)
}
