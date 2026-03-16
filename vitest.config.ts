import { readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

export default defineConfig({
  plugins: [react()],

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TARGET__: JSON.stringify('browser'),
  },

  resolve: {
    alias: {
      '@platform': resolve(__dirname, 'src/platform/browser'),
    },
  },

  test: {
    environment: 'happy-dom',
    globals: true,
    pool: 'forks',
    forks: { execArgv: ['--max-old-space-size=4096'] },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/src-tauri/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/test/**',
        'src/vite-env.d.ts',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/*.d.ts',
        '**/CLAUDE.md',
      ],
    },
  },
});
