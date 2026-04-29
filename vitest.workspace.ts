import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      name:        'server-unit',
      environment: 'node',
      include:     ['tests/unit/**/*.test.{js,ts}'],
      globals:     true,
      setupFiles:  ['tests/unit/setup.js'],
    },
  },
])
