import assert from 'node:assert/strict'
import test from 'node:test'
import type { Menu } from './types.js'
import { replaceMenuImages } from './live-menu-images.js'

function menu(overrides: Partial<Menu> = {}): Menu {
  return {
    id: 'menu-1',
    name: '캐시 메뉴',
    date: '20260731',
    mealTimeId: '2',
    restaurantId: 'REST000001',
    vendor: 'welstory',
    components: [{ name: '캐시 구성' }],
    nutrition: { calories: 500 },
    isTakeOut: false,
    imageUrl: 'https://example.com/cached.jpg',
    ...overrides
  }
}

test('replaces only the image URL of a matching cached menu', () => {
  const cached = menu()
  const live = menu({
    name: '변경된 메뉴명',
    components: [{ name: '변경된 구성' }],
    nutrition: { calories: 900 },
    imageUrl: 'https://example.com/live.jpg'
  })

  assert.deepEqual(replaceMenuImages([cached], [live]), [
    { ...cached, imageUrl: 'https://example.com/live.jpg' }
  ])
})

test('does not add live menus or remove cached images', () => {
  const cached = menu()
  const cachedMenus = [cached]
  const unrelated = menu({ id: 'menu-2', imageUrl: 'https://example.com/other.jpg' })

  assert.strictEqual(replaceMenuImages(cachedMenus, [unrelated]), cachedMenus)
  assert.strictEqual(replaceMenuImages(cachedMenus, [menu({ imageUrl: undefined })]), cachedMenus)
})
