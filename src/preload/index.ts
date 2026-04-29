// @ts-nocheck
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getConfig:     ()             => ipcRenderer.invoke('get-config'),
  setConfig:     (cfg)          => ipcRenderer.invoke('set-config', cfg),
  getServerInfo: ()             => ipcRenderer.invoke('get-server-info'),
  getPlatform:   ()             => ipcRenderer.invoke('get-platform'),
  uploadMedia:   (filePath)     => ipcRenderer.invoke('upload-media', filePath),
  getAutostart:  ()             => ipcRenderer.invoke('get-autostart'),
  setAutostart:  (val)          => ipcRenderer.invoke('set-autostart', val),
  getPlugins:      ()             => ipcRenderer.invoke('get-plugins'),
  reloadPlugins:   ()             => ipcRenderer.invoke('reload-plugins'),
  openMarketplace:    ()        => ipcRenderer.invoke('open-marketplace'),
  exportConfig:       ()        => ipcRenderer.invoke('export-config'),
  importConfig:       ()        => ipcRenderer.invoke('import-config'),
  onDeckEvent:   (cb)           => ipcRenderer.on('deck-event',   (_, e) => cb(e)),
  onServerReady: (cb)           => ipcRenderer.on('server-ready', (_, i) => cb(i))
})
