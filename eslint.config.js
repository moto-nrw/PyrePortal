import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import a11yPlugin from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import securityPlugin from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Prettier must come first to turn off conflicting rules
  prettierConfig,
  {
    // Basic configuration
    ignores: ['dist/**', 'node_modules/**', 'src-tauri/target/**'],
  },
  // React plugin integration
  {
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      import: importPlugin,
      'jsx-a11y': a11yPlugin,
      security: securityPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
    rules: {
      // React core rules
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Import rules
      'import/first': 'error',
      'import/no-duplicates': 'error',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // Accessibility rules
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-has-content': 'warn',
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/aria-proptypes': 'warn',
      'jsx-a11y/aria-unsupported-elements': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',

      // Security rules
      'security/detect-object-injection': 'off', // Often gives false positives
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-unsafe-regex': 'warn',
      'security/detect-buffer-noassert': 'error',
    },
  },
  // TypeScript configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      // Additional adjustments for PyrePortal
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'warn',
    },
  },
  // General configuration
  {
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        projectService: true,
      },
    },
  },

  // Test file overrides — relax rules that conflict with test patterns
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx', 'src/test/**'],
    rules: {
      // Tests commonly use any for mocking
      '@typescript-eslint/no-explicit-any': 'off',
      // Unbound methods are common in mock assertions
      '@typescript-eslint/unbound-method': 'off',
      // Console usage is fine in tests
      'no-console': 'off',
      // Tests don't need safe Tauri invoke patterns
      'no-restricted-syntax': 'off',
      // Floating promises are common with act() and fireEvent
      '@typescript-eslint/no-floating-promises': 'off',
      // Allow non-null assertions in tests (simpler mock access)
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Empty functions are common in mock factories (noop callbacks)
      '@typescript-eslint/no-empty-function': 'off',
      // Vitest matchers (expect.objectContaining, expect.any) return any
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // Comparing numbers with enums is common in test assertions
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
    },
  },

  // Tauri-specific rules
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Custom rules for Tauri IPC calls
      'no-restricted-syntax': [
        'warn',
        {
          selector: "CallExpression[callee.name='invoke'][arguments.length=1]",
          message:
            'Tauri invoke() calls should include error handling with .then().catch() or try/catch with await',
        },
      ],

      // Custom rules for file system access
      'security/detect-non-literal-fs-filename': 'error',

      // Custom no-hardcoded-tauri-paths rule to prevent hardcoding paths
      'no-restricted-globals': [
        'warn',
        {
          name: '__dirname',
          message: "Use Tauri's path API instead of Node.js path globals",
        },
        {
          name: '__filename',
          message: "Use Tauri's path API instead of Node.js path globals",
        },
      ],
    },
  }
);
