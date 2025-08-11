// ESLint v9 flat config (CommonJS)
const js = require('@eslint/js');
const globals = require('globals');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    files: ['**/*.js'],
    ignores: [
      'node_modules/',
      'captures/',
      'uploads/',
      'data/',
      'dist/',
      'server/public/**',
      'tests-e2e/**',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.browser,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      eqeqeq: ['warn', 'smart'],
      'no-console': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-inner-declarations': 'off',
      'no-constant-condition': 'off',
      'no-case-declarations': 'warn',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.browser,
      },
    },
  },
  {
    files: ['capture/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        document: 'readonly',
        window: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
];
