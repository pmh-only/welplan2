import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeWorkerProblemAlertSettings } from '../../webapp/src/lib/server/service.js'
import { workerProblemMessage } from './worker-alerts.js'

test('formats incomplete restaurant details for a Discord alert', () => {
  const message = workerProblemMessage({
    summary: '전체 식당 데이터 수집이 일부 식당에서 완료되지 않았습니다.',
    totalRestaurants: 3,
    dates: ['20260801', '20260802'],
    restaurants: [{
      id: 'restaurant-2',
      name: '테스트 식당',
      vendor: 'welstory',
      mealTimeCount: 2,
      fetchedBatchCount: 3,
      expectedBatchCount: 4,
      errorCount: 1
    }]
  })

  assert.match(message, /영향 식당: \*\*1 \/ 3\*\*/)
  assert.match(message, /테스트 식당/)
  assert.match(message, /배치 3\/4, 오류 1/)
  assert.match(message, /20260801 ~ 20260802/)
})

test('accepts only Discord incoming webhook URLs', () => {
  const settings = normalizeWorkerProblemAlertSettings({
    enabled: true,
    discordWebhookUrl: 'https://discord.com/api/webhooks/123/token',
    discordRoleId: '123456789012345678'
  }, true)
  assert.equal(settings.enabled, true)

  assert.throws(() => normalizeWorkerProblemAlertSettings({
    enabled: true,
    discordWebhookUrl: 'https://example.com/api/webhooks/123/token',
    discordRoleId: '123456789012345678'
  }, true), /Discord Incoming Webhook URL/)

  assert.throws(() => normalizeWorkerProblemAlertSettings({
    enabled: true,
    discordWebhookUrl: 'https://discord.com/api/webhooks/123/token',
    discordRoleId: 'not-a-role-id'
  }, true), /Discord 역할 ID/)
})
