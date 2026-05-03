// Single source of truth for all domain types shared across server, renderer, and PWA.
// No Node or DOM imports — pure data interfaces only.

// ── Actions ────────────────────────────────────────────────────────────────────

export type ActionType =
  | 'builtin'
  | 'command'
  | 'hotkey'
  | 'toggle'
  | 'sequence'
  | 'page'
  | 'plugin'
  | 'volume'
  | 'scroll'
  | 'webhook'
  | 'conditional'

export type Action =
  | { type: 'builtin';     key: string }
  | { type: 'command';     command: string }
  | { type: 'hotkey';      combo: string }
  | { type: 'toggle';      on: string; off: string }
  | { type: 'sequence';    commands: string[]; delay?: number }
  | { type: 'page';        pageId: string }
  | { type: 'plugin';      pluginKey: string; params?: Record<string, unknown> }
  | { type: 'volume' }
  | { type: 'scroll';      direction?: string; speed?: number }
  | { type: 'webhook';     url: string; method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: string; headers?: Record<string, string> }
  | { type: 'conditional'; condition: 'toggle' | 'tile'; key: string; value?: string; then: Action; else?: Action }

// ── Components ─────────────────────────────────────────────────────────────────

export type ComponentType =
  | 'button'
  | 'switch'
  | 'toggle'
  | 'slider'
  | 'knob'
  | 'tile'
  | 'voice'
  | 'folder'
  | 'counter'
  | 'clock'
  | 'stopwatch'
  | 'countdown'
  | 'trackpad'
  | 'spotify'

export interface Component {
  id:             string
  col:            number
  row:            number
  colSpan:        number
  rowSpan:        number
  componentType:  ComponentType
  label?:         string
  icon?:          string
  color?:         string
  image?:         string | null
  // button / voice / spotify
  action?:        Action
  holdAction?:    Action | null
  // switch
  activeColor?:   string
  activeDefault?: boolean
  // slider / knob
  orientation?:   'vertical' | 'horizontal'
  min?:           number
  max?:           number
  step?:          number
  defaultValue?:  number
  infiniteScroll?: boolean
  // tile
  pollCommand?:   string
  pollInterval?:  number
  tileFormat?:    string
  tileTapCmd?:    string
  // voice
  voiceCommand?:  string
  voiceMode?:     string
  voiceLang?:     string
  // tile — plugin event subscription (when set, tile auto-updates from sdk.broadcast())
  pluginTileId?:    string
  pluginTileEvent?: string
  pluginTileField?: string
  pluginDisplayKey?: string  // key for sdk.widget.set() targeting — plugin pushes display updates to this key
  // folder
  pages?:         Page[]
  // counter
  counterMin?:      number
  counterMax?:      number | null
  counterStep?:     number
  // clock
  clockFormat?:     string
  clockShowDate?:   boolean
  clockDateFormat?: string
  clockTimezone?:   string
  // stopwatch
  stopwatchShowMs?: boolean
  // countdown
  duration?:        number
  onComplete?:      Action | null
  // trackpad
  trackpadSensitivity?: number    // default 1.0
  trackpadNaturalScroll?: boolean // default false
  trackpadActions?: Partial<Record<GestureType, Action>>
}

// ── Pages & Config ─────────────────────────────────────────────────────────────

export interface Page {
  id:          string
  name:        string
  components:  Component[]
  cols?:       number
  rows?:       number
  slots?:      unknown[]
  autoProfile?: { windowClass?: string; windowTitle?: string }
}

export interface CronTrigger {
  id:      string
  label?:  string
  cron:    string   // e.g. "*/5 * * * *"
  pageId:  string
  compId:  string
  enabled: boolean
}

export interface Config {
  grid:      { cols: number; rows: number }
  pages:     Page[]
  webhook?:  { enabled: boolean; secret: string }
  customCSS?: string
  crons?:    CronTrigger[]
}

// ── Server info ────────────────────────────────────────────────────────────────

export interface ServerInfo {
  ip:   string
  host: string
  port: number
  mode: string
  // Added by buildServerPayload in main process before sending to renderer
  url?: string
  qr?:  string
}

// ── Plugins ────────────────────────────────────────────────────────────────────

export interface PluginWidget {
  key:             string   // maps to pluginTileEvent
  label:           string
  description?:    string
  icon?:           string
  field?:          string   // pluginTileField — defaults to 'value'
  defaultColSpan?: number
  defaultRowSpan?: number
}

export interface PluginParam {
  key:          string
  label:        string
  type?:        'text' | 'number' | 'textarea'
  default?:     string | number
  placeholder?: string
}

export interface PluginAction {
  key:            string
  label:          string
  componentType?: string
  params?:        PluginParam[]
}

export type PluginStatus = 'loading' | 'running' | 'restarting' | 'failed'

export interface PluginMeta {
  id:          string
  name:        string
  version:     string
  description: string
  author:      string
  icon:        string
  _local:      boolean
  actions:     PluginAction[]
  widgets?:    PluginWidget[]
  _status?:    PluginStatus
  _error?:     string
}

export interface PluginManifest {
  id:               string
  name?:            string
  version?:         string
  description?:     string
  author?:          string
  icon?:            string
  _local?:          boolean
  _dir?:            string
  // set client-side after update check
  _updateAvailable?: boolean
  _updateUrl?:       string
  actions?:          PluginAction[]
  minAppVersion?:    string
  [key: string]:     unknown
}

// ── Plugin logs ────────────────────────────────────────────────────────────────

export interface PluginLogEntry {
  pluginId: string
  level:    'info' | 'warn' | 'error'
  args:     unknown[]
  ts:       number
  stack?:   string
}

// ── Marketplace ────────────────────────────────────────────────────────────────

export interface RegistryPlugin {
  id:             string
  name:           string
  version:        string
  description?:   string
  author?:        string
  icon?:          string
  tags?:          string[]
  homepage?:      string
  price?:         number
  purchaseUrl?:   string
  downloadUrl?:   string
  minAppVersion?: string
}

export interface PluginRegistry {
  plugins?: RegistryPlugin[]
}

export interface UpdateInfo {
  id:               string
  name?:            string
  installedVersion?: string
  newVersion:       string
  downloadUrl:      string
}

// ── WebSocket protocol ─────────────────────────────────────────────────────────

export type GestureType =
  | 'swipeLeft' | 'swipeRight' | 'swipeUp' | 'swipeDown'
  | 'pinchIn' | 'pinchOut'
  | 'tap' | 'doubleTap' | 'longPress'
  | 'twoFingerTap'
  | 'rotateClockwise' | 'rotateCounterClockwise'

// Server → PWA
export type ServerMessage =
  | { type: 'config';        config: Config }
  | { type: 'toggleState';   key: string; active: boolean }
  | { type: 'tileUpdate';    key: string; text: string }
  | { type: 'voiceResult';   matched?: string; transcript: string }
  | { type: 'pluginEvent';   pluginId: string; event: string; [key: string]: unknown }
  | { type: 'navigate';      pageId: string }
  | { type: 'connection';    connected: boolean; clients: number }
  | { type: 'pluginsReloaded' }
  | { type: 'widgetUpdate'; key: string; label?: string; color?: string; icon?: string; image?: string | null; badge?: string }
  | { type: 'widgetFlash';  key: string; color: string; ms: number }
  | { type: 'tileFlash';    key: string; color: string; ms: number }

// PWA → Server
export type ClientMessage =
  | { type: 'press';        pageId: string; compId: string; hold: boolean; doubletap?: boolean }
  | { type: 'slide';        pageId: string; compId: string; value: number }
  | { type: 'voiceCommand'; transcript: string; pageId: string; compId: string; voiceMode?: string }
  | { type: 'trackpad';     event: 'move';   dx: number; dy: number; pageId?: string; compId?: string }
  | { type: 'trackpad';     event: 'click';  button: 1 | 2 | 3;      pageId?: string; compId?: string }
  | { type: 'trackpad';     event: 'scroll'; dy: number;              pageId?: string; compId?: string }
  | { type: 'gesture';      name: GestureType; pageId: string; compId: string }

// ── Electron IPC bridge ────────────────────────────────────────────────────────

export type DeckEvent =
  | { type: 'connection';   connected: boolean; clients: number }
  | { type: 'press';        pageId: string; compId: string }
  | { type: 'slide';        pageId: string; compId: string; value: number }
  | { type: 'pluginNotify'; pluginId: string; title: string; body: string }

export interface AppUpdateInfo {
  version:      string
  releaseDate:  string
  releaseName?: string
  releaseNotes?: string
}

export interface ElectronAPI {
  getAppVersion:         () => Promise<string>
  getConfig:             () => Promise<Config>
  setConfig:             (cfg: Config) => Promise<void>
  getServerInfo:         () => Promise<ServerInfo | null>
  getPlatform:           () => Promise<string>
  uploadMedia:           (filePath: string) => Promise<string>
  getAutostart:          () => Promise<boolean>
  setAutostart:          (val: boolean) => Promise<void>
  getPlugins:            () => Promise<PluginMeta[]>
  reloadPlugins:         () => Promise<PluginMeta[]>
  openMarketplace:       () => Promise<void>
  exportConfig:          () => Promise<{ ok: boolean }>
  importConfig:          () => Promise<{ ok: boolean; config?: Config; error?: string }>
  checkAppUpdate:        () => Promise<AppUpdateInfo | null>
  installAppUpdate:      () => void
  getWebhookInfo:        () => Promise<{ enabled: boolean; secret: string } | null>
  setWebhookEnabled:     (enabled: boolean) => Promise<void>
  validateLicense:       (key: string) => Promise<boolean>
  getLicenseStatus:      () => Promise<{ isPro: boolean; key: string | null }>
  onDeckEvent:           (cb: (event: DeckEvent) => void) => void
  onServerReady:         (cb: (info: ServerInfo) => void) => void
  onAppUpdateAvailable:  (cb: (info: AppUpdateInfo) => void) => void
  onAppUpdateDownloaded: (cb: (info: AppUpdateInfo) => void) => void
}

export interface ProgressData {
  status: string
  pct:    number
}

export interface MarketplaceAPI {
  fetchRegistry:  (force?: boolean) => Promise<PluginRegistry>
  getInstalled:   () => Promise<PluginManifest[]>
  install:        (id: string, url: string) => Promise<PluginManifest>
  uninstall:      (id: string) => Promise<void>
  checkUpdates:        () => Promise<UpdateInfo[]>
  checkPluginUpdates:  () => Promise<UpdateInfo[]>
  loadLocal:           () => Promise<PluginManifest | null>
  reloadPlugins:  () => Promise<PluginMeta[]>
  openExternal:   (url: string) => Promise<void>
  openPluginsDir: () => Promise<void>
  onProgress:     (cb: (data: ProgressData) => void) => void
  getPluginLogs:  (pluginId?: string) => Promise<PluginLogEntry[]>
}
