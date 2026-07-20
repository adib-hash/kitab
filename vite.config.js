import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            // Cache remote book covers (Google / Open Library / Hardcover) so they
            // load instantly on repeat views and survive across sessions.
            urlPattern: ({ url }) => [
              'books.google.com',
              'books.googleusercontent.com',
              'covers.openlibrary.org',
              'assets.hardcover.app',
            ].some(h => url.hostname === h || url.hostname.endsWith('.' + h)),
            handler: 'CacheFirst',
            options: {
              cacheName: 'book-covers',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 3000 },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    chunkSizeWarningLimit: 600,
  },
})
