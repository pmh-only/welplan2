import type { PageServerLoad } from './$types'
import { service } from '$lib/server/service'

export const load: PageServerLoad = async ({ params, parent }) => {
  const { restaurants } = await parent()

  const menus = await Promise.all(
    restaurants.map((r) => service.getMenus(r.id, params.date, params.time).catch(() => []))
  ).then((results) => results.flat())

  return { menus, date: params.date, time: params.time }
}
