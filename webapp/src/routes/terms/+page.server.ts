import type { PageServerLoad } from './$types'
import { activeTermsVersion } from '$lib/legal'

export const load: PageServerLoad = () => ({
  termsVersion: activeTermsVersion()
})
