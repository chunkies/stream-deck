import type { Config, ServerInfo, Component, PluginMeta, Page } from '../../shared/types'

export interface EditingComp {
  pageIdx: number
  compId:  string | null
  col:     number
  row:     number
}

export interface FolderStackEntry {
  folderComp: Component
  pageIdx:    number
}

export interface PendingImages {
  image?:       string | null
  activeImage?: string | null
}

export interface RendererState {
  config:           Config | null
  serverInfo:       ServerInfo | null
  currentPageIdx:   number
  editingComp:      EditingComp | null
  currentCompType:  string
  pendingImages:    PendingImages
  adminFolderStack: FolderStackEntry[]
  loadedPlugins:    PluginMeta[]
  renamingPageIdx:  number | null
  currentGradient:  string | null
  currentEmojiCat:  string
  cpCollapsed:      Set<string>
}

export const state: RendererState = {
  config:           null,
  serverInfo:       null,
  currentPageIdx:   0,
  editingComp:      null,
  currentCompType:  'button',
  pendingImages:    {},
  adminFolderStack: [],
  loadedPlugins:    [],
  renamingPageIdx:  null,
  currentGradient:  null,
  currentEmojiCat:  'smileys',
  cpCollapsed:      new Set(),
}

export function adminPages(): Page[] {
  return state.adminFolderStack.length
    ? state.adminFolderStack[state.adminFolderStack.length - 1].folderComp.pages!
    : state.config!.pages
}

export function adminIdx(): number {
  return state.adminFolderStack.length
    ? state.adminFolderStack[state.adminFolderStack.length - 1].pageIdx
    : state.currentPageIdx
}

export function setAdminIdx(i: number): void {
  if (state.adminFolderStack.length) state.adminFolderStack[state.adminFolderStack.length - 1].pageIdx = i
  else state.currentPageIdx = i
}
