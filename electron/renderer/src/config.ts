import { state } from './state'

export function pushConfig(): void {
  window.api.setConfig(state.config!)
}
