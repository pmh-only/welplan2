import { sveltekit } from '@sveltejs/kit/vite'
import { SvelteKitPWA } from '@vite-pwa/sveltekit'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      injectRegister: null,
      registerType: 'autoUpdate',
      includeAssets: [
        'apple-touch-icon.png',
        'favicon.svg',
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
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        categories: ['food', 'productivity', 'utilities'],
        prefer_related_applications: false,
        launch_handler: {
          client_mode: 'navigate-existing'
        },
        handle_links: 'preferred',
        edge_side_panel: {
          preferred_width: 420
        },
        icons: [
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
            purpose: 'any'
          },
          {
            src: '/manifest-icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/manifest-icon-48.webp',
            sizes: '48x48',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: '/manifest-icon-72.webp',
            sizes: '72x72',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: '/manifest-icon-96.webp',
            sizes: '96x96',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: '/manifest-icon-128.webp',
            sizes: '128x128',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: '/manifest-icon-144.webp',
            sizes: '144x144',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: '/manifest-icon-152.webp',
            sizes: '152x152',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: '/manifest-icon-180.webp',
            sizes: '180x180',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: '/manifest-icon-192.webp',
            sizes: '192x192',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: '/manifest-icon-384.webp',
            sizes: '384x384',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: '/manifest-icon-512.webp',
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: '/manifest-icon-1024.webp',
            sizes: '1024x1024',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: '/manifest-icon-maskable-192.webp',
            sizes: '192x192',
            type: 'image/webp',
            purpose: 'maskable'
          },
          {
            src: '/manifest-icon-maskable-384.webp',
            sizes: '384x384',
            type: 'image/webp',
            purpose: 'maskable'
          },
          {
            src: '/manifest-icon-maskable-512.webp',
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'maskable'
          },
          {
            src: '/manifest-icon-maskable-1024.webp',
            sizes: '1024x1024',
            type: 'image/webp',
            purpose: 'maskable'
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
          },
          {
            src: '/pwa-screenshot-takeout-desktop.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Welplan take-out desktop'
          },
          {
            src: '/pwa-screenshot-takeout-mobile.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Welplan take-out mobile'
          },
          {
            src: '/pwa-screenshot-restaurants-desktop.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Welplan restaurant search desktop'
          },
          {
            src: '/pwa-screenshot-restaurants-mobile.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Welplan restaurant search mobile'
          },
          {
            src: '/pwa-screenshot-api-desktop.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Welplan API docs desktop'
          },
          {
            src: '/pwa-screenshot-api-mobile.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Welplan API docs mobile'
          }
        ],
        shortcuts: [
          {
            name: '메뉴 갤러리',
            short_name: '갤러리',
            description: '오늘의 메뉴 사진과 영양정보를 확인합니다.',
            url: '/',
            icons: [
              { src: '/manifest-icon-192.png', sizes: '192x192', type: 'image/png' }
            ]
          },
          {
            name: '테이크 인 식단',
            short_name: '테이크 인',
            description: '매장 식사 메뉴와 영양정보를 엽니다.',
            url: '/takein',
            icons: [
              { src: '/manifest-icon-192.png', sizes: '192x192', type: 'image/png' }
            ]
          },
          {
            name: '테이크 아웃 식단',
            short_name: '테이크 아웃',
            description: '포장 메뉴와 코인 계산 화면을 엽니다.',
            url: '/takeout',
            icons: [
              { src: '/manifest-icon-192.png', sizes: '192x192', type: 'image/png' }
            ]
          },
          {
            name: '식당 선택',
            short_name: '식당 선택',
            description: '조회할 식당을 검색하고 저장합니다.',
            url: '/restaurants',
            icons: [
              { src: '/manifest-icon-192.png', sizes: '192x192', type: 'image/png' }
            ]
          }
        ]
      },
      workbox: {
        globPatterns: [
          'client/**/*.{js,css,html,svg,png,webp,webmanifest,json,txt}'
        ],
        modifyURLPrefix: {},
        globIgnores: ['**/node_modules/**', '**/workbox-*.js'],
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^gclid$/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/_app/immutable/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'welplan-app-assets',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 128,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && /\.(?:svg|webp|png|json|txt|webmanifest)$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'welplan-static-assets',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'welplan-pages-v2',
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
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/img/'),
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
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname === '/api/version',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'welplan-version',
              networkTimeoutSeconds: 3,
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60
              }
            }
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/api/'),
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
