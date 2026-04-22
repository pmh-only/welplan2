// Raw API response types for PlanEAT Choice

// GET /storTree
export interface PcTreeNode {
  type: string // 'BUSI' | 'COMP' | 'STOR'
  code: string
  title?: { ko?: string; en?: string }
  data?: PcTreeNodeData
  children?: PcTreeNode[]
}

export interface PcTreeNodeData {
  busiCd: string
  compCd?: string
  storCd?: string
  storNm?: string
  storNmEn?: string
  commCompNmEn?: string
}

// GET /storTime — response: { mealData: PcMealTimeEntry[] }
export interface PcStorTimeResponse {
  mealData?: PcMealTimeEntry[]
}

export interface PcMealTimeEntry {
  mealCd: string // '1'=조식, '2'=중식, '3'=석식
  mealCdNm: string // e.g. '조식', '중식', '석식'
}

// GET /portal/dailyMenu — response: { ds: PcDailyMenuItem[] }
export interface PcDailyMenuItem {
  itemNmDp?: string // display name (Korean)
  itemNmDpEn?: string // display name (English)
  itemCd?: string // item code
  itemSeq?: number // sequence
  calorie?: number // kcal
  carbohydrates?: number
  protein?: number
  fat?: number
  salt?: number // sodium (mg)
  sugars?: number
  dietaryFiber?: number
  cholesterol?: number
  transFat?: number
  saturatedFat?: number
  calcium?: number
  packFg?: string // '1'=일반식, '2'=Take-Out
  soldOutYn?: string
  fileKey?: string
  hidePictureYn?: string
  fileUpload?: { url?: string; thumbnail?: string }[]
}
