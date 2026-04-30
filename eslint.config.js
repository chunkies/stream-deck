const tseslint = require('@typescript-eslint/eslint-plugin')
const tsparser = require('@typescript-eslint/parser')

module.exports = [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsparser },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any':          'error',
      '@typescript-eslint/no-unused-vars':           ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports':       'warn',
      '@typescript-eslint/prefer-as-const':          'error',
      'no-console':                                  'off',
      'prefer-const':                                'error',
      'no-var':                                      'error',
    },
  },
  {
    // Relax no-explicit-any in test files — mocks and fixtures legitimately need it
    files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  { ignores: ['dist/**', 'releases/**', 'node_modules/**'] },
]
