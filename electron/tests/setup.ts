import { vi } from 'vitest'
// Provide jest as an alias for vi so Jest-style tests run without modification
;(globalThis as Record<string, unknown>).jest = vi
