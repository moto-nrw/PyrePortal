import { readFileSync } from 'fs';
import { resolve } from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

// BUILD_TARGET determines which platform adapter is bundled.
// Set via CLI env var (e.g. BUILD_TARGET=gkt pnpm run build).
// The retired Tauri configuration still sets BUILD_TARGET=tauri while its
// legacy source remains in the repository. Do not use it for new work.
// Defaults to 'browser' for plain `pnpm run dev`.
const buildTarget = process.env.BUILD_TARGET || 'browser';

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    // Inject system.js for GKT builds — the GKT-Kiosk WebView provides the
    // native GKTKiosk object, but system.js (the JS wrapper) must be loaded
    // explicitly. Must come before the app module script.
    buildTarget === 'gkt' && {
      name: 'inject-system-js',
      transformIndexHtml(html: string) {
        return html.replace('<head>', '<head>\n    <script src="/system.js"></script>');
      },
    },
  ].filter(Boolean),

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  resolve: {
    alias: {
      '@platform': resolve(__dirname, `src/platform/${buildTarget}`),
    },
  },

  // Keep the fixed port used by kiosk testing and the retired Tauri config.
  clearScreen: false,
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
      // Ignore the retired Rust source.
      ignored: ['**/src-tauri/**'],
    },
  },
}));
