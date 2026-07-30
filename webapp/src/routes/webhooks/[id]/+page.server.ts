import type { PageServerLoad } from './$types'
import { consumeSlackOAuthResult } from '$lib/server/slack-webhook-oauth'

export const load: PageServerLoad = ({ cookies, url }) => ({
  slackOAuth: consumeSlackOAuthResult(cookies, url)
})
