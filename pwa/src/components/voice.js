import { applyBg } from '../applyBg.js'
import { send }    from '../ws.js'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

export function createVoiceButton(comp, page) {
  const btn = document.createElement('div')
  btn.className = 'btn voice-btn'
  applyBg(btn, comp.color, comp.image)

  if (!SpeechRecognition) {
    btn.innerHTML = `<div class="btn-icon">${comp.icon || '🎤'}</div><div class="btn-label">${comp.label || 'Voice'}</div><div class="voice-unsupported">Not supported</div>`
    btn.style.opacity = '0.5'
    return btn
  }

  btn.innerHTML = `
    <div class="btn-icon">${comp.icon || '🎤'}</div>
    <div class="btn-label voice-label">${comp.label || 'Voice'}</div>
    <div class="voice-ring"></div>
  `

  const rec = new SpeechRecognition()
  rec.continuous     = false
  rec.interimResults = false
  rec.lang           = comp.voiceLang || 'en-US'

  let listening = false

  rec.onresult = (e) => {
    const transcript = e.results[0][0].transcript.trim()
    stopListening()
    const labelEl = btn.querySelector('.voice-label')
    if (labelEl) { labelEl.textContent = `"${transcript}"`; setTimeout(() => { labelEl.textContent = comp.label || 'Voice' }, 3000) }
    send({ type: 'voiceCommand', transcript, pageId: page.id, compId: comp.id, voiceMode: comp.voiceMode || 'smart' })
  }

  rec.onerror = (e) => {
    stopListening()
    if (e.error === 'not-allowed') {
      const labelEl = btn.querySelector('.voice-label')
      if (labelEl) { labelEl.textContent = 'Mic blocked'; setTimeout(() => { labelEl.textContent = comp.label || 'Voice' }, 3000) }
    }
  }

  rec.onend = () => stopListening()

  function startListening() {
    try { rec.start(); listening = true; btn.classList.add('listening'); Haptic.listening() } catch {}
  }

  function stopListening() {
    listening = false
    btn.classList.remove('listening')
    try { rec.stop() } catch {}
  }

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    if (listening) { stopListening() } else { startListening() }
  })

  return btn
}

export function showVoiceResult(matched, transcript) {
  document.querySelectorAll('.voice-btn .voice-label').forEach(el => {
    const original = el.closest('.btn')?.querySelector('.btn-label')?.textContent || 'Voice'
    el.textContent = matched ? `→ ${matched}` : 'No match'
    setTimeout(() => { el.textContent = original }, 3000)
  })
}
