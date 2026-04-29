// Shared mutable state — all modules import and mutate properties on this object
export const state = {
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

// DOM refs — module scripts are deferred, so DOM is ready by the time this runs
export const dom = {
  grid:      document.getElementById('grid'),
  pageDots:  document.getElementById('page-dots'),
  pageNameEl:document.getElementById('page-name'),
  wsStatusEl:document.getElementById('ws-status'),
  wsDotEl:   document.getElementById('ws-dot'),
  offlineEl: document.getElementById('offline-overlay'),
}
