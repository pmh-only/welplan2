import type { RequestHandler } from './$types'

const manifest = {
  id: '/',
  name: 'Welplan',
  short_name: 'Welplan',
  description:
    '삼성 웰스토리와 신세계푸드 구내식당 메뉴, 이미지, 영양 정보를 한곳에서 확인하는 웹앱',
  start_url: '/gallery',
  scope: '/',
  display: 'standalone',
  background_color: '#f8fafc',
  theme_color: '#0f172a',
  lang: 'ko-KR',
  categories: ['food', 'lifestyle', 'health'],
  icons: [
    {
      src: '/icon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any'
    },
    {
      src: '/icon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'maskable'
    }
  ]
}

export const GET: RequestHandler = () => {
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=86400'
    }
  })
}
