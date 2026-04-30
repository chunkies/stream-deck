import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../shared/types'

const api: ElectronAPI = {
  getConfig:       ()            => ipcRenderer.invoke('get-config'),
  setConfig:       (cfg)         => ipcRenderer.invoke('set-config', cfg),
  getServerInfo:   ()            => ipcRenderer.invoke('get-server-info'),
  getPlatform:     ()            => ipcRenderer.invoke('get-platform'),
  uploadMedia:     (filePath)    => ipcRenderer.invoke('upload-media', filePath),
  getAutostart:    ()            => ipcRenderer.invoke('get-autostart'),
  setAutostart:    (val)         => ipcRenderer.invoke('set-autostart', val),
  getPlugins:      ()            => ipcRenderer.invoke('get-plugins'),
  reloadPlugins:   ()            => ipcRenderer.invoke('reload-plugins'),
  openMarketplace: ()            => ipcRenderer.invoke('open-marketplace'),
  exportConfig:    ()            => ipcRenderer.invoke('export-config'),
  importConfig:    ()            => ipcRenderer.invoke('import-config'),
  checkAppUpdate:        ()          => ipcRenderer.invoke('check-app-update'),
  installAppUpdate:      ()          => ipcRenderer.send('install-app-update'),
  getWebhookInfo:        ()          => ipcRenderer.invoke('get-webhook-info'),
  setWebhookEnabled:     (enabled)   => ipcRenderer.invoke('set-webhook-enabled', enabled),
  validateLicense:       (key)       => ipcRenderer.invoke('validate-license', key),
  getLicenseStatus:      ()          => ipcRenderer.invoke('get-license-status'),
  onDeckEvent:           (cb)  => ipcRenderer.on('deck-event',            (_, e) => cb(e)),
  onServerReady:         (cb)  => ipcRenderer.on('server-ready',          (_, i) => cb(i)),
  onAppUpdateAvailable:  (cb)  => ipcRenderer.on('app-update-available',  (_, i) => cb(i)),
  onAppUpdateDownloaded: (cb)  => ipcRenderer.on('app-update-downloaded', (_, i) => cb(i)),
}

contextBridge.exposeInMainWorld('api', api)
