'use strict'

const Haptic = (() => {
  const supported = typeof navigator !== 'undefined' && 'vibrate' in navigator

  if (!supported) {
    console.info('[Haptic] Vibration API not available (iOS Safari does not support it)')
  }

  return {
    supported,
    tap()      { supported && navigator.vibrate(50) },
    hold()     { supported && navigator.vibrate([70, 60, 70]) },
    ratchet()  { supported && navigator.vibrate(25) },
    success()  { supported && navigator.vibrate([40, 60, 80]) },
    error()    { supported && navigator.vibrate([100, 60, 100]) },
    listening(){ supported && navigator.vibrate([50, 40, 50]) },
    double()   { supported && navigator.vibrate([50, 80, 50]) },
  }
})()
