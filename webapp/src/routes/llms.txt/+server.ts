import type { RequestHandler } from './$types'
import { APP_NAME, APP_VERSION, CONTENT_SIGNAL } from '$lib/agent'
import { service } from '$lib/server/service'

export const GET: RequestHandler = async ({ url }) => {
  const origin = url.origin
  const restaurantCount = await service.getRestaurants().then((r) => r.length).catch(() => 0)

  const body = `# ${APP_NAME} v${APP_VERSION}

> 삼성웰스토리·신세계푸드 사내 식당 메뉴 조회 서비스. ${restaurantCount}개 식당의 오늘 메뉴, 메뉴 사진, 영양정보를 제공합니다.

## How to use this site as an AI assistant

### Step 1 — Search for a restaurant

GET ${origin}/proxy/search?q={keyword}

Returns a JSON array. Each item has: id, name, vendor ("welstory" or "shinsegae"), path (location breadcrumbs).

Example: GET ${origin}/proxy/search?q=R5

### Step 2 — View a restaurant's menu

GET ${origin}/restaurants/{vendor}/{id}/{slug}/{date}

- vendor: "welstory" or "shinsegae"
- id: restaurant id from search results
- slug: restaurant name lowercased, spaces → hyphens
- date: YYYYMMDD format (omit date segment to see today)

Add the header \`Accept: text/markdown\` to receive a plain-text menu listing instead of HTML.

### Step 3 — Read the RSS feed (optional)

GET ${origin}/restaurants/{vendor}/{id}/{slug}/{date}/rss.xml

Returns RSS 2.0. Each item covers one meal time and lists dishes as an HTML \`<ul>\`.

## Machine-readable discovery

- OpenAPI 3.1 spec: ${origin}/openapi.json
- API catalog (RFC 9727): ${origin}/.well-known/api-catalog
- Agent skills index: ${origin}/.well-known/agent-skills/index.json
- MCP server card: ${origin}/.well-known/mcp/server-card.json
- Sitemap: ${origin}/sitemap.xml
- RSS (all restaurants, 7 days): ${origin}/rss.xml

## Notes

- ${restaurantCount} restaurants are indexed covering both Samsung Welstory and Shinsegae Food vendors.
- Menu cache prefetching is handled by the separate worker process (\`WORKER_*\` interval settings), so web requests are mostly cache-first.
- Any HTML page can be fetched as Markdown by sending \`Accept: text/markdown\`.
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Signal': CONTENT_SIGNAL
    }
  })
}
