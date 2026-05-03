import { test, expect } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(__filename)
const { createMockSDK } = _require('../../../sdk/testing')

let sdk: ReturnType<typeof createMockSDK>

test('stopped cron does not fire on tickCron', async () => {
  sdk = createMockSDK()
  let count = 0
  const stop = sdk.cron(1000, async () => { count++ })
  stop()
  await sdk.tickCron()
  expect(count).toBe(0)
})

test('active cron still fires after another is stopped', async () => {
  sdk = createMockSDK()
  let countA = 0, countB = 0
  const stopA = sdk.cron(1000, async () => { countA++ })
  sdk.cron(1000, async () => { countB++ })
  stopA()
  await sdk.tickCron()
  expect(countA).toBe(0)
  expect(countB).toBe(1)
})
