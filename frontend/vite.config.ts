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
        // Las páginas se resuelven en runtimeCaching (primero la red), no con navigateFallback.
        navigateFallback: null,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // Páginas: primero el servidor (hasta 4 s), para estrenar cada versión nueva desde
            // la primera vez que se abre; sin conexión, la copia guardada. /encuestas usa
            // encuestas.html (SuperShop Survey) y lo demás index.html (SuperShop).
            urlPattern: ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
            handler: async ({ request, url }) => {
              const page = /^\/encuestas(\/|$)/.test(url.pathname) ? '/encuestas.html' : '/index.html';
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 4000);
              try {
                return await fetch(request, { signal: controller.signal });
              } catch {
                return (await caches.match(page, { ignoreSearch: true })) || Response.error();
              } finally {
                clearTimeout(timer);
              }
            },
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
