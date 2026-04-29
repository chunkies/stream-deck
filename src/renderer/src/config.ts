// @ts-nocheck
import { state } from './state'

export function pushConfig() {
  window.api.setConfig(state.config)
}
