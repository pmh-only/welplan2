import type {
  MealTime,
  MealTypeName,
  Menu,
  MenuComponent,
  NutritionInfo,
  Restaurant
} from '@pmh-only/welplan2-model'
import type { WpDish, WpMealTime, WpMenuDetail, WpMenuNutrient, WpRestaurant } from './types.js'

// Nutrition values from the API are strings and may contain commas (e.g. "1,475")
export function parseNum(val: string | null | undefined): number | undefined {
  if (!val) return undefined
  const n = parseFloat(val.replace(/,/g, ''))
  return isNaN(n) ? undefined : n
}

export function mapRestaurant(raw: WpRestaurant): Restaurant {
  return {
    id: raw.restaurantId,
    name: raw.restaurantName,
    vendor: 'welstory'
  }
}

// Meal type codes verified from actual API response
const MEAL_TYPE_MAP: Record<string, MealTypeName> = {
  1: 'breakfast',
  2: 'lunch',
  3: 'dinner',
  4: 'supper',
  5: 'snack',
  6: 'dawn'
}

export function mapMealTime(raw: WpMealTime): MealTime {
  return {
    id: raw.code,
    name: raw.codeNm,
    type: MEAL_TYPE_MAP[raw.code]
  }
}

// Group a flat list of dishes into courses (by hallNo + menuCourseType)
export function groupDishesToMenus(dishes: WpDish[], restaurantId: string): Menu[] {
  const groups = new Map<string, WpDish[]>()

  for (const dish of dishes) {
    const key = `${dish.hallNo}-${dish.menuCourseType}`
    const group = groups.get(key)
    if (group) {
      group.push(dish)
    } else {
      groups.set(key, [dish])
    }
  }

  return [...groups.values()].map((group) => mapCourseToMenu(group, restaurantId))
}

function isTakeOutName(name: string): boolean {
  return (
    /^\[\d+Coin\]/.test(name) ||
    /외\s*\d+종$/.test(name) ||
    name.includes('도시락') ||
    name.includes('사이드')
  )
}

function isTakeOutCourse(dishes: WpDish[]): boolean {
  return dishes.some((dish) => isTakeOutName(dish.menuName))
}

function mapCourseToMenu(dishes: WpDish[], restaurantId: string): Menu {
  const first = dishes[0]
  const main = dishes.find((d) => d.typicalMenu === 'Y') ?? first

  const components: MenuComponent[] = dishes.map((d) => ({
    name: d.menuName,
    nutrition: { calories: parseNum(d.kcal) }
  }))

  const nutrition: NutritionInfo = {
    calories: parseNum(first.sumKcal),
    protein: parseNum(first.sumProtein),
    fat: parseNum(first.sumFat),
    sodium: parseNum(first.sumNa),
    sugar: parseNum(first.sumSugar)
  }

  return {
    id: `${first.menuDt}-${first.restaurantCode}-${first.hallNo}-${first.menuCourseType}`,
    name: main.menuName,
    date: first.menuDt,
    mealTimeId: first.menuMealType,
    restaurantId,
    vendor: 'welstory',
    components,
    nutrition,
    isTakeOut: (first.salesType?.startsWith('T') ?? false) || isTakeOutCourse(dishes),
    hallNo: first.hallNo,
    courseType: first.menuCourseType,
    imageUrl: first.photoCd && first.photoUrl ? first.photoUrl + first.photoCd : undefined
  }
}

// Maps detail response items to MenuComponents.
// All items share the same course-level tot* totals; attach them to each component's nutrition
// so callers can read carbs/sugar/etc from detail[0].nutrition.
export function mapMenuDetails(details: WpMenuDetail[]): MenuComponent[] {
  return details.map((d) => ({
    name: d.menuName,
    nutrition: {
      calories: parseNum(d.kcal),
      carbohydrates: parseNum(d.totCho),
      sugar: parseNum(d.totSugar),
      fat: parseNum(d.totFat),
      protein: parseNum(d.totProtein),
      sodium: parseNum(d.totNa),
      calcium: parseNum(d.totCalcium)
    }
  }))
}

export function mapMenuNutrients(details: WpMenuNutrient[]): MenuComponent[] {
  return details.map((d) => ({
    name: d.menuName,
    isMain: d.typicalMenu === 'Y',
    nutrition: {
      calories: parseNum(d.kcal),
      carbohydrates: parseNum(d.totCho),
      sugar: parseNum(d.totSugar),
      fiber: parseNum(d.totFib),
      fat: parseNum(d.totFat),
      protein: parseNum(d.totProtein),
      sodium: parseNum(d.totNa),
      calcium: parseNum(d.totCalcium)
    }
  }))
}

// Extracts course-level nutrition from a detail response (all items share the same tot* values)
export function mapCourseNutritionFromDetail(details: WpMenuDetail[]): NutritionInfo {
  const first = details[0]
  return {
    calories: parseNum(first.totKcal),
    carbohydrates: parseNum(first.totCho),
    protein: parseNum(first.totProtein),
    fat: parseNum(first.totFat),
    sodium: parseNum(first.totNa),
    sugar: parseNum(first.totSugar),
    calcium: parseNum(first.totCalcium)
  }
}
