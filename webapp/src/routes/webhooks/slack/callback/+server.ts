import type { RequestHandler } from './$types'
import { completeSlackInstall } from '$lib/server/slack-webhook-oauth'

export const GET: RequestHandler = ({ cookies, url }) => completeSlackInstall(cookies, url)
