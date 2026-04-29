import { connect } from './ws.js'
import { goBack }  from './components/folder.js'
import './swipe.js'  // registers touch event listeners as a side effect

document.getElementById('back-btn')?.addEventListener('pointerdown', () => { Haptic.tap(); goBack() })

try { navigator.wakeLock.request('screen') } catch {}

connect()
