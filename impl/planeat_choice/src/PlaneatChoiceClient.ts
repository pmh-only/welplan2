import type { CafeteriaClient, MealTime, Menu, Restaurant } from '@pmh-only/welplan2-model'
import type { PcDailyMenuItem, PcMealTimeEntry, PcStorTimeResponse, PcTreeNode } from './types.js'
import { mapMealTime, mapMenu } from './mapper.js'

export class PlaneatChoiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'PlaneatChoiceError'
  }
}

// Extends the common Restaurant with PlanEAT-specific fields required for subsequent calls
export interface PcRestaurant extends Restaurant {
  busiCd: string
  compCd: string
  storCd: string
  orgTreeId: string
}

// Internal params used when building the daily menu request
export interface GetMenusParams {
  busiCd: string
  compCd: string
  storCd: string
  orgTreeId: string
  mealCd: string
  date: string // YYYYMMDD
}

export interface PlaneatChoiceClientOptions {
  baseUrl?: string
}

function getNodeName(node: PcTreeNode): string {
  return node.title?.ko ?? node.data?.storNm ?? node.code
}

function flattenTree(
  nodes: PcTreeNode[],
  pathIndices: number[],
  pathNames: string[]
): PcRestaurant[] {
  const results: PcRestaurant[] = []

  nodes.forEach((node, index) => {
    const currentPath = [...pathIndices, index]
    const currentName = getNodeName(node)
    const currentPathNames = currentName ? [...pathNames, currentName] : pathNames
    const d = node.data

    if (node.type === 'STOR' && d?.storCd && d?.busiCd && d?.compCd) {
      results.push({
        id: d.storCd,
        name: currentName,
        vendor: 'shinsegae', // all PlanEAT restaurants use PlaneatChoiceClient
        path: pathNames,
        busiCd: d.busiCd,
        compCd: d.compCd,
        storCd: d.storCd,
        orgTreeId: currentPath.join(':')
      })
    }

    if (node.children && node.children.length > 0) {
      results.push(...flattenTree(node.children, currentPath, currentPathNames))
    }
  })

  return results
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data !== null && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (Array.isArray(obj.ds)) return obj.ds as T[]
    if (Array.isArray(obj.resultList)) return obj.resultList as T[]
    if (Array.isArray(obj.data)) return obj.data as T[]
    if (Array.isArray(obj.list)) return obj.list as T[]
  }
  return []
}

function asPcRestaurant(restaurant: Restaurant): PcRestaurant {
  return restaurant as PcRestaurant
}

export class PlaneatChoiceClient implements CafeteriaClient {
  private readonly baseUrl: string

  constructor(options: PlaneatChoiceClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://m.planeatchoice.net/v2'
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`)

    if (!response.ok) {
      throw new PlaneatChoiceError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status
      )
    }

    return response.json() as Promise<T>
  }

  async getRestaurantTree(): Promise<PcTreeNode[]> {
    const raw = await this.request<unknown>('/storTree')
    return unwrapList<PcTreeNode>(raw)
  }

  async getRestaurants(): Promise<PcRestaurant[]> {
    const tree = await this.getRestaurantTree()
    return flattenTree(tree, [], [])
  }

  async getMealTimes(restaurant: Restaurant): Promise<MealTime[]> {
    const { busiCd, compCd, storCd } = asPcRestaurant(restaurant)
    const raw = await this.request<PcStorTimeResponse>(
      `/storTime?busiCd=${busiCd}&compCd=${compCd}&storCd=${storCd}`
    )
    return (raw.mealData ?? []).map(mapMealTime)
  }

  async getMenus(restaurant: Restaurant, date: string, mealTimeId: string): Promise<Menu[]> {
    const pc = asPcRestaurant(restaurant)
    const params: GetMenusParams = {
      busiCd: pc.busiCd,
      compCd: pc.compCd,
      storCd: pc.storCd,
      orgTreeId: pc.orgTreeId,
      mealCd: mealTimeId,
      date
    }

    const saleDt = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
    const today = new Date().toUTCString()

    const qs = new URLSearchParams({
      itemFg: '',
      packFg: '',
      today,
      saleDt,
      listType: 'card',
      orderType: 'new',
      busiCd: pc.busiCd,
      compCd: pc.compCd,
      storCd: pc.storCd,
      orgTreeId: pc.orgTreeId,
      mealCd: mealTimeId
    })

    const raw = await this.request<{ ds?: PcDailyMenuItem[] }>(`/portal/dailyMenu?${qs}`)
    return (raw.ds ?? []).map((item, i) => mapMenu(item, i, params, pc))
  }
}
