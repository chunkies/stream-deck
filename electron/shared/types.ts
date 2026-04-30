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
  | 'spotify'
  | 'voice'
  | 'plugin-tile'
  | 'folder'
  | 'counter'
  | 'clock'
  | 'stopwatch'
  | 'countdown'
  | 'trackpad'

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
  // plugin-tile
  pluginTileId?:    string
  pluginTileEvent?: string
  pluginTileField?: string
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
}

// ── Pages & Config ─────────────────────────────────────────────────────────────

export interface Page {
  id:          string
  name:        string
  components:  Component[]
  cols?:       number
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
  ip:       string
  host:     string
  port:     number
  httpPort: number
  mode:     string
  // Added by buildServerPayload in main process before sending to renderer
  url?:     string
  httpUrl?: string
  qr?:      string
}

// ── Plugins ────────────────────────────────────────────────────────────────────

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

export interface PluginMeta {
  id:          string
  name:        string
  version:     string
  description: string
  author:      string
  icon:        string
  _local:      boolean
  actions:     PluginAction[]
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

// Server → PWA
export type ServerMessage =
  | { type: 'config';        config: Config }
  | { type: 'toggleState';   key: string; active: boolean }
  | { type: 'tileUpdate';    key: string; text: string }
  | { type: 'spotifyUpdate'; title: string; artist: string; isPlaying: boolean; artVersion: number }
  | { type: 'voiceResult';   matched?: string; transcript: string }
  | { type: 'pluginEvent';   pluginId: string; event: string; [key: string]: unknown }
  | { type: 'navigate';      pageId: string }
  | { type: 'connection';    connected: boolean; clients: number }
  | { type: 'pluginsReloaded' }

// PWA → Server
export type ClientMessage =
  | { type: 'press';        pageId: string; compId: string; hold: boolean; doubletap?: boolean }
  | { type: 'slide';        pageId: string; compId: string; value: number }
  | { type: 'voiceCommand'; transcript: string; pageId: string; compId: string; voiceMode?: string }
  | { type: 'trackpad';     event: 'move'; dx: number; dy: number }
  | { type: 'trackpad';     event: 'click'; button: 1 | 2 | 3 }
  | { type: 'trackpad';     event: 'scroll'; dy: number }

// ── Electron IPC bridge ────────────────────────────────────────────────────────

export type DeckEvent =
  | { type: 'connection'; connected: boolean; clients: number }
  | { type: 'press';  pageId: string; compId: string }
  | { type: 'slide';  pageId: string; compId: string; value: number }

export interface AppUpdateInfo {
  version:      string
  releaseDate:  string
  releaseName?: string
  releaseNotes?: string
}

export interface ElectronAPI {
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
  checkUpdates:   () => Promise<UpdateInfo[]>
  loadLocal:      () => Promise<PluginManifest | null>
  reloadPlugins:  () => Promise<PluginMeta[]>
  openExternal:   (url: string) => Promise<void>
  openPluginsDir: () => Promise<void>
  onProgress:     (cb: (data: ProgressData) => void) => void
}
