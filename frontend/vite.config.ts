import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  publicDir: 'assets',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'superShop.jpg', 'supershop_fondo_azul.png'],
      manifest: {
        name: 'SuperShop',
        short_name: 'SuperShop',
        description: 'Sistema de administración de tiendas',
        lang: 'es',
        theme_color: '#2b46c4',
        background_color: '#f5f5f7',
        display: 'standalone',
        id: '/',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /\/api\/(catalog\/|settings(\?|$))/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-catalogs',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 80, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
