import type { Menu } from './types.js'

function menuKey(menu: Menu): string {
  return [menu.vendor, menu.restaurantId, menu.date, menu.mealTimeId, menu.id].join(':')
}

export function replaceMenuImages(menus: Menu[], liveMenus: Menu[]): Menu[] {
  const liveImages = new Map(
    liveMenus
      .filter((menu): menu is Menu & { imageUrl: string } => Boolean(menu.imageUrl))
      .map((menu) => [menuKey(menu), menu.imageUrl])
  )
  let changed = false
  const nextMenus = menus.map((menu) => {
    const imageUrl = liveImages.get(menuKey(menu))
    if (!imageUrl || imageUrl === menu.imageUrl) return menu
    changed = true
    return { ...menu, imageUrl }
  })

  return changed ? nextMenus : menus
}
