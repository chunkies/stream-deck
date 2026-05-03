import { describe, test, expect, beforeEach } from 'vitest'
import { state } from '../../renderer/src/state'
import { initAppearanceEditor, setAppearanceFromComp, getAppearanceFields } from '../../renderer/src/appearance'

beforeEach(() => {
  state.currentGradient = null
  state.pendingImages   = {}
  state.serverInfo      = null
  initAppearanceEditor()
})

describe('setAppearanceFromComp', () => {
  test('gradient — stores in state, not in ea-color input', () => {
    const gradient = 'linear-gradient(135deg,#f093fb,#f5576c)'
    setAppearanceFromComp({ color: gradient, label: 'Test' }, 'button')

    expect(state.currentGradient).toBe(gradient)
    const input = document.getElementById('ea-color') as HTMLInputElement
    // ea-color should hold a fallback hex, NOT the gradient string
    expect(input.value).not.toBe(gradient)
    expect(input.value).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  test('solid color — clears gradient state', () => {
    state.currentGradient = 'linear-gradient(135deg,#0f2027,#2c5364)'
    setAppearanceFromComp({ color: '#4f46e5', label: 'Test' }, 'button')

    expect(state.currentGradient).toBeNull()
    const input = document.getElementById('ea-color') as HTMLInputElement
    expect(input.value).toBe('#4f46e5')
  })

  test('image section shown for switch (was a bug)', () => {
    setAppearanceFromComp({}, 'switch')
    const section = document.getElementById('ea-image-section') as HTMLElement
    expect(section.style.display).not.toBe('none')
  })

  test('active color section shown only for switch', () => {
    setAppearanceFromComp({}, 'button')
    expect((document.getElementById('ea-active-section') as HTMLElement).style.display).toBe('none')

    setAppearanceFromComp({}, 'switch')
    expect((document.getElementById('ea-active-section') as HTMLElement).style.display).not.toBe('none')
  })

  test('icon section hidden for non-icon types', () => {
    setAppearanceFromComp({}, 'tile')
    expect((document.getElementById('ea-icon-section') as HTMLElement).style.display).toBe('none')
  })
})

describe('getAppearanceFields', () => {
  test('returns gradient from state, not ea-color', () => {
    state.currentGradient = 'linear-gradient(135deg,#f12711,#f5af19)'
    ;(document.getElementById('ea-color') as HTMLInputElement).value = '#1e293b'

    const fields = getAppearanceFields(null)
    expect(fields.color).toBe('linear-gradient(135deg,#f12711,#f5af19)')
  })

  test('returns ea-color when no gradient', () => {
    state.currentGradient = null
    ;(document.getElementById('ea-color') as HTMLInputElement).value = '#2563eb'

    const fields = getAppearanceFields(null)
    expect(fields.color).toBe('#2563eb')
  })

  test('returns label and icon from inputs', () => {
    ;(document.getElementById('ea-label') as HTMLInputElement).value = 'My Button'
    ;(document.getElementById('ea-icon') as HTMLInputElement).value  = '🔊'

    const fields = getAppearanceFields(null)
    expect(fields.label).toBe('My Button')
    expect(fields.icon).toBe('🔊')
  })
})
