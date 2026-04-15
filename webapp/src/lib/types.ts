export interface Restaurant {
  id: string
  name: string
  vendor: string
}

export interface MealTime {
  id: string
  name: string
  type?: string
}

export interface NutritionInfo {
  calories?: number
  carbohydrates?: number
  protein?: number
  fat?: number
  sodium?: number
  sugar?: number
  calcium?: number
}

export interface MenuComponent {
  name: string
  nutrition?: NutritionInfo
  isMain?: boolean
}

export interface Menu {
  id: string
  name: string
  date: string
  mealTimeId: string
  restaurantId: string
  vendor: string
  components: MenuComponent[]
  nutrition?: NutritionInfo
  isTakeOut: boolean
  hallNo?: string
  courseType?: string
  imageUrl?: string
}

export type PScoreWeights = {
  cal: number
  carb: number
  sugar: number
  fat: number
  protein: number
}
