const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getConfig:     ()         => ipcRenderer.invoke('get-config'),
  setConfig:     (cfg)      => ipcRenderer.invoke('set-config', cfg),
  getServerInfo: ()         => ipcRenderer.invoke('get-server-info'),
  getPlatform:   ()         => ipcRenderer.invoke('get-platform'),
  uploadMedia:   (filePath) => ipcRenderer.invoke('upload-media', filePath),
  onDeckEvent:   (cb)       => ipcRenderer.on('deck-event',   (_, e) => cb(e)),
  onServerReady: (cb)       => ipcRenderer.on('server-ready', (_, i) => cb(i))
})
