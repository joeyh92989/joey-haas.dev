import js from '@eslint/js'
import prettierConfig from 'eslint-config-prettier/flat'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/**
 * ESLint 10 flat config.
 *
 * This project runs JavaScript in three environments, and a single set of
 * globals produces false positives in all of them: `document` is undefined in
 * the build plugin, `process` is undefined in components, and the Vitest
 * globals exist only in test files because vitest.config.js sets globals: true.
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },

  js.configs.recommended,

  // Application code: runs in the browser.
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
    },
  },

  // Build tooling and scripts: run in Node.
  {
    files: ['*.config.js', 'vite-plugin-markdown.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },

  // Tests: Vitest injects describe/it/expect because globals: true is set.
  {
    files: ['src/**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.vitest },
    },
  },

  // Must come last: turns off every stylistic rule Prettier owns, so the two
  // tools cannot disagree about the same line.
  prettierConfig,
]
