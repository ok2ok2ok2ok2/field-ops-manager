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
