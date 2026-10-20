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
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'survey-icon-192.png', 'survey-icon-512.png', 'survey-icon-maskable-512.png', 'survey-apple-touch-icon.png', 'superShop.jpg', 'supershop_fondo_azul.png'],
      // Dos apps instalables con su propio manifiesto (archivos en assets/):
      // - manifest.webmanifest → SuperShop (logo azul), entrada index.html.
      // - encuestas.webmanifest → SuperShop Survey (logo blanco), entrada encuestas.html.
      // Con manifest: false el plugin no inyecta un tercer manifiesto en el HTML.
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        // /encuestas no usa index.html: tiene su propia entrada (ver runtimeCaching).
        navigateFallbackDenylist: [/^\/api\//, /^\/encuestas(\/|$)/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // SuperShop Survey: las pantallas de /encuestas se abren con encuestas.html (su
            // manifiesto y su ícono), también sin conexión.
            urlPattern: ({ request, url }) => request.mode === 'navigate' && /^\/encuestas(\/|$)/.test(url.pathname),
            handler: async () =>
              (await caches.match('/encuestas.html', { ignoreSearch: true })) || fetch('/encuestas.html'),
          },
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
    rollupOptions: {
      input: { main: 'index.html', encuestas: 'encuestas.html' },
    },
  },
});
