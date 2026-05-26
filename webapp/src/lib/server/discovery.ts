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
    name: 'welplan-restaurant-search',
    description: 'Search Welstory and Shinsegae Food restaurants by name and get their menu page URL.',
    content: `---
name: welplan-restaurant-search
description: Search Welstory and Shinsegae Food restaurants by name and get their menu page URL.
---

# Welplan Restaurant Search

Use this skill to find a cafeteria by name and retrieve the URL for its menu page.

## How to search

GET /proxy/search?q={keyword}

Returns a JSON array of restaurants. Each item has:
- id: restaurant identifier
- name: display name
- vendor: "welstory" or "shinsegae"
- path: location breadcrumb array (optional)

## How to build the menu URL

Once you have the restaurant, its daily menu gallery is at:
/restaurants/{vendor}/{id}/{slug}/{date}

Where:
- vendor is "welstory" or "shinsegae"
- id is the restaurant identifier
- slug is the restaurant name lowercased with spaces replaced by hyphens
- date is YYYYMMDD (omit for today's menu)

## WebMCP

If WebMCP is available use welplan.search-restaurants for a structured JSON response,
then welplan.open-restaurant to navigate directly to the menu page.
`
  },
  {
    name: 'welplan-restaurant-menu',
    description: 'Browse a restaurant\'s daily menu gallery with meal photos, dish names, and calorie info.',
    content: `---
name: welplan-restaurant-menu
description: Browse a restaurant's daily menu gallery with meal photos, dish names, and calorie info.
---

# Welplan Restaurant Menu

Use this skill to view a specific restaurant's menu for a given date.

## Menu gallery URL

/restaurants/{vendor}/{id}/{slug}/{date}

- vendor: "welstory" or "shinsegae"
- id: restaurant identifier (from search)
- slug: restaurant name as a URL-safe slug
- date: YYYYMMDD — omit to see today's menu

The page shows all meal times (breakfast, lunch, dinner) with menu photos,
dish component lists, and calorie information.

## RSS feed

Each dated restaurant page has a machine-readable RSS feed at:
/restaurants/{vendor}/{id}/{slug}/{date}/rss.xml

Each RSS item lists the menus for one meal time as an HTML list.

## Agent-friendly access

Fetch any restaurant page with Accept: text/markdown to get a plain-text
representation of the menu suitable for further processing.
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
      title: `${APP_NAME} API`,
      version: APP_VERSION,
      description: 'Search restaurants and browse daily menus on Welplan.'
    },
    servers: [{ url: origin }],
    paths: {
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
              description: 'Restaurant name or keyword.'
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
                        vendor: { type: 'string', enum: ['welstory', 'shinsegae'] },
                        path: { type: 'array', items: { type: 'string' } }
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
      '/restaurants/{vendor}/{id}/{slug}/{date}': {
        get: {
          summary: 'Restaurant daily menu gallery',
          operationId: 'getRestaurantMenu',
          parameters: [
            { name: 'vendor', in: 'path', required: true, schema: { type: 'string', enum: ['welstory', 'shinsegae'] } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Restaurant identifier.' },
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' }, description: 'URL-safe restaurant name slug.' },
            { name: 'date', in: 'path', required: true, schema: { type: 'string' }, description: 'Date in YYYYMMDD format.' }
          ],
          responses: {
            200: {
              description: 'Menu gallery page. Add Accept: text/markdown for a plain-text menu listing.'
            },
            404: { description: 'Restaurant not found.' }
          }
        }
      },
      '/restaurants/{vendor}/{id}/{slug}/{date}/rss.xml': {
        get: {
          summary: 'Restaurant daily menu RSS feed',
          operationId: 'getRestaurantMenuRss',
          parameters: [
            { name: 'vendor', in: 'path', required: true, schema: { type: 'string', enum: ['welstory', 'shinsegae'] } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'date', in: 'path', required: true, schema: { type: 'string' }, description: 'Date in YYYYMMDD format.' }
          ],
          responses: {
            200: {
              description: 'RSS 2.0 feed with one item per meal time listing the menus as an HTML list.',
              content: { 'application/rss+xml': { schema: { type: 'string' } } }
            }
          }
        }
      },
      '/api/health': {
        get: {
          summary: 'Service health',
          operationId: 'getHealth',
          responses: {
            200: {
              description: 'Service status',
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
    description: 'Search cafeteria restaurants and browse their daily menus with photos and calorie info.',
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
