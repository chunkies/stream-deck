// @ts-nocheck
// Single shared mutable state object — any module can read/write via import { state }

export const state = {
  config:          null,   // server config (pages, grid, etc.)
  serverInfo:      null,   // { ip, host, port, mode, url, qr }
  currentPageIdx:  0,
  editingComp:     null,   // { pageIdx, compId, col, row } — set while modal is open
  currentCompType: 'button',
  pendingImages:   {},     // { image?, activeImage? } — file uploads awaiting save
  adminFolderStack: [],    // [{folderComp, pageIdx}] — folder navigation breadcrumb
  loadedPlugins:   [],
  renamingPageIdx: null,
  currentGradient: null,   // active gradient string or null
  currentEmojiCat: 'smileys',
  cpCollapsed:     new Set(),
}

// Admin navigation helpers — aware of folder stack
export function adminPages() {
  return state.adminFolderStack.length
    ? state.adminFolderStack[state.adminFolderStack.length - 1].folderComp.pages
    : state.config.pages
}

export function adminIdx() {
  return state.adminFolderStack.length
    ? state.adminFolderStack[state.adminFolderStack.length - 1].pageIdx
    : state.currentPageIdx
}

export function setAdminIdx(i) {
  if (state.adminFolderStack.length) state.adminFolderStack[state.adminFolderStack.length - 1].pageIdx = i
  else state.currentPageIdx = i
}
