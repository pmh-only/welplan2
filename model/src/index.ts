export type Vendor = 'welstory' | 'shinsegae'

export type MealTypeName = 'breakfast' | 'lunch' | 'dinner' | 'supper' | 'snack' | 'dawn'

export interface Restaurant {
  id: string
  name: string
  vendor: Vendor
}

export interface MealTime {
  id: string
  name: string
  type?: MealTypeName
}

export interface NutritionInfo {
  calories?: number // kcal
  carbohydrates?: number // g
  protein?: number // g
  fat?: number // g
  sodium?: number // mg
  sugar?: number // g
  fiber?: number // g
  cholesterol?: number // mg
  transFat?: number // g
  saturatedFat?: number // g
  calcium?: number // mg
}

export interface MenuComponent {
  name: string
  nutrition?: NutritionInfo
  isMain?: boolean
}

export interface Menu {
  id: string
  name: string
  date: string // YYYYMMDD
  mealTimeId: string
  restaurantId: string
  vendor: Vendor
  components: MenuComponent[]
  nutrition?: NutritionInfo
  isTakeOut: boolean
  hallNo?: string // welstory-specific, required for detail lookup
  courseType?: string // welstory-specific, required for detail lookup
  imageUrl?: string // absolute URL to course photo (may require auth/referer)
}

export interface CafeteriaClient {
  getRestaurants(): Promise<Restaurant[]>
  getMealTimes(restaurant: Restaurant): Promise<MealTime[]>
  getMenus(restaurant: Restaurant, date: string, mealTimeId: string): Promise<Menu[]>
  // Optional: per-component nutrition detail (Welstory Plus only)
  getMenuDetail?(
    restaurant: Restaurant,
    date: string,
    mealTimeId: string,
    hallNo: string,
    courseType: string
  ): Promise<MenuComponent[]>
  getMenuNutrientDetail?(
    restaurant: Restaurant,
    date: string,
    mealTimeId: string,
    hallNo: string,
    courseType: string
  ): Promise<MenuComponent[]>
}
