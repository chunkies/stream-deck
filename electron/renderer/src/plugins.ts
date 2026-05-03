import { state } from './state'
import { COMP_TYPE_LABELS } from './constants'
import type { PluginMeta, PluginAction, PluginParam } from '../../shared/types'

type ParamInputEl = HTMLInputElement | HTMLTextAreaElement

function el(id: string): HTMLElement { return document.getElementById(id) as HTMLElement }
function sel(id: string): HTMLSelectElement { return document.getElementById(id) as HTMLSelectElement }

export async function loadAndPopulatePlugins(): Promise<void> {
  const plugins = await window.api.getPlugins()
  populatePluginSelect(plugins)
}

export function populatePluginSelect(plugins: PluginMeta[]): void {
  state.loadedPlugins = plugins ?? []
  const selectEl = sel('f-plugin-action')
  selectEl.innerHTML = ''
  if (!state.loadedPlugins.length) {
    selectEl.innerHTML = '<option value="">— no plugins installed —</option>'
    renderPluginParams('', {})
    import('./components').then(m => m.renderComponentPanel()).catch(console.error)
    return
  }
  for (const plugin of state.loadedPlugins) {
    const og = document.createElement('optgroup')
    og.label = plugin.name
    for (const action of plugin.actions) {
      const ct  = action.componentType
      const tag = ct && COMP_TYPE_LABELS[ct] ? ` [${COMP_TYPE_LABELS[ct]}]` : ''
      const opt = document.createElement('option')
      opt.value       = action.key
      opt.textContent = action.label + tag
      og.appendChild(opt)
    }
    selectEl.appendChild(og)
  }
  renderPluginParams(selectEl.value, {})
  import('./components').then(m => m.renderComponentPanel()).catch(console.error)
}

export function getPluginActionByKey(key: string): PluginAction | null {
  return state.loadedPlugins.flatMap(p => p.actions ?? []).find(a => a.key === key) ?? null
}

function makeParamInput(param: PluginParam, idPrefix: string, existing: Record<string, unknown>, pfx?: string): ParamInputEl {
  let input: ParamInputEl
  if (param.type === 'textarea') {
    const ta = document.createElement('textarea')
    ta.rows = 3
    input = ta
  } else {
    const i = document.createElement('input')
    i.type = param.type === 'number' ? 'number' : 'text'
    input = i
  }
  input.id        = `${idPrefix}${param.key}`
  input.className = 'plugin-param-input'
  input.dataset['key'] = param.key
  input.dataset['typ'] = param.type ?? 'text'
  if (pfx) input.dataset['pfx'] = pfx
  const existingVal = existing[param.key]
  input.value = existingVal !== undefined ? String(existingVal) : String(param.default ?? '')
  if (param.placeholder) input.placeholder = param.placeholder
  return input
}

export function renderPluginParams(actionKey: string, existingParams: Record<string, unknown>): void {
  const container = document.getElementById('plugin-params')
  if (!container) return
  container.innerHTML = ''

  const action = state.loadedPlugins.flatMap(p => p.actions ?? []).find(a => a.key === actionKey)
  if (!action?.params?.length) return

  for (const param of action.params) {
    const row   = document.createElement('div')
    row.className = 'field-row'
    const label = document.createElement('label')
    label.textContent = param.label
    const input = makeParamInput(param, 'pp-', existingParams)
    row.appendChild(label)
    row.appendChild(input)
    container.appendChild(row)
  }
}

export function collectPluginParams(): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  document.querySelectorAll<HTMLInputElement & { dataset: DOMStringMap }>('.plugin-param-input').forEach(inputEl => {
    const key = inputEl.dataset['key'] ?? ''
    params[key] = inputEl.dataset['typ'] === 'number'
      ? (parseFloat(inputEl.value) || 0)
      : inputEl.value
  })
  return params
}

export function renderCompPluginParams(containerIdPrefix: string, actionKey: string, existingParams: Record<string, unknown>): void {
  const container = document.getElementById(`${containerIdPrefix}-plugin-params`)
  if (!container) return
  container.innerHTML = ''
  const action = getPluginActionByKey(actionKey)
  if (!action?.params?.length) return
  for (const param of action.params) {
    const row   = document.createElement('div')
    row.className = 'field-row'
    const label = document.createElement('label')
    label.textContent = param.label
    const input = makeParamInput(param, `${containerIdPrefix}pp-`, existingParams, containerIdPrefix)
    row.appendChild(label)
    row.appendChild(input)
    container.appendChild(row)
  }
}

export function collectCompPluginParams(containerIdPrefix: string): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  document.querySelectorAll<HTMLInputElement>(`[data-pfx="${containerIdPrefix}"].plugin-param-input`).forEach(inputEl => {
    const key = inputEl.dataset['key'] ?? ''
    params[key] = inputEl.dataset['typ'] === 'number' ? (parseFloat(inputEl.value) || 0) : inputEl.value
  })
  return params
}

export function wirePluginReload(): void {
  el('plugin-reload-btn').addEventListener('click', async () => {
    const plugins = await window.api.reloadPlugins()
    populatePluginSelect(plugins)
  })

  sel('f-plugin-action').addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value
    renderPluginParams(value, {})
    const action = getPluginActionByKey(value)
    const hint   = el('plugin-comp-hint')
    if (action?.componentType && action.componentType !== 'button') {
      const label = ({ switch: 'Switch', slider: 'Slider', knob: 'Knob' } as Record<string, string>)[action.componentType] ?? action.componentType
      hint.textContent = `💡 This action is designed for: ${label} — consider switching the type tab.`
      hint.style.display = ''
    } else {
      hint.style.display = 'none'
    }
  })

}
