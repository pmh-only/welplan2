import type { PageLoad } from './$types'

export const load: PageLoad = ({ params }) => {
  return { date: params.date, time: params.time }
}
