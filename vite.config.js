/**
 * Vite 設定檔
 * 版本: v2.2 — PWA 排除 Auth 相關路由
 * 日期: 2026-03-16
 * 檔案: vite.config.js
 *
 * v2.2：navigateFallbackDenylist 加入 /login，Auth API 排除快取
 * v2.1：加入 PWA 支援
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      manifest: {
        name: '外勤工作管理系統',
        short_name: '外勤管理',
        description: '現場施工工作管理與排程系統',
        theme_color: '#1e3a5f',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        // ★ Android 分享選單：任何 App 選字分享過來就開快速輸入
        //   action 必須寫絕對網址 —— 相對路徑在 Android 分享選單不穩定，
        //   而且改完 manifest 要把 PWA 從桌面移除重裝才會生效（WebAPK 會快取）
        share_target: {
          action: 'https://field-ops-manager-phi.vercel.app/',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        // ★ 長按 App 圖示 → 直接跳快速輸入
        shortcuts: [
          {
            name: '語音記事',
            short_name: '語音記事',
            description: '車上用：按一下就開始錄，講完自動存草稿',
            url: '/voice',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: '新增待辦',
            short_name: '新增待辦',
            description: '直接開啟待辦快速輸入',
            url: '/?quickadd=1',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // ★ /login 不走 service worker fallback
        navigateFallbackDenylist: [/^\/login/],
        runtimeCaching: [
          // ★ Auth API 不快取（NetworkOnly）
          {
            urlPattern: /^https:\/\/eiyshksxngtgkydoopba\.supabase\.co\/auth\/v1\/.*/i,
            handler: 'NetworkOnly',
          },
          // REST API 維持 NetworkFirst
          {
            urlPattern: /^https:\/\/eiyshksxngtgkydoopba\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24
              },
              networkTimeoutSeconds: 3
            }
          }
        ]
      }
    })
  ],
})
