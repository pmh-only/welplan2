import assert from 'node:assert/strict'
import test from 'node:test'
import { isPhotoOlderThanRetention } from './image-retention.ts'

const now = Date.parse('2026-07-29T12:00:00+09:00')

test('expires meal-plan images at the 20-day boundary', () => {
  assert.equal(isPhotoOlderThanRetention('20260710', now), false)
  assert.equal(isPhotoOlderThanRetention('20260709', now), true)
  assert.equal(isPhotoOlderThanRetention('photo_20260708.jpg', now), true)
})

test('does not expire values without a valid meal-plan date', () => {
  assert.equal(isPhotoOlderThanRetention('photo-without-date.jpg', now), false)
  assert.equal(isPhotoOlderThanRetention('20260230', now), false)
})
