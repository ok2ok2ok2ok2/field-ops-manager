/**
 * Vite 設定檔
 * 版本: v2.1 — 加入 PWA 支援
 * 日期: 2026-03-10
 * 檔案: vite.config.js
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
        // 快取所有靜態資源
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // 離線時 API 請求的處理
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/eiyshksxngtgkydoopba\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 1 天
              },
              networkTimeoutSeconds: 3
            }
          }
        ]
      }
    })
  ],
})