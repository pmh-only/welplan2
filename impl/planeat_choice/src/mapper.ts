import type { MealTime, MealTypeName, Menu, NutritionInfo } from '@welplan2/model'
import type { PcDailyMenuItem, PcMealTimeEntry } from './types.js'
import type { GetMenusParams, PcRestaurant } from './PlaneatChoiceClient.js'

const MEAL_TYPE_MAP: Record<string, MealTypeName> = {
  '1': 'breakfast',
  '2': 'lunch',
  '3': 'dinner',
  '4': 'supper',
  '5': 'snack',
  '6': 'dawn'
}

export function mapMealTime (raw: PcMealTimeEntry): MealTime {
  return {
    id: raw.mealCd,
    name: raw.mealCdNm,
    type: MEAL_TYPE_MAP[raw.mealCd]
  }
}

function mapNutritionInfo (raw: PcDailyMenuItem): NutritionInfo {
  return {
    calories: raw.calorie,
    carbohydrates: raw.carbohydrates,
    protein: raw.protein,
    fat: raw.fat,
    sodium: raw.salt,
    sugar: raw.sugars,
    fiber: raw.dietaryFiber,
    cholesterol: raw.cholesterol,
    transFat: raw.transFat,
    saturatedFat: raw.saturatedFat,
    calcium: raw.calcium
  }
}

export function mapMenu (
  raw: PcDailyMenuItem,
  index: number,
  params: GetMenusParams,
  restaurant: PcRestaurant
): Menu {
  return {
    id: `${params.date}-${params.storCd}-${params.mealCd}-${index}`,
    name: raw.itemNmDp ?? `Menu ${index + 1}`,
    date: params.date,
    mealTimeId: params.mealCd,
    restaurantId: restaurant.id,
    vendor: restaurant.vendor,
    components: [],
    nutrition: mapNutritionInfo(raw),
    isTakeOut: raw.packFg === '2',
    imageUrl: raw.hidePictureYn !== 'Y' ? raw.fileUpload?.[0]?.url : undefined
  }
}
