// Raw API response types for WelStory Plus
// Verified against actual API responses (Restaurant: R5 B1F / REST000007, Date: 20250814, Meal: 점심)

export interface WpApiResponse<T> {
  code: number
  message: string | null
  data: T
}

// GET /api/mypage/rest-list
// GET /api/mypage/rest-my-list
export interface WpRestaurant {
  restaurantId: string | null
  restaurantCode?: string | null
  restaurantName: string
  mainDiv: string // 'Y' = main/selected
  orderSeq: number
  useBeacon: string
  engMenuYn: string
}

// GET /api/menu/getMealTimeList
export interface WpMealTime {
  code: string // meal time ID (e.g. '1'=아침, '2'=점심, '3'=저녁 ...)
  codeNm: string // meal time name
  tmYn: string // 'Y' = currently active
}

// Each dish item returned from GET /api/meal  (inside data.mealList)
// All dishes sharing the same hallNo+menuCourseType belong to one course/menu
export interface WpDish {
  menuName: string // dish name (e.g. '물밀면')
  menuCode: string
  hallNo: string // course identifier (e.g. 'E59T')
  menuDt: string // YYYYMMDD
  menuCourseType: string // course type code (e.g. 'CC')
  menuMealType: string // meal time ID
  restaurantCode: string
  restaurantName: string
  courseTxt: string // course display name (e.g. '우리미각면')
  typicalMenu: string // 'Y' = main dish, 'N' = side dish
  salesType: string // 'L1' = dine-in lunch, 'T1' = take-out, etc.
  menuMealSeq: number
  photoCd: string // photo filename (e.g. 's20260202145138.png'), empty string if none
  photoUrl: string // photo base URL (e.g. 'http://samsungwelstory.com/data/manager/recipe/E59S/20260308/')
  // per-dish nutrition (string values, may contain commas)
  kcal: string | null
  // course-level aggregate nutrition (same for all dishes in same course)
  sumKcal: string | null
  sumProtein: string | null
  sumFat: string | null
  sumNa: string | null
  sumSugar: string | null
}

// Wrapper for the /api/meal data field
export interface WpMealListWrapper {
  mealList: WpDish[]
}

// Each item returned from GET /api/meal/detail (inside data array)
// Per-dish kcal; tot* fields are course-level totals shared across all dishes
export interface WpMenuDetail {
  menuName: string // dish name
  courseTxt: string // course name
  hallNo: string
  menuCourseType: string
  menuDt: string
  menuMealType: string
  restaurantCode: string
  // per-dish
  kcal: string | null
  // course-level totals (string values, may contain commas)
  totKcal: string | null
  totCho: string | null // carbohydrates
  totProtein: string | null
  totFat: string | null
  totNa: string | null // sodium
  totSugar: string | null
  totCalcium: string | null
}

// Each item returned from GET /api/meal/detail/nutrient (inside data array)
// Unlike /api/meal/detail, tot* values here are per-item nutrients for selectable menus.
export interface WpMenuNutrient {
  menuName: string
  typicalMenu: string
  kcal: string | null
  totCho: string | null
  totProtein: string | null
  totFat: string | null
  totNa: string | null
  totSugar: string | null
  totFib: string | null
  totCalcium: string | null
}
