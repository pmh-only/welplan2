import assert from 'node:assert/strict'
import test from 'node:test'
import { IMAGE_RETENTION_MS, isPhotoOlderThanRetention } from './image-retention.js'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 7, 7, 15) // 2026-08-08 00:00 in Korea

test('retains images newer than 14 calendar days', () => {
  assert.equal(IMAGE_RETENTION_MS, 14 * DAY_MS)
  assert.equal(isPhotoOlderThanRetention('20260726', NOW), false)
})

test('expires images once they are 14 calendar days old', () => {
  assert.equal(isPhotoOlderThanRetention('20260725', NOW), true)
  assert.equal(isPhotoOlderThanRetention('welstory/photo_20260724.jpg', NOW), true)
})
