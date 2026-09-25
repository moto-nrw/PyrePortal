import { readFileSync } from 'fs';
import { resolve } from 'path';

import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

// The deploy workflow registers the deploy under the same release name.
const sentryRelease = `pyreportal@${pkg.version}+${process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'}`;
// Source maps are only built when they are uploaded; the deploy deletes them before rsync.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

// Production always ships both real adapters. BUILD_TARGET only selects a
// development adapter; legacy production commands still produce one bundle.
export default defineConfig(({ command }) => {
  const buildTarget = command === 'build' ? 'kiosk' : process.env.BUILD_TARGET || 'browser';
  return {
    plugins: [
      react(),
      // Load system.js before the kiosk app — the GKT-Kiosk WebView provides the
      // native GKTKiosk object, but system.js (the JS wrapper) must be loaded
      // explicitly. Must come before the app module script.
      (buildTarget === 'gkt' || buildTarget === 'kiosk') && {
        name: 'inject-system-js',
        transformIndexHtml(html: string) {
          return html.replace('<head>', '<head>\n    <script src="/system.js"></script>');
        },
      },
      sentryAuthToken
        ? sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: sentryAuthToken,
            release: { name: sentryRelease, inject: false },
            telemetry: false,
          })
        : null,
    ].filter(Boolean),

    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __SENTRY_RELEASE__: JSON.stringify(sentryRelease),
      __SENTRY_ENVIRONMENT__: JSON.stringify(process.env.DEPLOY_ENV ?? 'development'),
    },

    build: {
      sourcemap: sentryAuthToken ? 'hidden' : false,
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
  };
});
