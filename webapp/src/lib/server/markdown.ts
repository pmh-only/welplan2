import type { RequestEvent } from '@sveltejs/kit'
import type { MealTime, Menu, MenuComponent, NutritionInfo, Restaurant } from '$lib/types'
import {
  APP_NAME,
  AGENT_SKILLS_INDEX_PATH,
  API_CATALOG_PATH,
  API_DOC_PATH,
  MCP_SERVER_CARD_PATH,
  OPENAPI_PATH
} from '$lib/agent'
import { formatKoreanDate } from '$lib/utils'
import {
  loadGalleryMenusForRoute,
  loadTakeInMenusForRoute,
  loadTakeOutMenusForRoute
} from '$lib/server/menu-page'
import { loadLayoutData } from '$lib/server/layout-data'

type LayoutData = Awaited<ReturnType<typeof loadLayoutData>>

function frontmatter(title: string, url: URL, description: string): string {
  return `---
title: ${title}
url: ${url.toString()}
description: ${description}
---`
}

function mealTimeName(mealTimes: MealTime[], id: string): string {
  return mealTimes.find((mealTime) => mealTime.id === id)?.name ?? id
}

function restaurantName(restaurants: Restaurant[], id: string): string {
  return restaurants.find((restaurant) => restaurant.id === id)?.name ?? id
}

function listPath(restaurant: Restaurant): string {
  return restaurant.path?.filter(Boolean).join(' / ') ?? ''
}

function nutritionSummary(nutrition?: NutritionInfo): string {
  if (!nutrition) return 'No nutrition data'

  const values = [
    nutrition.calories != null ? `${nutrition.calories} kcal` : null,
    nutrition.carbohydrates != null ? `carb ${nutrition.carbohydrates}g` : null,
    nutrition.protein != null ? `protein ${nutrition.protein}g` : null,
    nutrition.fat != null ? `fat ${nutrition.fat}g` : null,
    nutrition.sugar != null ? `sugar ${nutrition.sugar}g` : null,
    nutrition.sodium != null ? `sodium ${nutrition.sodium}mg` : null
  ].filter(Boolean)

  return values.length > 0 ? values.join(', ') : 'No nutrition data'
}

function sumNutrition(components: MenuComponent[]): NutritionInfo | undefined {
  const withNutrition = components.filter((component) => component.nutrition)
  if (withNutrition.length === 0) return undefined

  return withNutrition.reduce<NutritionInfo>(
    (totals, component) => ({
      calories: (totals.calories ?? 0) + (component.nutrition?.calories ?? 0),
      carbohydrates: (totals.carbohydrates ?? 0) + (component.nutrition?.carbohydrates ?? 0),
      sugar: (totals.sugar ?? 0) + (component.nutrition?.sugar ?? 0),
      fiber: (totals.fiber ?? 0) + (component.nutrition?.fiber ?? 0),
      fat: (totals.fat ?? 0) + (component.nutrition?.fat ?? 0),
      protein: (totals.protein ?? 0) + (component.nutrition?.protein ?? 0),
      sodium: (totals.sodium ?? 0) + (component.nutrition?.sodium ?? 0),
      cholesterol: (totals.cholesterol ?? 0) + (component.nutrition?.cholesterol ?? 0),
      transFat: (totals.transFat ?? 0) + (component.nutrition?.transFat ?? 0),
      saturatedFat: (totals.saturatedFat ?? 0) + (component.nutrition?.saturatedFat ?? 0),
      calcium: (totals.calcium ?? 0) + (component.nutrition?.calcium ?? 0)
    }),
    {}
  )
}

function isOptionalComponent(component: MenuComponent): boolean {
  return component.name.includes('추가찬') || component.name.includes('택1')
}

function hasDetailedComponents(menu: Menu): boolean {
  return menu.components.some((component) => component.nutrition)
}

function isDrinkMenu(menu: Menu): boolean {
  const parentName = (menu as Menu & { parentName?: string }).parentName
  const text = `${parentName ?? ''} ${menu.name}`
  return text.includes('음료') || text.includes('드링킹') || text.includes('음료 Zone')
}

function flattenGalleryMenus(data: { menus: Menu[]; restaurants: Restaurant[] }) {
  const uniqueMenus = new Map<string, Menu>()
  const allRestaurantIds = new Map<string, Set<string>>()

  for (const menu of data.menus) {
    if (!menu.imageUrl) continue
    if (menu.name.includes('죽')) continue
    if (menu.isTakeOut && !menu.name.includes('도시락')) continue

    const key = menu.name.trim().toLowerCase()
    const existing = uniqueMenus.get(key)
    if (!existing || (menu.imageUrl?.length ?? 0) > (existing.imageUrl?.length ?? 0)) {
      uniqueMenus.set(key, menu)
    }

    if (!allRestaurantIds.has(key)) allRestaurantIds.set(key, new Set())
    allRestaurantIds.get(key)?.add(menu.restaurantId)
  }

  return [...uniqueMenus.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map((menu) => {
      const key = menu.name.trim().toLowerCase()
      return {
        ...menu,
        restaurantIds: [...(allRestaurantIds.get(key) ?? new Set([menu.restaurantId]))]
      }
    })
}

function visibleTakeInMenus(data: { menus: Menu[] }) {
  return data.menus
    .filter((menu) => !menu.isTakeOut)
    .filter((menu) => (menu.nutrition?.calories ?? 1) !== 0)
    .map((menu) => {
      const components = hasDetailedComponents(menu)
        ? menu.components.filter((component) => !isOptionalComponent(component))
        : menu.components

      return {
        ...menu,
        components,
        nutrition: sumNutrition(components) ?? menu.nutrition
      }
    })
}

function visibleTakeOutMenus(data: { menus: Menu[] }) {
  return data.menus
    .filter((menu) => menu.isTakeOut)
    .filter((menu) => !isDrinkMenu(menu))
    .filter((menu) => (menu.nutrition?.calories ?? 1) !== 0)
}

function formatDateLabel(date: string): string {
  return /^\d{8}$/.test(date) ? formatKoreanDate(date) : date
}

function renderRestaurantSections(restaurants: Restaurant[], menus: Menu[]): string {
  if (menus.length === 0) return 'No menus available.'

  const byRestaurant = new Map<string, Menu[]>()
  for (const menu of menus) {
    const existing = byRestaurant.get(menu.restaurantId) ?? []
    existing.push(menu)
    byRestaurant.set(menu.restaurantId, existing)
  }

  return [...byRestaurant.entries()]
    .sort((a, b) =>
      restaurantName(restaurants, a[0]).localeCompare(restaurantName(restaurants, b[0]), 'ko')
    )
    .map(([restaurantId, restaurantMenus]) => {
      const heading = `## ${restaurantName(restaurants, restaurantId)}`
      const items = restaurantMenus
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        .map((menu) => {
          const components =
            menu.components.length > 0
              ? `\n  - Components: ${menu.components.map((component) => component.name).join(', ')}`
              : ''
          return `- ${menu.name}\n  - Nutrition: ${nutritionSummary(menu.nutrition)}${components}`
        })
        .join('\n')
      return `${heading}\n\n${items}`
    })
    .join('\n\n')
}

function renderGalleryMarkdown(
  layoutData: LayoutData,
  url: URL,
  data: { menus: Menu[]; date: string; time: string }
) {
  const title = `${APP_NAME} Gallery`
  const description = 'Markdown view of the Welplan menu gallery.'
  const menus = flattenGalleryMenus({ menus: data.menus, restaurants: layoutData.restaurants })
  let menuList = 'No gallery menus available.'
  if (menus.length > 0) {
    menuList = menus
      .map((menu) => {
        const restaurants = menu.restaurantIds
          .map((id) => restaurantName(layoutData.restaurants, id))
          .join(', ')
        const imageLine = menu.imageUrl ? `\n  - Image: ${menu.imageUrl}` : ''
        return `- ${menu.name}\n  - Restaurants: ${restaurants}\n  - Nutrition: ${nutritionSummary(menu.nutrition)}${imageLine}`
      })
      .join('\n')
  }
  const body = [
    frontmatter(title, url, description),
    '',
    `# ${APP_NAME} Gallery`,
    '',
    `- Date: ${formatDateLabel(data.date)}`,
    `- Meal time: ${mealTimeName(layoutData.mealTimes, data.time)}`,
    `- Selected restaurants: ${layoutData.restaurants.length}`,
    `- Visible gallery items: ${menus.length}`,
    '',
    '## Menus',
    '',
    menuList,
    '',
    '## Discovery',
    '',
    `- API catalog: ${url.origin}${API_CATALOG_PATH}`,
    `- OpenAPI: ${url.origin}${OPENAPI_PATH}`,
    `- API docs: ${url.origin}${API_DOC_PATH}`
  ]

  return body.join('\n')
}

function renderMenuMarkdown(
  title: string,
  description: string,
  url: URL,
  layoutData: LayoutData,
  data: { menus: Menu[]; date: string; time: string }
) {
  const body = [
    frontmatter(title, url, description),
    '',
    `# ${title}`,
    '',
    `- Date: ${formatDateLabel(data.date)}`,
    `- Meal time: ${mealTimeName(layoutData.mealTimes, data.time)}`,
    `- Selected restaurants: ${layoutData.restaurants.length}`,
    `- Visible menus: ${data.menus.length}`,
    '',
    renderRestaurantSections(layoutData.restaurants, data.menus),
    '',
    '## Discovery',
    '',
    `- API docs: ${url.origin}${API_DOC_PATH}`,
    `- OpenAPI: ${url.origin}${OPENAPI_PATH}`
  ]

  return body.join('\n')
}

function renderRestaurantsMarkdown(layoutData: LayoutData, url: URL) {
  const title = `${APP_NAME} Restaurant Settings`
  const description =
    'Markdown view of the currently selected restaurants and restaurant search endpoints.'
  const restaurants = layoutData.restaurants
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map((restaurant) => {
      const path = listPath(restaurant)
      const pathLine = path ? `\n  - Path: ${path}` : ''
      return `- ${restaurant.name}\n  - Vendor: ${restaurant.vendor}${pathLine}`
    })
    .join('\n')

  return [
    frontmatter(title, url, description),
    '',
    `# ${title}`,
    '',
    `- First visit: ${layoutData.isFirstVisit ? 'yes' : 'no'}`,
    `- Selected restaurants: ${layoutData.restaurants.length}`,
    '',
    '## Selected restaurants',
    '',
    restaurants || 'No restaurants selected.',
    '',
    '## Search API',
    '',
    `- Search endpoint: ${url.origin}/proxy/search?q=<query>`,
    `- API docs: ${url.origin}${API_DOC_PATH}`
  ].join('\n')
}

function renderSettingsMarkdown(url: URL) {
  const title = `${APP_NAME} Settings`
  const description = 'Markdown view of the Welplan settings and cache management endpoints.'

  return [
    frontmatter(title, url, description),
    '',
    `# ${title}`,
    '',
    '- The browser settings page lets users tune P-Score weights locally.',
    '- Cache inspection is available through the JSON endpoints below.',
    '',
    '## Endpoints',
    '',
    `- Health: ${url.origin}/api/health`,
    `- Cache status: ${url.origin}/api/cache/status`,
    `- Cache clear (POST): ${url.origin}/api/cache/clear`,
    '',
    '## Discovery',
    '',
    `- API catalog: ${url.origin}${API_CATALOG_PATH}`,
    `- Agent skills: ${url.origin}${AGENT_SKILLS_INDEX_PATH}`,
    `- MCP server card: ${url.origin}${MCP_SERVER_CARD_PATH}`
  ].join('\n')
}

function renderApiDocsMarkdown(url: URL) {
  const title = `${APP_NAME} API Documentation`
  const description = 'Human-readable documentation for the Welplan discovery and API endpoints.'

  return [
    frontmatter(title, url, description),
    '',
    `# ${title}`,
    '',
    '## Discovery endpoints',
    '',
    `- API catalog: ${url.origin}${API_CATALOG_PATH}`,
    `- OpenAPI description: ${url.origin}${OPENAPI_PATH}`,
    `- Agent skills index: ${url.origin}${AGENT_SKILLS_INDEX_PATH}`,
    `- MCP server card: ${url.origin}${MCP_SERVER_CARD_PATH}`,
    '',
    '## Application endpoints',
    '',
    `- GET ${url.origin}/api/health`,
    `- GET ${url.origin}/api/cache/status`,
    `- POST ${url.origin}/api/cache/clear`,
    `- GET ${url.origin}/proxy/search?q=<query>`,
    `- GET ${url.origin}/proxy/{id}/menus/detail?date=YYYYMMDD&mealTimeId=<id>&hallNo=<hall>&courseType=<course>&nutrient=1`,
    '',
    '## Markdown for agents',
    '',
    '- HTML pages on this site support content negotiation with `Accept: text/markdown`.',
    '- Markdown responses are served with `Content-Type: text/markdown; charset=utf-8`.'
  ].join('\n')
}

export async function renderMarkdownPage(event: RequestEvent): Promise<string | null> {
  const { pathname } = event.url

  if (pathname === '/docs/api') {
    return renderApiDocsMarkdown(event.url)
  }

  if (pathname === '/settings') {
    return renderSettingsMarkdown(event.url)
  }

  const layoutData = await loadLayoutData(event.cookies)
  const parent = async () => layoutData

  if (pathname === '/') {
    const data = await loadGalleryMenusForRoute(parent, event.url)
    return renderGalleryMarkdown(layoutData, event.url, data)
  }

  if (pathname === '/restaurants') {
    return renderRestaurantsMarkdown(layoutData, event.url)
  }

  const takeInMatch = pathname.match(/^\/takein\/([^/]+)\/([^/]+)$/)
  if (takeInMatch) {
    const [, date, time] = takeInMatch
    const data = await loadTakeInMenusForRoute(parent, date, time)
    return renderMenuMarkdown(
      `${formatDateLabel(date)} ${mealTimeName(layoutData.mealTimes, time)} Take-in Menus`,
      'Markdown view of Welplan take-in menus.',
      event.url,
      layoutData,
      { ...data, menus: visibleTakeInMenus(data) }
    )
  }

  const takeOutMatch = pathname.match(/^\/takeout\/([^/]+)\/([^/]+)$/)
  if (takeOutMatch) {
    const [, date, time] = takeOutMatch
    const data = await loadTakeOutMenusForRoute(parent, date, time)
    return renderMenuMarkdown(
      `${formatDateLabel(date)} ${mealTimeName(layoutData.mealTimes, time)} Takeout Menus`,
      'Markdown view of Welplan takeout menus.',
      event.url,
      layoutData,
      { ...data, menus: visibleTakeOutMenus(data) }
    )
  }

  return null
}
