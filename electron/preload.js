const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getConfig:     ()             => ipcRenderer.invoke('get-config'),
  setConfig:     (cfg)          => ipcRenderer.invoke('set-config', cfg),
  getServerInfo: ()             => ipcRenderer.invoke('get-server-info'),
  getPlatform:   ()             => ipcRenderer.invoke('get-platform'),
  uploadMedia:   (filePath)     => ipcRenderer.invoke('upload-media', filePath),
  getAutostart:  ()             => ipcRenderer.invoke('get-autostart'),
  setAutostart:  (val)          => ipcRenderer.invoke('set-autostart', val),
  connectOBS:    (opts)         => ipcRenderer.invoke('connect-obs', opts),
  getOBSStatus:  ()             => ipcRenderer.invoke('get-obs-status'),
  getPlugins:      ()             => ipcRenderer.invoke('get-plugins'),
  reloadPlugins:   ()             => ipcRenderer.invoke('reload-plugins'),
  openMarketplace: ()             => ipcRenderer.invoke('open-marketplace'),
  onDeckEvent:   (cb)           => ipcRenderer.on('deck-event',   (_, e) => cb(e)),
  onServerReady: (cb)           => ipcRenderer.on('server-ready', (_, i) => cb(i))
})
