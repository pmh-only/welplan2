import type { PageServerLoad } from './$types'
import { count } from 'drizzle-orm'
import { activeTermsVersion } from '$lib/legal'
import { WEBHOOK_PLATFORMS, type WebhookPlatform } from '$lib/webhook-types'
import { db } from '$lib/server/db'
import { webhookSubscriptions } from '$lib/server/db/schema'
import { consumeSlackOAuthResult } from '$lib/server/slack-webhook-oauth'

export const load: PageServerLoad = async ({ cookies, url }) => {
  const rows = await db
    .select({ platform: webhookSubscriptions.platform, count: count() })
    .from(webhookSubscriptions)
    .groupBy(webhookSubscriptions.platform)

  const registrationCounts = Object.fromEntries(
    WEBHOOK_PLATFORMS.map((platform) => [
      platform,
      rows.find((row) => row.platform === platform)?.count ?? 0
    ])
  ) as Record<WebhookPlatform, number>

  return {
    termsVersion: activeTermsVersion(),
    slackOAuth: consumeSlackOAuthResult(cookies, url),
    registrationCounts
  }
}
