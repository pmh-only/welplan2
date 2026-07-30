import type { RequestHandler } from './$types'
import { createSlackInstallRedirect } from '$lib/server/slack-webhook-oauth'

export const GET: RequestHandler = ({ cookies, url }) => createSlackInstallRedirect(cookies, url)
