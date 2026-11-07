import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { alphaTab } from '@coderline/alphatab-vite';
import { VitePWA } from 'vite-plugin-pwa';
import vercel from './vercel.json';
import { buildCommit } from './scripts/build-commit.mjs';

/** The same security headers as production (vercel.json), so `npm run preview` tests the real CSP. */
const securityHeaders = Object.fromEntries(vercel.headers[0]!.headers.map((h) => [h.key, h.value]));

export default defineConfig(({ mode }) => ({
  // Google OAuth client id (public, not a secret) from the GOOGLE_CLIENT_ID environment variable or .env file.
  // Only this exact variable is exposed to the app.
  define: {
    'import.meta.env.GOOGLE_CLIENT_ID': JSON.stringify(loadEnv(mode, '.', 'GOOGLE_CLIENT_ID').GOOGLE_CLIENT_ID ?? ''),
    'import.meta.env.BRASSY_COMMIT': JSON.stringify(buildCommit()),
  },
  plugins: [
    react(),
    alphaTab(),
    VitePWA({
      // A new version waits until the user taps "Update" (never reloads in the middle of editing).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Brassy',
        short_name: 'Brassy',
        description: 'Practise and edit trumpet music.',
        lang: 'en',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#EEF3FF',
        theme_color: '#EEF3FF',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything needed to work offline: app, alphaTab core/worker/worklet, music font, SoundFont, seed song.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,musicxml}', 'font/Bravura.woff2', 'font/Bravura.woff', 'soundfont/sonivox.sf2'],
        globIgnores: ['**/font/Bravura.svg'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, headers: securityHeaders },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
  },
}));
