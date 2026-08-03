import assert from 'node:assert/strict'
import test from 'node:test'
import { isImageContentType, isImagePath } from './image-indexing.mjs'

test('identifies proxied and extension-based image paths', () => {
  assert.equal(
    isImagePath('/img/welstory/data/manager/recipe/E70Z/20260713/s20260708113336.png'),
    true
  )
  assert.equal(isImagePath('/static/photo.JPEG?version=1'), true)
  assert.equal(isImagePath('/brand/icon.svg#logo'), true)
  assert.equal(isImagePath('/img/extensionless'), true)
  assert.equal(isImagePath('/restaurants/menu'), false)
})

test('identifies image content types regardless of case', () => {
  assert.equal(isImageContentType('image/webp'), true)
  assert.equal(isImageContentType('IMAGE/PNG'), true)
  assert.equal(isImageContentType(['image/avif']), true)
  assert.equal(isImageContentType('text/html; charset=utf-8'), false)
})
