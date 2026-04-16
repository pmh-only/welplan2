import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = ({ url }) => {
  const query = url.searchParams.toString()
  redirect(308, query ? `/?${query}` : '/')
}
