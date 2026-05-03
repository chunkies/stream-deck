import { executeCommand } from './keyboard'
import { MESSAGE_TYPES } from './constants'
import type { Component, Page, Config } from '../shared/types'

export async function handleVoiceCommand(
  transcript: string,
  pageId: string,
  compId: string,
  voiceMode: string,
  config: Config | null,
  broadcast: (msg: Record<string, unknown>) => void,
  handlePress: (pageId: string, compId: string, hold: boolean) => void
): Promise<void> {
  if (!transcript || !config) return
  const mode = voiceMode || 'smart'
  console.log(`Voice [${mode}]: "${transcript}"`)

  if (mode === 'command') {
    // Only execute a pre-configured voiceCommand; the transcript must exactly
    // match one of the configured voice command strings (case-insensitive).
    const q = transcript.trim().toLowerCase()
    const allComps = config.pages.flatMap(pg => pg.components || [])
    const matched = allComps.find(c => c.voiceCommand && c.voiceCommand.toLowerCase() === q)
    if (matched?.voiceCommand) {
      executeCommand(matched.voiceCommand)
    } else {
      console.warn(`Voice command mode: no configured command matches transcript "${transcript}"`)
    }
    return
  }

  if (mode === 'template') {
    const page = config.pages.find(p => p.id === pageId)
    const comp = page?.components?.find(c => c.id === compId)
    const template = comp?.voiceCommand ?? ''
    if (template) {
      // Standard POSIX single-quote escaping: end the quote, insert escaped quote, reopen
      const escaped = transcript.replace(/'/g, "'\\''")
      executeCommand(template.replace(/{transcript}/g, escaped))
    }
    return
  }

  if (mode === 'smart') {
    const allComps = config.pages.flatMap(pg =>
      (pg.components || []).map(c => ({ comp: c, page: pg }))
    ).filter(e => e.comp.label)

    const q = transcript.toLowerCase()
    let best: { comp: Component; page: Page } | null = null
    let bestScore = 0
    for (const entry of allComps) {
      const label = (entry.comp.label ?? '').toLowerCase()
      const words = q.split(/\s+/)
      const hits  = words.filter(w => w.length > 2 && label.includes(w)).length
      const score = hits / words.length
      if (score > bestScore) { bestScore = score; best = entry }
    }

    if (best && bestScore >= 0.3) {
      handlePress(best.page.id, best.comp.id, false)
      broadcast({ type: MESSAGE_TYPES.VOICE_RESULT, matched: best.comp.label, transcript })
    } else {
      broadcast({ type: MESSAGE_TYPES.VOICE_RESULT, matched: null, transcript })
    }
  }
}
