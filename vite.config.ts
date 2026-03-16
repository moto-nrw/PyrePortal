import { readFileSync } from 'fs';
import { resolve } from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

// BUILD_TARGET determines which platform adapter is bundled.
// Set via CLI env var (e.g. BUILD_TARGET=gkt npm run build).
// Tauri sets BUILD_TARGET=tauri via tauri.conf.json beforeDevCommand/beforeBuildCommand.
// Defaults to 'browser' for plain `npm run dev`.
const buildTarget = process.env.BUILD_TARGET || 'browser';

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  resolve: {
    alias: {
      '@platform': resolve(__dirname, `src/platform/${buildTarget}`),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
}));
