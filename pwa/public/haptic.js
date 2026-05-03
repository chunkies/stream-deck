'use strict'

const Haptic = (() => {
  const supported = typeof navigator !== 'undefined' && 'vibrate' in navigator

  if (!supported) {
    console.info('[Haptic] Vibration API not available (iOS does not support it — visual feedback only)')
  }

  // iOS fallback: silent WebAudio pulse — unreliable but occasionally triggers
  // a faint taptic response on older iOS versions
  let audioCtx = null
  function iosPulse() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const buf = audioCtx.createBuffer(1, 1, 22050)
      const src = audioCtx.createBufferSource()
      src.buffer = buf
      src.connect(audioCtx.destination)
      src.start(0)
    } catch {}
  }

  function vibe(pattern) {
    if (supported) {
      navigator.vibrate(pattern)
    } else {
      iosPulse()
    }
  }

  return {
    supported,
    tap()      { vibe(50) },
    hold()     { vibe([70, 60, 70]) },
    ratchet()  { vibe(25) },
    success()  { vibe([40, 60, 80]) },
    error()    { vibe([100, 60, 100]) },
    listening(){ vibe([50, 40, 50]) },
    double()   { vibe([50, 80, 50]) },
  }
})()
