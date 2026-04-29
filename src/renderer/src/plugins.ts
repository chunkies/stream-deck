// @ts-nocheck
import { state } from './state'
import { COMP_TYPE_LABELS } from './constants'

export async function loadAndPopulatePlugins() {
  const plugins = await window.api.getPlugins()
  populatePluginSelect(plugins)
}

export function populatePluginSelect(plugins) {
  state.loadedPlugins = plugins || []
  const sel = document.getElementById('f-plugin-action')
  sel.innerHTML = ''
  if (!state.loadedPlugins.length) {
    sel.innerHTML = '<option value="">— no plugins installed —</option>'
    renderPluginParams('', {})
    // Import lazily to avoid circular dep at module init time
    import('./components').then(m => m.renderComponentPanel())
    return
  }
  for (const plugin of state.loadedPlugins) {
    const og = document.createElement('optgroup')
    og.label = plugin.name
    for (const action of plugin.actions) {
      const ct   = action.componentType
      const tag  = ct && COMP_TYPE_LABELS[ct] ? ` [${COMP_TYPE_LABELS[ct]}]` : ''
      const opt  = document.createElement('option')
      opt.value = action.key
      opt.textContent = action.label + tag
      og.appendChild(opt)
    }
    sel.appendChild(og)
  }
  renderPluginParams(sel.value, {})
  import('./components').then(m => m.renderComponentPanel())
}

export function getPluginActionByKey(key) {
  return state.loadedPlugins.flatMap(p => p.actions || []).find(a => a.key === key) || null
}

export function renderPluginParams(actionKey, existingParams) {
  const container = document.getElementById('plugin-params')
  if (!container) return
  container.innerHTML = ''

  const action = state.loadedPlugins.flatMap(p => p.actions || []).find(a => a.key === actionKey)
  if (!action?.params?.length) return

  for (const param of action.params) {
    const row = document.createElement('div')
    row.className = 'field-row'

    const label = document.createElement('label')
    label.textContent = param.label

    let input
    if (param.type === 'textarea') {
      input = document.createElement('textarea')
      input.rows = 3
    } else {
      input = document.createElement('input')
      input.type = param.type === 'number' ? 'number' : 'text'
    }
    input.id          = `pp-${param.key}`
    input.className   = 'plugin-param-input'
    input.dataset.key = param.key
    input.dataset.typ = param.type || 'text'
    const existing = existingParams?.[param.key]
    input.value = existing !== undefined ? existing : (param.default ?? '')
    if (param.placeholder) input.placeholder = param.placeholder

    row.appendChild(label)
    row.appendChild(input)
    container.appendChild(row)
  }
}

export function collectPluginParams() {
  const params = {}
  document.querySelectorAll('.plugin-param-input').forEach(el => {
    params[el.dataset.key] = el.dataset.typ === 'number'
      ? (parseFloat(el.value) || 0)
      : el.value
  })
  return params
}

export function renderCompPluginParams(containerIdPrefix, actionKey, existingParams) {
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
    const input = document.createElement('input')
    input.type        = param.type === 'number' ? 'number' : 'text'
    input.id          = `${containerIdPrefix}pp-${param.key}`
    input.className   = 'plugin-param-input'
    input.dataset.key = param.key
    input.dataset.typ = param.type || 'text'
    input.dataset.pfx = containerIdPrefix
    input.value       = existingParams?.[param.key] ?? (param.default ?? '')
    if (param.placeholder) input.placeholder = param.placeholder
    row.appendChild(label)
    row.appendChild(input)
    container.appendChild(row)
  }
}

export function collectCompPluginParams(containerIdPrefix) {
  const params = {}
  document.querySelectorAll(`.plugin-param-input[data-pfx="${containerIdPrefix}"]`).forEach(el => {
    params[el.dataset.key] = el.dataset.typ === 'number' ? (parseFloat(el.value) || 0) : el.value
  })
  return params
}

export function wirePluginReload() {
  document.getElementById('plugin-reload-btn').addEventListener('click', async () => {
    const plugins = await window.api.reloadPlugins()
    populatePluginSelect(plugins)
  })

  document.getElementById('f-plugin-action').addEventListener('change', (e) => {
    renderPluginParams(e.target.value, {})
    const action = getPluginActionByKey(e.target.value)
    const hint   = document.getElementById('plugin-comp-hint')
    if (action?.componentType && action.componentType !== 'button') {
      const label = { switch: 'Switch', slider: 'Slider', knob: 'Knob' }[action.componentType] || action.componentType
      hint.textContent = `💡 This action is designed for: ${label} — consider switching the type tab.`
      hint.style.display = ''
    } else {
      hint.style.display = 'none'
    }
  })
}
