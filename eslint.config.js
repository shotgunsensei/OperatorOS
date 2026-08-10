import tsParser from '@typescript-eslint/parser';

// The repository predates its root lint command and contains a small number of
// inline suppressions for optional Next/React rule packs.  Register their rule
// names so ESLint can parse those existing directives without making optional
// framework plugins a prerequisite for the Phase 21 syntax/safety gate.
const directiveCompatibilityRule = {
  meta: { type: 'problem', schema: [] },
  create: () => ({}),
};

const directiveCompatibilityPlugins = {
  '@next/next': {
    rules: { 'no-img-element': directiveCompatibilityRule },
  },
  'react-hooks': {
    rules: { 'exhaustive-deps': directiveCompatibilityRule },
  },
};

const nodeGlobals = {
  AbortSignal: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  globalThis: 'readonly',
  process: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  structuredClone: 'readonly',
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'build/**',
      'test-results/**',
      'playwright-report/**',
      'apps/modules/**/source/**',
      'apps/web/e2e/visual-baselines/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals,
    },
    plugins: directiveCompatibilityPlugins,
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-constant-binary-expression': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
      globals: nodeGlobals,
    },
    plugins: directiveCompatibilityPlugins,
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-constant-binary-expression': 'error',
    },
  },
];
