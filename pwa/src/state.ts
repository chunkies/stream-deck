import type { Config, Page } from '../../electron/shared/types.js'

export interface NavStackEntry {
  pages:   Page[]
  pageIdx: number
}

export interface PwaState {
  ws:             WebSocket | null
  config:         Config | null
  currentPageIdx: number
  toggleStates:   Record<string, boolean>
  reconnectTimer: ReturnType<typeof setTimeout> | null
  currentPages:   Page[] | null
  navStack:       NavStackEntry[]
  swipeStartX:    number
  swipeStartY:    number
  swipeStartTime: number
  swipeTracking:  boolean
  swipeActive:    boolean
}

export const state: PwaState = {
  ws:             null,
  config:         null,
  currentPageIdx: 0,
  toggleStates:   {},
  reconnectTimer: null,
  currentPages:   null,
  navStack:       [],
  swipeStartX:    0,
  swipeStartY:    0,
  swipeStartTime: 0,
  swipeTracking:  false,
  swipeActive:    false,
}

export interface DomRefs {
  grid:          HTMLElement
  pageDots:      HTMLElement
  pageNameEl:    HTMLElement
  wsStatusEl:    HTMLElement
  wsDotEl:       HTMLElement
  offlineEl:     HTMLElement
  offlineTitleEl: HTMLElement
  retryBtnEl:    HTMLElement
}

export const dom: DomRefs = {
  grid:          document.getElementById('grid')!,
  pageDots:      document.getElementById('page-dots')!,
  pageNameEl:    document.getElementById('page-name')!,
  wsStatusEl:    document.getElementById('ws-status')!,
  wsDotEl:       document.getElementById('ws-dot')!,
  offlineEl:     document.getElementById('offline-overlay')!,
  offlineTitleEl: document.getElementById('offline-title')!,
  retryBtnEl:    document.getElementById('retry-btn')!,
}
