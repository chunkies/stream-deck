import type { ElectronAPI, MarketplaceAPI } from '../../shared/types'

declare global {
  interface Window {
    api: ElectronAPI
    mp:  MarketplaceAPI
  }
}
