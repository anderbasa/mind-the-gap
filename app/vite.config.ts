/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// La app se publica en https://anderbasa.github.io/mind-the-gap/
export default defineConfig({
  base: '/mind-the-gap/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: false, // usamos public/manifest.webmanifest, escrito a mano
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,json}'], // json = banco de ejercicios, disponible sin conexión
        globIgnores: ['splash/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true, // la versión nueva toma el control enseguida

        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fuentes-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'fuentes', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/bank/'),
            handler: 'CacheFirst',
            options: { cacheName: 'banco', expiration: { maxEntries: 400 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/splash/'),
            handler: 'CacheFirst',
            options: { cacheName: 'splash', expiration: { maxEntries: 30 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5181,
    fs: { allow: ['..'] }, // para importar ../prompts/*.md?raw
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
