import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Restaurant } from '@pmh-only/welplan2-model'
import { PlaneatChoiceClient } from '../src/PlaneatChoiceClient.js'

test('rejects a restaurant without trusted PlanEAT metadata before fetching', async () => {
  const originalFetch = globalThis.fetch
  let fetchCount = 0
  globalThis.fetch = async () => {
    fetchCount++
    return Response.json({ mealData: [] })
  }

  try {
    const client = new PlaneatChoiceClient({ baseUrl: 'https://invalid-planeat.test' })
    const restaurant: Restaurant = {
      id: "CAF01' OR PG_SLEEP(15)--",
      name: '오염 식당',
      vendor: 'shinsegae'
    }

    await assert.rejects(() => client.getMealTimes(restaurant), /Invalid PlanEAT restaurant/)
    assert.equal(fetchCount, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})
