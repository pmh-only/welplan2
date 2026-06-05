import { sveltekit } from '@sveltejs/kit/vite'
import { SvelteKitPWA } from '@vite-pwa/sveltekit'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'offline.html',
        'og-image.png',
        'og-image.webp'
      ],
      includeManifestIcons: true,
      manifest: {
        id: '/',
        name: 'Welplan',
        short_name: 'Welplan',
        description: '웰스토리와 신세계푸드 메뉴를 빠르게 확인할 수 있는 식단 조회 웹앱',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'browser'],
        lang: 'ko-KR',
        start_url: '/',
        scope: '/',
        orientation: 'any',
        categories: ['food', 'productivity', 'utilities'],
        icons: [
          {
            src: '/manifest-icon-192.webp',
            sizes: '192x192',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: '/manifest-icon-512.webp',
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'any maskable'
          },
          {
            src: '/manifest-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/manifest-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ],
        screenshots: [
          {
            src: '/pwa-screenshot-home-desktop.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Welplan home desktop'
          },
          {
            src: '/pwa-screenshot-home-mobile.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Welplan home mobile'
          },
          {
            src: '/pwa-screenshot-takein-desktop.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Welplan take-in desktop'
          },
          {
            src: '/pwa-screenshot-takein-mobile.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Welplan take-in mobile'
          }
        ],
        shortcuts: [
          {
            name: '메뉴 갤러리',
            short_name: '갤러리',
            description: '오늘의 메뉴 사진과 영양정보를 확인합니다.',
            url: '/',
            icons: [
              { src: '/manifest-icon-192.webp', sizes: '192x192', type: 'image/webp' },
              { src: '/manifest-icon-192.png', sizes: '192x192', type: 'image/png' }
            ]
          },
          {
            name: '테이크 인 식단',
            short_name: '테이크 인',
            description: '매장 식사 메뉴와 영양정보를 엽니다.',
            url: '/takein',
            icons: [
              { src: '/manifest-icon-192.webp', sizes: '192x192', type: 'image/webp' },
              { src: '/manifest-icon-192.png', sizes: '192x192', type: 'image/png' }
            ]
          },
          {
            name: '테이크 아웃 식단',
            short_name: '테이크 아웃',
            description: '포장 메뉴와 코인 계산 화면을 엽니다.',
            url: '/takeout',
            icons: [
              { src: '/manifest-icon-192.webp', sizes: '192x192', type: 'image/webp' },
              { src: '/manifest-icon-192.png', sizes: '192x192', type: 'image/png' }
            ]
          },
          {
            name: '식당 선택',
            short_name: '식당 선택',
            description: '조회할 식당을 검색하고 저장합니다.',
            url: '/restaurants',
            icons: [
              { src: '/manifest-icon-192.webp', sizes: '192x192', type: 'image/webp' },
              { src: '/manifest-icon-192.png', sizes: '192x192', type: 'image/png' }
            ]
          }
        ]
      },
      workbox: {
        globPatterns: [
          'client/**/*.{js,css,html,svg,png,webp,webmanifest,json,txt}'
        ],
        globIgnores: ['**/node_modules/**', '**/workbox-*.js'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/offline.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'welplan-pages',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 32,
                maxAgeSeconds: 14 * 24 * 60 * 60
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/css/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-static',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 24,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          },
          {
            urlPattern: /^\/img\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'welplan-images',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60
              }
            }
          },
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'welplan-api'
            }
          }
        ]
      }
    })
  ]
})
