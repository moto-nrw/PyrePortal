import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom for DOM simulation
    environment: 'jsdom',

    // Setup file for extending matchers (e.g., @testing-library/jest-dom)
    setupFiles: ['./src/test/setup.ts'],

    // Include test files patterns
    include: ['src/**/*.{test,spec}.{ts,tsx}'],

    // Exclude patterns
    exclude: ['node_modules', 'dist', 'src-tauri'],

    // Global test settings
    globals: true,

    // Coverage configuration
    coverage: {
      // Use v8 for coverage (requires @vitest/coverage-v8)
      provider: 'v8',

      // Enable coverage by default when running with --coverage flag
      enabled: false,

      // Output directory for coverage reports
      reportsDirectory: './coverage',

      // Report formats - lcov is required for SonarCloud
      reporter: ['text', 'text-summary', 'lcov', 'html'],

      // Include/exclude patterns for coverage
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],

      // Coverage thresholds - disabled for now
      // SonarCloud enforces its own Quality Gate thresholds (80% on new code)
      // We don't need to duplicate that locally since it would fail for untested legacy code
      // Thresholds can be enabled later once test coverage improves
      // thresholds: {
      //   perFile: false,
      //   lines: 80,
      //   branches: 80,
      //   functions: 80,
      //   statements: 80,
      // },

      // Only include files that have tests (set to false to avoid failing on untested files)
      all: false,

      // Clean coverage output before each run
      clean: true,
    },

    // Test timeout
    testTimeout: 10000,

    // CSS handling - skip CSS imports in tests
    css: false,
  },
});
