import { contextBridge, ipcRenderer } from 'electron'
import type { MarketplaceAPI } from '../shared/types'

const mp: MarketplaceAPI = {
  fetchRegistry:  (force)      => ipcRenderer.invoke('mp:fetch-registry', force),
  getInstalled:   ()           => ipcRenderer.invoke('mp:get-installed'),
  install:        (id, url)    => ipcRenderer.invoke('mp:install', id, url),
  uninstall:      (id)         => ipcRenderer.invoke('mp:uninstall', id),
  checkUpdates:   ()           => ipcRenderer.invoke('mp:check-updates'),
  loadLocal:      ()           => ipcRenderer.invoke('mp:load-local'),
  reloadPlugins:  ()           => ipcRenderer.invoke('mp:reload'),
  openExternal:   (url)        => ipcRenderer.invoke('mp:open-external', url),
  openPluginsDir: ()           => ipcRenderer.invoke('mp:open-plugins-dir'),
  onProgress:     (cb)         => ipcRenderer.on('mp:progress', (_, d) => cb(d)),
}

contextBridge.exposeInMainWorld('mp', mp)
