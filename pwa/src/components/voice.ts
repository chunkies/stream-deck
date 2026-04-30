import { applyBg } from '../applyBg.js'
import { send }    from '../ws.js'
import type { Component, Page } from '../../../electron/shared/types.js'

const SpeechRecognitionCtor: typeof SpeechRecognition | undefined =
  window.SpeechRecognition ?? window.webkitSpeechRecognition

export function createVoiceButton(comp: Component, page: Page): HTMLElement {
  const btn = document.createElement('div')
  btn.className = 'btn voice-btn'
  applyBg(btn, comp.color, comp.image)

  if (!SpeechRecognitionCtor) {
    btn.innerHTML = '<div class="btn-icon"></div><div class="btn-label"></div><div class="voice-unsupported">Not supported</div>'
    btn.querySelector('.btn-icon')!.textContent  = comp.icon ?? '🎤'
    btn.querySelector('.btn-label')!.textContent = comp.label ?? 'Voice'
    btn.style.opacity = '0.5'
    return btn
  }

  btn.innerHTML = '<div class="btn-icon"></div><div class="btn-label voice-label"></div><div class="voice-ring"></div>'
  btn.querySelector('.btn-icon')!.textContent  = comp.icon ?? '🎤'
  btn.querySelector('.btn-label')!.textContent = comp.label ?? 'Voice'

  const rec = new SpeechRecognitionCtor()
  rec.continuous     = false
  rec.interimResults = false
  rec.lang           = comp.voiceLang ?? 'en-US'

  let listening = false

  rec.onresult = (e: SpeechRecognitionEvent) => {
    const transcript = e.results[0][0].transcript.trim()
    stopListening()
    const labelEl = btn.querySelector('.voice-label')
    if (labelEl) {
      labelEl.textContent = `"${transcript}"`
      setTimeout(() => { labelEl.textContent = comp.label ?? 'Voice' }, 3000)
    }
    send({ type: 'voiceCommand', transcript, pageId: page.id, compId: comp.id, voiceMode: comp.voiceMode ?? 'smart' })
  }

  rec.onerror = (e: SpeechRecognitionErrorEvent) => {
    stopListening()
    if (e.error === 'not-allowed') {
      const labelEl = btn.querySelector('.voice-label')
      if (labelEl) {
        labelEl.textContent = 'Mic blocked'
        setTimeout(() => { labelEl.textContent = comp.label ?? 'Voice' }, 3000)
      }
    }
  }

  rec.onend = () => stopListening()

  function startListening(): void {
    try { rec.start(); listening = true; btn.classList.add('listening'); Haptic.listening() } catch { /* already started */ }
  }

  function stopListening(): void {
    listening = false
    btn.classList.remove('listening')
    try { rec.stop() } catch { /* already stopped */ }
  }

  btn.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault()
    if (listening) { stopListening() } else { startListening() }
  })

  return btn
}

export function showVoiceResult(_matched: string | undefined, _transcript: string): void {
  document.querySelectorAll('.voice-btn .voice-label').forEach(el => {
    const original = el.closest('.btn')?.querySelector('.btn-label')?.textContent ?? 'Voice'
    el.textContent = _matched ? `→ ${_matched}` : 'No match'
    setTimeout(() => { el.textContent = original }, 3000)
  })
}
