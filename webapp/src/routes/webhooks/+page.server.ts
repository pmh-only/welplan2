import type { PageServerLoad } from './$types'
import { activeTermsVersion } from '$lib/legal'
import { consumeSlackOAuthResult } from '$lib/server/slack-webhook-oauth'

export const load: PageServerLoad = ({ cookies, url }) => ({
  termsVersion: activeTermsVersion(),
  slackOAuth: consumeSlackOAuthResult(cookies, url)
})
