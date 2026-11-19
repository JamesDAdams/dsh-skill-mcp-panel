/** Group used for rows no plugin claims. */
const UNATTRIBUTED = 'harness'

/** Order rows by group (plugin name, unclaimed last), then by row name/order. */
function compareGroups(a, b) {
  const rank = (group) => (group === UNATTRIBUTED ? 1 : 0)
  if (rank(a.group) !== rank(b.group)) return rank(a.group) - rank(b.group)
  if (a.group !== b.group) return a.group.localeCompare(b.group)
  const keyA = typeof a.sortKey === 'number' ? a.sortKey : 0
  const keyB = typeof b.sortKey === 'number' ? b.sortKey : 0
  if (keyA !== keyB) return keyA - keyB
  return String(a.name).localeCompare(String(b.name))
}

/** Group counters, built from rows already sorted by group. */
function groupsOf(rows) {
  const groups = []
  for (const row of rows) {
    let group = groups[groups.length - 1]
    if (group === undefined || group.name !== row.group) {
      group = { name: row.group, count: 0, on: 0, tokens: 0 }
      groups.push(group)
    }
    group.count += 1
    if (row.enabled !== false) {
      group.on += 1
      group.tokens += row.tokens
    }
  }
  return groups
}

/**
 * Host half of @local/dsh-customizer.
 *
 * First module: a complete MCP inventory.
 *
 * `dsh-skill-mcp-panel` lists only the `@deepseek-ai/dsh-mcp-client` rows that
 * live in the profile's `cordis.patch.yml`. A server that another plugin mounts
 * itself — the `wincu` Windows computer-use server is created with
 * `ctx.plugin(bridge, bridgeConfig(…))` inside `dsh-computer-use-win`, so it has
 * no patch row at all — can therefore never appear in that list.
 *
 * This route answers with what actually exists at runtime instead:
 *
 *   GET /local-dsh-customizer/mcp-servers            -> MCP inventory
 *   GET /local-dsh-customizer/mcp-servers?view=tools -> every public tool
 *   GET /local-dsh-customizer/mcp-servers?view=prompts -> every system-prompt
 *                                                       section
 *   GET …&toggleTool=<name>&enabled=true|false       -> switch one tool
 *   GET …&togglePrompt=<name>&enabled=true|false     -> switch one section
 *
 * The two views feed the extra tabs this plugin adds to the Skill/MCP page; the
 * toggles are profile-wide and flow back through the same per-Agent restriction
 * (tools) and empty-shadow (prompt sections) mechanism the MCP switches use.
 *
 * The inventory joins two read-only sources:
 *
 *   1. the live loader entries (`ctx.loader.entries()`), i.e. every declared
 *      `@deepseek-ai/dsh-mcp-client` row plus the other plugin entries, with
 *      their id, package name, config, disabled flag and fiber phase;
 *   2. the tool schemas the Host registry currently exposes, whose public names
 *      follow `mcp__<serverName>__<originalToolName>` for every MCP server,
 *      whichever plugin mounted it.
 *
 * A server present in (2) but not in (1) is exactly the case the other panel
 * cannot show; it is reported with `source: "plugin"`.
 *
 * Reading never starts an MCP server and never evaluates a config value: the
 * views only report strings and numbers the Host can already see. The only
 * writes are this plugin's own switches, recorded in
 * `<dshHome>/dsh-customizer/state.json`.
 */

const ROUTE = '/local-dsh-customizer/mcp-servers'
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGENT_COLORS, MAX_COLORS, attachDisableController, dshHome, loadState, saveState, saveStateSync } from './filter.js'
const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client'
/** The MCP resource bridge's shared tools, exposed by @deepseek-ai/dsh-mcp-resources. */
const RESOURCE_BRIDGE_PACKAGE = '@deepseek-ai/dsh-mcp-resources'
const RESOURCE_BRIDGE_NAME = 'mcp-resource-servers'
const RESOURCE_TOOLS = ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']

/** Cordis fiber phases, as the loader numbers them. */
const FIBER_PHASE = {
  0: 'pending',
  1: 'loading',
  2: 'active',
  3: 'failed',
  4: null,
  5: 'unloading',
}

const MAX_TOOLS = 200
/**
 * Longest prompt-section body the page tab receives.
 *
 * The page expands one row on demand, so the whole text travels with the
 * payload: the earlier 2500-character cap hid most of the largest sections
 * (`agent-teams:usage` alone is over 5000) while still counting their full
 * token weight, which made the tab look truncated rather than clipped.
 */
const PROMPT_TEXT_LIMIT = 160000
/** Longest tool definition the page tab receives; same reasoning as above. */
const TOOL_TEXT_LIMIT = 160000
/** Presets whose scope the page assembles; a profile rarely declares more. */
const MAX_PRESETS = 12

/**
 * French labels for the tool modules a composition can mount.
 *
 * A preset is a plugin list: the only truthful face of a "tool" is the module
 * that registers it. This table is display text — the composition itself is
 * built from the declaration's own entries — so an unlisted package simply
 * falls back to its short name instead of disappearing.
 */
const TOOL_MODULE_LABELS = {
  '@deepseek-ai/dsh-tool-bash': 'Shell (bash)',
  '@deepseek-ai/dsh-tool-bash-persistent': 'Shell persistant',
  '@deepseek-ai/dsh-tool-pwsh': 'PowerShell',
  '@deepseek-ai/dsh-tool-pwsh-persistent': 'PowerShell persistant',
  '@deepseek-ai/dsh-tool-fs': 'Fichiers (lecture, écriture, édition)',
  '@deepseek-ai/dsh-tool-fs-search': 'Recherche de fichiers (glob, grep)',
  '@deepseek-ai/dsh-tool-str-replace-editor': 'Éditeur par remplacement de texte',
  '@deepseek-ai/dsh-tool-jobs': 'Tâches en arrière-plan',
  '@deepseek-ai/dsh-tool-schedule': 'Tâches planifiées',
  '@deepseek-ai/dsh-tool-skill': 'Compétences (skill)',
  '@deepseek-ai/dsh-tool-goal': 'Objectif de session',
  '@deepseek-ai/dsh-tool-todo': 'Liste de tâches',
  '@deepseek-ai/dsh-tool-ask-user': 'Questions à l’utilisateur',
  '@deepseek-ai/dsh-tool-web': 'Web (recherche, lecture)',
  '@deepseek-ai/dsh-tool-present': 'Livrables',
  '@deepseek-ai/dsh-tool-office': 'Office (Word, Excel, PowerPoint)',
  '@deepseek-ai/dsh-tool-subagent': 'Délégation à des sous-agents',
  '@deepseek-ai/dsh-tool-subagent-control': 'Pilotage des sous-agents',
  '@deepseek-ai/dsh-tool-workflow': 'Workflow (orchestration)',
  '@deepseek-ai/dsh-tool-agent-team': 'Équipes d’agents',
  '@deepseek-ai/dsh-tool-lsp': 'LSP (langage)',
  '@deepseek-ai/dsh-tool-terminal': 'Terminal persistant',
  '@deepseek-ai/dsh-tool-ralph': 'Boucle Ralph',
  '@deepseek-ai/dsh-tool-cordis': 'Inspection Cordis',
  '@deepseek-ai/dsh-tool-workspace-dependencies': 'Dépendances de l’espace de travail',
  '@deepseek-ai/dsh-tool-working-directory': 'Dossier de travail',
  '@deepseek-ai/dsh-experimental-tool-session-query': 'Historique des sessions',
  '@deepseek-ai/dsh-experimental-tool-worktree': 'Worktree Git',
  '@deepseek-ai/dsh-plugin-manager/tools': 'Gestion des plugins',
  '@deepseek-ai/dsh-plugin-market/tools': 'Marché de plugins',
}

/**
 * One line saying what each tool module gives the model.
 *
 * Display text, taken from the package table of the installed documentation so
 * the reader knows what a checkbox adds without opening the plugin page. A
 * module with no entry here simply shows no line.
 */
const TOOL_MODULE_DESCRIPTIONS = {
  '@deepseek-ai/dsh-tool-bash': 'Exécute des commandes shell, avec tâches d’arrière-plan et escalade de bac à sable.',
  '@deepseek-ai/dsh-tool-pwsh': 'Exécute des commandes PowerShell (Windows).',
  '@deepseek-ai/dsh-tool-bash-persistent': 'Shell bash persistant, adossé au service de terminal.',
  '@deepseek-ai/dsh-tool-pwsh-persistent': 'PowerShell persistant, adossé au service de terminal.',
  '@deepseek-ai/dsh-tool-fs': 'Lit, écrit et édite les fichiers de l’espace de travail.',
  '@deepseek-ai/dsh-tool-fs-search': 'Trouve des fichiers et du contenu avec glob et grep (ripgrep).',
  '@deepseek-ai/dsh-tool-str-replace-editor': 'Affiche, crée et modifie un fichier par remplacement littéral ou insertion de lignes.',
  '@deepseek-ai/dsh-tool-jobs': 'Suit et arrête les tâches d’arrière-plan : job_output, job_list, job_kill.',
  '@deepseek-ai/dsh-tool-schedule': 'Crée, consulte et modifie des tâches planifiées récurrentes.',
  '@deepseek-ai/dsh-tool-skill': 'Charge une compétence et ses instructions à la demande.',
  '@deepseek-ai/dsh-tool-goal': 'Pose, lit et met à jour un objectif de session persistant.',
  '@deepseek-ai/dsh-tool-todo': 'Tient la liste de tâches affichée pendant l’exécution.',
  '@deepseek-ai/dsh-tool-ask-user': 'Pose une question à l’utilisateur et attend sa réponse.',
  '@deepseek-ai/dsh-tool-web': 'Cherche sur le web et lit une page : web_search, web_fetch.',
  '@deepseek-ai/dsh-tool-present': 'Déclare des fichiers de l’espace de travail comme livrables.',
  '@deepseek-ai/dsh-tool-office': 'Rend, convertit et recalcule des documents Word, Excel et PowerPoint.',
  '@deepseek-ai/dsh-tool-subagent': 'Délègue une tâche isolée à un sous-agent.',
  '@deepseek-ai/dsh-tool-subagent-control': 'Liste, pilote et interrompt les sous-agents d’une même arborescence.',
  '@deepseek-ai/dsh-tool-workflow': 'Orchestre un script JavaScript sur plusieurs sous-agents.',
  '@deepseek-ai/dsh-tool-agent-team': 'Tient le tableau de tâches partagé d’une équipe d’agents.',
  '@deepseek-ai/dsh-tool-lsp': 'Interroge un serveur de langage : définition, références, implémentation, survol.',
  '@deepseek-ai/dsh-tool-terminal': 'Ouvre et pilote des terminaux PTY persistants.',
  '@deepseek-ai/dsh-tool-ralph': 'Relance un agent frais en boucle jusqu’à satisfaction.',
  '@deepseek-ai/dsh-tool-cordis': 'Inspecte l’API Cordis du runtime, en lecture seule.',
  '@deepseek-ai/dsh-tool-working-directory': 'Lit et change le dossier de travail de la session.',
  '@deepseek-ai/dsh-tool-workspace-dependencies': 'Donne les chemins absolus des Python, Node et pnpm embarqués.',
  '@deepseek-ai/dsh-experimental-tool-session-query': 'Cherche et lit l’historique des sessions de l’espace de travail.',
  '@deepseek-ai/dsh-experimental-tool-worktree': 'Crée un worktree Git et s’y installe.',
  '@deepseek-ai/dsh-plugin-manager/tools': 'Installe, active, désactive et configure des plugins depuis la conversation.',
  '@deepseek-ai/dsh-plugin-market/tools': 'Parcourt les index du marché de plugins configurés.',
}

/**
 * Every tool module this DSH ships, in the order the form lists them.
 *
 * Drawn from the package table of the installed documentation, so the list is
 * the whole catalogue rather than the handful a shipped preset happens to
 * mount. A module whose service is not mounted stays pending inside the preset
 * instead of failing it, so offering the full list is safe; the declaration is
 * still verified after creation and rolled back if it breaks.
 */
const TOOL_CATALOGUE = [
  '@deepseek-ai/dsh-tool-bash',
  '@deepseek-ai/dsh-tool-pwsh',
  '@deepseek-ai/dsh-tool-bash-persistent',
  '@deepseek-ai/dsh-tool-pwsh-persistent',
  '@deepseek-ai/dsh-tool-fs',
  '@deepseek-ai/dsh-tool-fs-search',
  '@deepseek-ai/dsh-tool-str-replace-editor',
  '@deepseek-ai/dsh-tool-jobs',
  '@deepseek-ai/dsh-tool-schedule',
  '@deepseek-ai/dsh-tool-skill',
  '@deepseek-ai/dsh-tool-goal',
  '@deepseek-ai/dsh-tool-todo',
  '@deepseek-ai/dsh-tool-ask-user',
  '@deepseek-ai/dsh-tool-web',
  '@deepseek-ai/dsh-tool-present',
  '@deepseek-ai/dsh-tool-office',
  '@deepseek-ai/dsh-tool-subagent',
  '@deepseek-ai/dsh-tool-subagent-control',
  '@deepseek-ai/dsh-tool-workflow',
  '@deepseek-ai/dsh-tool-agent-team',
  '@deepseek-ai/dsh-tool-lsp',
  '@deepseek-ai/dsh-tool-terminal',
  '@deepseek-ai/dsh-tool-ralph',
  '@deepseek-ai/dsh-tool-cordis',
  '@deepseek-ai/dsh-tool-working-directory',
  '@deepseek-ai/dsh-tool-workspace-dependencies',
  '@deepseek-ai/dsh-experimental-tool-session-query',
  '@deepseek-ai/dsh-experimental-tool-worktree',
  '@deepseek-ai/dsh-plugin-manager/tools',
  '@deepseek-ai/dsh-plugin-market/tools',
]

/** Presets a new composition may be modelled on, in preference order. */
const TEMPLATES = {
  agent: ['standard', 'ptc', 'minimal'],
  subagent: ['openfox-explorer', 'minimal', 'standard'],
}

/**
 * Shipped compositions read when cataloguing the addable modules.
 *
 * Only presets DSH itself ships, because those are the ones every profile
 * resolves: offering a module from a bundle the user may uninstall would build
 * declarations that fail to activate.
 */
const CATALOGUE_PRESETS = ['standard', 'ptc', 'minimal', 'cordis', 'openfox-explorer', 'openfox-planner', 'openfox-builder']

/** One plugin entry is a tool module when it mounts a tool package. */
function isToolModule(entry) {
  const name = typeof entry?.name === 'string' ? entry.name : ''
  if (name.length === 0) return false
  // Executors and presentation selectors run tools, they do not add any.
  if (/-tool-executor-|-tool-presentation/.test(name)) return false
  if (TOOL_MODULE_LABELS[name] !== undefined) return true
  if (/\/tools$/.test(name)) return true
  return /(^|\/)dsh-(experimental-)?tool-/.test(name)
}

/**
 * Every plugin entry of a list, including the ones a `cordis:group` nests.
 *
 * Shipped presets mount several tool modules inside a group (the persistent
 * shell is one), so a scan that only looks at the top level silently hides
 * them — the consultation view reported a single tool module for `minimal`
 * because of exactly that.
 */
function walkEntries(plugins, visit, depth) {
  if (!Array.isArray(plugins) || depth > 4) return
  for (const entry of plugins) {
    if (entry === null || typeof entry !== 'object') continue
    visit(entry)
    if (Array.isArray(entry.config)) walkEntries(entry.config, visit, depth + 1)
  }
}

/** Drop tool modules by package name, nested ones included. */
function dropToolModules(plugins, drop) {
  const out = []
  for (const entry of plugins) {
    if (entry === null || typeof entry !== 'object') { out.push(entry); continue }
    if (isToolModule(entry) && drop.has(entry.name)) continue
    if (Array.isArray(entry.config)) {
      entry.config = dropToolModules(entry.config, drop)
      // A group with nothing left to mount would only add noise.
      if (entry.config.length === 0) continue
    }
    out.push(entry)
  }
  return out
}

/** The display label of one tool module. */
function toolModuleLabel(name) {
  const known = TOOL_MODULE_LABELS[name]
  if (known !== undefined) return known
  const tail = String(name).split('/').pop() ?? String(name)
  return tail.replace(/^dsh-(experimental-)?/, '').replace(/-/g, ' ')
}

/** The one-line description of one tool module, or an empty string. */
function toolModuleDescription(name) {
  return TOOL_MODULE_DESCRIPTIONS[name] ?? ''
}

/** An entry id derived from a package name, unique inside one plugin list. */
function entryIdFor(packageName, taken) {
  const base = String(packageName).split('/').pop().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'module'
  let candidate = base
  let index = 2
  while (taken.has(candidate)) { candidate = base + '-' + index; index += 1 }
  taken.add(candidate)
  return candidate
}

/** Read one preset declaration's plugin list, or null when unreadable. */
async function pluginsOf(service, id, yaml, schema) {
  try {
    const document = await service.readDocument(id)
    const parsed = yaml.load(String(document?.content ?? ''), { schema })
    if (Array.isArray(parsed) && parsed.length > 0) return { plugins: parsed, id }
  } catch { /* absent or unparsable: the caller tries the next candidate */ }
  return null
}

/** The shipped composition a new Agent of this kind is modelled on. */
async function templatePlugins(service, kind, yaml, schema) {
  for (const id of TEMPLATES[kind === 'subagent' ? 'subagent' : 'agent']) {
    const found = await pluginsOf(service, id, yaml, schema)
    if (found !== null) return found
  }
  return null
}

/** True when this module already appears in a plugin list. */
function listHasPackage(plugins, name) {
  return plugins.some((entry) => typeof entry?.name === 'string' && entry.name === name)
}

/** Every tool module some shipped preset mounts, minus those already listed. */
async function addableModules(service, yaml, schema, plugins) {
  const out = []
  const seen = new Set()
  for (const id of CATALOGUE_PRESETS) {
    const found = await pluginsOf(service, id, yaml, schema)
    if (found === null) continue
    for (const entry of found.plugins) {
      if (!isToolModule(entry) || entry.disabled === true || entry.disabled === 'true') continue
      const name = entry.name
      if (seen.has(name) || listHasPackage(plugins, name)) continue
      seen.add(name)
      out.push({ name, label: toolModuleLabel(name) })
    }
  }
  out.sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  return out
}

/** Last Client bundle that asked for the inventory (diagnostics only). */
let LAST_CLIENT = null
/**
 * Self-reported state of the Client half's draft-image keeper.
 *
 * The diagnostic ring only keeps the last few reports and anything chatty
 * evicts them; this survives until the next report and is always returned.
 */
let DRAFT_STATE = null
/** Recent Client reports (slot registration, errors); newest first. */
const CLIENT_DIAG = []
const MAX_DIAG = 24

function pushDiag(kind, text) {
  try {
    CLIENT_DIAG.unshift({ kind: String(kind).slice(0, 40), text: String(text ?? '').slice(0, 300), at: new Date().toISOString() })
    while (CLIENT_DIAG.length > MAX_DIAG) CLIENT_DIAG.pop()
  } catch { /* never fail a request over diagnostics */ }
}

function asString(value, max = 400) {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (text.length === 0) return undefined
  return text.length > max ? text.slice(0, max) + '…' : text
}

function asNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Coalesced state write, for values learned on a hot path. */
let STATE_SAVE_TIMER = null
/** Upper bound on the presets kept out of the agent menu. */
const MAX_HIDDEN_PRESETS = 96

/** Mirror of the stored colours, for diagnostics. */
let AGENT_COLOR_STATE = { at: null }

function scheduleStateSave(state) {
  if (STATE_SAVE_TIMER !== null) return
  STATE_SAVE_TIMER = setTimeout(() => {
    STATE_SAVE_TIMER = null
    try { void saveState(state) } catch { /* the next change retries */ }
  }, 1500)
  if (STATE_SAVE_TIMER !== null && typeof STATE_SAVE_TIMER.unref === 'function') STATE_SAVE_TIMER.unref()
}

/** One-line error text for a payload field. */
function errorTextOf(error) {
  return String(error?.message ?? error).slice(0, 240)
}

/** Same heuristic the harness' own token meter uses (dsh-token-meter/estimate). */
const CHARS_PER_TOKEN = 4
const BLOCK_OVERHEAD = 4

/** Heuristic size of one server's tool schemas, as the model receives them. */
function estimateToolTokens(list) {
  if (!Array.isArray(list) || list.length === 0) return 0
  try {
    return Math.ceil(JSON.stringify(list).length / CHARS_PER_TOKEN) + BLOCK_OVERHEAD
  } catch {
    return 0
  }
}

/** Read a Host service without ever throwing when it is absent. */
function serviceOf(ctx, name) {
  try {
    const direct = typeof ctx.get === 'function' ? ctx.get(name) : undefined
    if (direct !== undefined && direct !== null) return direct
  } catch { /* absent service */ }
  try {
    const viaProperty = ctx[name]
    if (viaProperty !== undefined && viaProperty !== null) return viaProperty
  } catch { /* throwing accessor */ }
  return undefined
}

function readEntry(entry) {
  const options = entry !== null && typeof entry === 'object' ? entry.options : undefined
  const config = options !== null && typeof options === 'object' && options.config !== null && typeof options.config === 'object'
    ? options.config
    : {}
  let phase = null
  try {
    phase = FIBER_PHASE[entry?.fiber?.state] ?? null
  } catch { /* no fiber */ }
  return {
    id: asString(entry?.id) ?? asString(options?.id),
    name: asString(options?.name) ?? asString(entry?.name),
    config,
    disabled: entry?.disabled === true || options?.disabled === true || config?.disabled === true,
    phase,
  }
}

function readEntries(ctx) {
  const loader = serviceOf(ctx, 'loader')
  const rows = []
  let available = false
  try {
    if (loader !== undefined && typeof loader.entries === 'function') {
      available = true
      for (const entry of loader.entries()) {
        try {
          rows.push(readEntry(entry))
        } catch { /* one broken entry must not hide the others */ }
      }
    }
  } catch { /* loader not readable */ }
  return { available, rows }
}

function readSchemas(ctx, scope) {
  const tools = serviceOf(ctx, 'tools')
  const rows = []
  let available = false
  for (const method of ['schemas', 'definitions']) {
    try {
      if (tools === undefined || typeof tools[method] !== 'function') continue
      const list = tools[method](scope)
      if (!Array.isArray(list)) continue
      available = true
      for (const item of list) {
        if (item !== null && typeof item === 'object' && typeof item.name === 'string') rows.push(item)
      }
      if (rows.length > 0) break
    } catch { /* try the next shape */ }
  }
  return { available, rows }
}

/**
 * Split `mcp__<server>__<tool>` into the server name. A declared server name
 * wins (longest first) because server names may themselves contain `_`.
 */
function serverOfTool(toolName, declaredNames) {
  if (typeof toolName !== 'string' || !toolName.startsWith('mcp__')) return undefined
  for (const name of declaredNames) {
    if (toolName.startsWith('mcp__' + name + '__')) return name
  }
  const rest = toolName.slice('mcp__'.length)
  const split = rest.indexOf('__')
  if (split <= 0) return undefined
  return rest.slice(0, split)
}

function transportOf(config) {
  const transport = asString(config?.transport)
  return transport ?? (asString(config?.url) !== undefined ? 'http' : 'stdio')
}

function buildDeclaredServer(entry) {
  const config = entry.config
  const serverName = asString(config?.serverName)
  if (serverName === undefined) return undefined
  const args = Array.isArray(config?.args)
    ? config.args.filter((value) => typeof value === 'string').slice(0, 12)
    : undefined
  return {
    name: serverName,
    source: 'profile',
    entryId: entry.id ?? null,
    entryName: entry.name ?? null,
    enabled: entry.disabled !== true,
    disabled: entry.disabled === true,
    phase: entry.phase,
    transport: transportOf(config),
    command: asString(config?.command, 200),
    args,
    url: asString(config?.url, 300),
    active: false,
    toolCount: 0,
    tools: [],
  }
}

/**
 * Tools the Skill/MCP panel has switched off, by full name.
 *
 * That panel keeps its own deny list in `skills/.system/skill-viewer/tool-filter.json`
 * and applies it per Agent scope, so `tools.restrict` never reports it here. The
 * two lists are different switches for the same effect; the cost and active
 * counts have to honour both, otherwise a card reads "69 tools" while 68 of
 * them are off.
 */
const PANEL_DENY = { at: 0, names: new Set() }
function panelDeniedTools() {
  const now = Date.now()
  if (now - PANEL_DENY.at < 2000) return PANEL_DENY.names
  let names = new Set()
  try {
    const file = join(dshHome(), 'skills', '.system', 'skill-viewer', 'tool-filter.json')
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (Array.isArray(parsed?.deny)) {
      names = new Set(parsed.deny.filter((name) => typeof name === 'string' && name.length > 0))
    }
  } catch { /* absent file: nothing is denied by the panel */ }
  PANEL_DENY.at = now
  PANEL_DENY.names = names
  return names
}

function inventory(ctx, disabled, sessionId, state) {
  const off = disabled instanceof Set ? disabled : new Set(Array.isArray(disabled) ? disabled : [])
  const { available: loaderAvailable, rows: entries } = readEntries(ctx)
  const { available: toolsAvailable, rows: schemas } = readSchemas(ctx)

  const declaredEntries = []
  const adapters = []
  for (const entry of entries) {
    if (entry.name === MCP_CLIENT_PACKAGE) {
      declaredEntries.push(entry)
      continue
    }
    // A non-mcp-client row that names itself after an MCP adapter is the
    // likely owner of runtime-only servers such as wincu.
    const id = entry.id ?? ''
    const name = entry.name ?? ''
    if (name.length === 0) continue
    if (/^@local\//i.test(name)) continue
    if (/^dsh-skill-mcp-panel/i.test(name)) continue
    if (/^mcp-/i.test(id) || /computer-use/i.test(name) || /computer-use/i.test(id)) {
      adapters.push({ entryId: entry.id ?? null, name })
    }
  }

  const servers = new Map()
  const declaredNames = []
  for (const entry of declaredEntries) {
    const server = buildDeclaredServer(entry)
    if (server === undefined) continue
    declaredNames.push(server.name)
    if (!servers.has(server.name)) servers.set(server.name, server)
  }
  declaredNames.sort((a, b) => b.length - a.length)

  let schemaCount = 0
  for (const schema of schemas) {
    const serverName = serverOfTool(schema.name, declaredNames)
    if (serverName === undefined) continue
    let row = servers.get(serverName)
    if (row === undefined) {
      row = {
        name: serverName,
        source: 'plugin',
        entryId: null,
        entryName: null,
        enabled: true,
        disabled: false,
        phase: null,
        transport: null,
        command: null,
        args: null,
        url: null,
        active: false,
        toolCount: 0,
        tools: [],
      }
      servers.set(serverName, row)
    }
    row.toolCount += 1
    if (row.raw === undefined) row.raw = []
    row.raw.push(schema)
    if (row.tools.length < MAX_TOOLS) {
      row.tools.push({
        name: schema.name,
        description: asString(schema.description, 280) ?? '',
      })
      schemaCount += 1
    }
  }

  // The MCP resource bridge is a Host plugin, not a server: it contributes the
  // three shared resource tools (list resources, list templates, read resource)
  // that the model uses through `mcpResources`. Its tools carry no
  // `mcp__<server>__` prefix, so the panel never shows them; add one read-only
  // entry so they are visible and filterable there.
  const bridgeEntry = entries.find((entry) => entry.name === RESOURCE_BRIDGE_PACKAGE && entry.disabled !== true)
  if (bridgeEntry !== undefined) {
    const bridgeSchemas = schemas.filter((schema) => RESOURCE_TOOLS.includes(schema.name))
    const resourceTools = bridgeSchemas.map((schema) => ({
      name: schema.name,
      description: asString(schema.description, 280) ?? '',
    }))
    servers.set(RESOURCE_BRIDGE_NAME, {
      name: RESOURCE_BRIDGE_NAME,
      source: 'bridge',
      entryId: bridgeEntry.id ?? null,
      entryName: bridgeEntry.name ?? null,
      enabled: true,
      disabled: false,
      phase: bridgeEntry.phase ?? null,
      transport: null,
      command: null,
      args: null,
      url: null,
      active: resourceTools.length > 0,
      toolCount: resourceTools.length,
      tools: resourceTools,
      raw: bridgeSchemas,
      provider: RESOURCE_BRIDGE_PACKAGE,
    })
  }

  const provider = adapters.length === 1 ? adapters[0].name : undefined
  const rows = [...servers.values()].map((row) => {
    row.active = row.toolCount > 0
    if (row.source === 'plugin' && provider !== undefined) row.provider = provider
    // A server declared in the profile is as switchable as a plugin-mounted
    // one: the per-conversation switch is a deny list of its tool names, which
    // works whoever mounted it. Excluding it here meant the conversation chip
    // listed a profile server only while it happened to hold tools, so a server
    // that had merely not connected yet simply vanished from the picker.
    if (row.source === 'plugin' || row.source === 'bridge' || row.source === 'profile') row.toggleable = true
    if (off.has(row.name)) {
      row.enabled = false
      row.disabled = true
    }
    return row
  })
  const rank = (row) => (row.source === 'plugin' ? 0 : row.source === 'bridge' ? 1 : 2)
  rows.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    if (a.active !== b.active) return a.active ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  // Price each server's tool schemas with the harness' own heuristic so the
  // numbers match the context breakdown the app already shows. Each tool keeps
  // its own price too, for the row-level chips.
  let toolTokens = 0
  for (const row of rows) {
    const schemas = Array.isArray(row.raw) ? row.raw : []
    const priceOf = new Map()
    for (const schema of schemas) priceOf.set(schema.name, estimateSchemaTokens(schema))
    row.tools = (Array.isArray(row.tools) ? row.tools : []).map((tool) => ({
      ...tool,
      tokens: priceOf.get(tool.name) ?? 0,
    }))
    // The total has to add up to the rows the form prints: once the tool list
    // is known, it is the sum of their own prices instead of a second estimate
    // that rounds differently.
    row.tokens = row.tools.length > 0
      ? row.tools.reduce((sum, tool) => sum + (typeof tool.tokens === 'number' ? tool.tokens : 0), 0)
      : estimateToolTokens(row.raw)
    toolTokens += row.tokens
    delete row.raw
  }

  // How many of this server's tools are actually live: the card prints the
  // total, and the two differ as soon as a tool of the server is switched off.
  const panelDeny = panelDeniedTools()
  for (const row of rows) {
    const list = Array.isArray(row.tools) ? row.tools : []
    const live = list.filter((tool) => off.has(tool.name) !== true
      && panelDeny.has(tool.name) !== true)
    row.activeToolCount = live.length
    // What the model actually pays: the weight of the schemas that survive
    // every switch, not of all the schemas the server could send.
    row.activeTokens = live.reduce((total, tool) => total
      + (typeof tool.tokens === 'number' ? tool.tokens : 0), 0)
  }

  // A switched-off server registers no tool schema, so its live weight is 0 and
  // the card could only ever say "0 tools". Remember the last weight each one
  // had while it was present, and report that for the ones currently off.
  const cache = state !== null && typeof state === 'object'
    && state.mcpToolCache !== null && typeof state.mcpToolCache === 'object'
    && !Array.isArray(state.mcpToolCache)
    ? state.mcpToolCache
    : {}
  let cacheDirty = false
  for (const row of rows) {
    if (row.toolCount > 0) {
      const known = cache[row.name]
      if (known === undefined || known.toolCount !== row.toolCount || known.tokens !== row.tokens) {
        cache[row.name] = { toolCount: row.toolCount, tokens: row.tokens, at: Date.now() }
        cacheDirty = true
      }
    } else {
      const known = cache[row.name]
      if (known !== undefined && typeof known.tokens === 'number') {
        row.cachedToolCount = known.toolCount
        row.cachedTokens = known.tokens
      }
    }
  }
  if (state !== null && typeof state === 'object') {
    state.mcpToolCache = cache
    // Written at once, not after a delay: this map is the only memory of a
    // server's weight once it is switched off, and a deferred write was being
    // lost whenever the app quit inside the debounce window.
    if (cacheDirty) {
      try {
        void saveState(state)
      } catch { /* the exit flush retries */ }
    }
  }

  // Per-conversation view: which rows this session overrides, and what the
  // profile default would be without those overrides.
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    const sessions = state !== null && typeof state === 'object' && state.sessions !== null && typeof state.sessions === 'object'
      ? state.sessions
      : {}
    const over = sessions[sessionId]
    const on = new Set(Array.isArray(over?.on) ? over.on : [])
    const offNames = new Set(Array.isArray(over?.off) ? over.off : [])
    const globalOff = new Set(Array.isArray(state?.disabled) ? state.disabled : [])
    for (const row of rows) {
      row.session = sessionId
      row.globalEnabled = row.source === 'plugin' || row.source === 'bridge'
        ? !globalOff.has(row.name)
        : row.enabled === true || offNames.has(row.name)
      row.override = on.has(row.name) ? 'on' : offNames.has(row.name) ? 'off' : null
    }
  }

  const summary = {
    servers: rows.length,
    active: rows.filter((row) => row.active && row.enabled !== false).length,
    tools: rows.reduce((total, row) => total + row.toolCount, 0),
    tokens: toolTokens,
    plugin: rows.filter((row) => row.source === 'plugin').length,
    bridge: rows.filter((row) => row.source === 'bridge').length,
    declared: rows.filter((row) => row.source === 'profile').length,
    disabled: rows.filter((row) => row.enabled === false).length,
    overrides: typeof sessionId === 'string' && sessionId.length > 0
      ? rows.filter((row) => row.override !== null).length
      : 0,
    sessions: state !== null && typeof state === 'object' && state.sessions !== null && typeof state.sessions === 'object'
      ? Object.keys(state.sessions).length
      : 0,
  }

  return {
    ok: true,
    session: typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null,
    generatedAt: new Date().toISOString(),
    summary,
    servers: rows,
    adapters,
    diagnostics: {
      loaderAvailable,
      toolsAvailable,
      loaderEntries: entries.length,
      client: LAST_CLIENT,
      toolSchemas: schemaCount,
      clientDiag: CLIENT_DIAG.slice(0, 12),
      draftState: DRAFT_STATE,
      mcpEntries: entries
        .filter((entry) => entry.id !== null && entry.id !== undefined && /mcp/i.test(entry.id))
        .map((entry) => ({
          id: entry.id,
          name: entry.name ?? null,
          disabled: entry.disabled === true,
          phase: entry.phase ?? null,
        })),
    },
  }
}

/* -------------------------------------------------------------------------- */
/* The two extra page tabs: tool definitions and system-prompt sections        */
/* -------------------------------------------------------------------------- */

/** Names the user switched off, read from the persisted state shape. */
function nameList(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const name of value) {
    if (typeof name === 'string' && name.length > 0 && !out.includes(name)) out.push(name)
  }
  return out
}

function toolNamesOff(state) {
  return nameList(state?.tools)
}

function promptNamesOff(state) {
  return nameList(state?.prompts)
}

/**
 * Preset-scoped switches.
 *
 * A preset bucket records only the differences from the profile-wide lists, in
 * both directions, exactly like a per-conversation override: `off` hides a name
 * the profile keeps, `on` restores one the profile hides. Everything else is
 * inherited, so a global switch still applies unless a preset overrides it.
 */
function presetBucketOf(state, presetId) {
  if (typeof presetId !== 'string' || presetId.length === 0) return undefined
  const presets = state?.presets
  if (presets === null || typeof presets !== 'object') return undefined
  const bucket = presets[presetId]
  return bucket !== null && typeof bucket === 'object' ? bucket : undefined
}

/** Effective switched-off names for one kind: the profile lists plus a preset. */
function offSetForPreset(state, presetId, kind) {
  const off = new Set(kind === 'tools' ? toolNamesOff(state) : promptNamesOff(state))
  const bucket = presetBucketOf(state, presetId)
  if (bucket === undefined) return off
  for (const name of nameList(bucket[kind + 'Off'])) off.add(name)
  for (const name of nameList(bucket[kind + 'On'])) off.delete(name)
  return off
}

/** Record one preset switch, dropping the override when it matches the profile. */
function writePresetToggle(state, presetId, kind, name, wanted) {
  if (typeof presetId !== 'string' || presetId.length === 0) return
  const presets = state.presets !== null && typeof state.presets === 'object' ? state.presets : {}
  const current = presets[presetId]
  const bucket = {
    toolsOn: nameList(current?.toolsOn),
    toolsOff: nameList(current?.toolsOff),
    promptsOn: nameList(current?.promptsOn),
    promptsOff: nameList(current?.promptsOff),
  }
  const onKey = kind + 'On'
  const offKey = kind + 'Off'
  const profileOff = kind === 'tools' ? toolNamesOff(state) : promptNamesOff(state)
  const profileOn = !profileOff.includes(name)
  bucket[onKey] = bucket[onKey].filter((value) => value !== name)
  bucket[offKey] = bucket[offKey].filter((value) => value !== name)
  if (wanted !== profileOn) {
    if (wanted) bucket[onKey].push(name)
    else bucket[offKey].push(name)
  }
  const total = bucket.toolsOn.length + bucket.toolsOff.length
    + bucket.promptsOn.length + bucket.promptsOff.length
  if (total === 0) delete presets[presetId]
  else presets[presetId] = bucket
  state.presets = presets
}

/**
 * Force these tool names ON for one preset, explicitly.
 *
 * `writePresetToggle` only records a difference from the profile default, which
 * is right for a card switch and wrong for a pin: an Agent told to keep a server
 * must keep it after the profile cuts that server later, so the allow has to be
 * written even when it currently matches the default.
 */
function pinPresetTools(state, presetId, names) {
  if (typeof presetId !== 'string' || presetId.length === 0 || names.length === 0) return
  const presets = state.presets !== null && typeof state.presets === 'object' ? state.presets : {}
  const current = presets[presetId]
  const wanted = new Set(names)
  const bucket = {
    toolsOn: [...new Set([...nameList(current?.toolsOn), ...wanted])].sort(),
    toolsOff: nameList(current?.toolsOff).filter((value) => !wanted.has(value)),
    promptsOn: nameList(current?.promptsOn),
    promptsOff: nameList(current?.promptsOff),
  }
  presets[presetId] = bucket
  state.presets = presets
}

/** The MCP servers one preset keeps, with the tools it keeps of each. */
function pinnedFor(state, presetId) {
  if (typeof presetId !== 'string' || presetId.length === 0) return []
  const row = state?.mcpPins?.[presetId]
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return []
  return Object.keys(row).map((server) => ({
    server,
    tools: Array.isArray(row[server]) ? row[server] : ['*'],
    all: !Array.isArray(row[server]) || row[server].includes('*'),
  }))
}

/** The names of the servers one preset keeps. */
function pinnedServersFor(state, presetId) {
  return pinnedFor(state, presetId).map((pin) => pin.server)
}

/** Record the servers one preset keeps; an empty map forgets it. */
function writeMcpPins(state, presetId, pins) {
  if (typeof presetId !== 'string' || presetId.length === 0) return
  const all = state.mcpPins !== null && typeof state.mcpPins === 'object' && !Array.isArray(state.mcpPins)
    ? { ...state.mcpPins }
    : {}
  const servers = {}
  for (const pin of pins.slice(0, 8)) {
    if (typeof pin?.server !== 'string' || pin.server.length === 0) continue
    servers[pin.server] = Array.isArray(pin.tools) && !pin.tools.includes('*')
      ? pin.tools.slice(0, 240)
      : ['*']
  }
  if (Object.keys(servers).length === 0) delete all[presetId]
  else all[presetId] = servers
  state.mcpPins = all
}

/** The tools one live MCP server publishes, as the registry sees them. */
function serverToolsOf(ctx, server) {
  const prefix = 'mcp__' + server + '__'
  return readSchemas(ctx).rows
    .filter((schema) => typeof schema?.name === 'string' && schema.name.startsWith(prefix))
    .map((schema) => ({
      name: schema.name,
      label: schema.name.slice(prefix.length),
      description: typeof schema.description === 'string' ? schema.description.trim().slice(0, 400) : '',
      tokens: estimateSchemaTokens(schema),
    }))
}

/**
 * Every tool name one Agent is denied, from the one place both the controller
 * and the diagnostics read.
 *
 * A forced server is subtracted from the profile deny set *before* that set is
 * expanded into tool names, which is how a pin wins against a profile-wide
 * switch. A partial pin then denies the tools of that server the user did not
 * pick, so "only these tools of this MCP" is exactly what runs.
 */
function denyNamesForPreset(ctx, state, agentId, presetId) {
  const pins = pinnedFor(state, presetId)
  const base = offSetFor(state, agentId)
  const out = new Set(offSetForPreset(state, presetId, 'tools'))
  for (const pin of pins) base.delete(pin.server)
  for (const name of denyNames(ctx, base)) out.add(name)
  if (pins.some((pin) => !pin.all)) {
    let rows = null
    for (const pin of pins) {
      if (pin.all) continue
      rows = rows ?? readSchemas(ctx).rows
      const keep = new Set(pin.tools)
      for (const schema of rows) {
        if (typeof schema?.name !== 'string') continue
        if (!schema.name.startsWith('mcp__' + pin.server + '__')) continue
        if (!keep.has(schema.name)) out.add(schema.name)
      }
    }
  }
  return [...out]
}

/** The presets whose own switch currently hides this name. */
function presetOffList(presetOff, name) {
  const out = []
  for (const [id, set] of presetOff ?? []) {
    if (set.has(name)) out.push(id)
  }
  return out.sort()
}

/** The preset id behind one live Agent id, for the controller's per-Agent hook. */
function presetIdOfAgentId(ctx, agentId) {
  try {
    const agent = serviceOf(ctx, 'agents')?.get?.(agentId)
    if (agent === null || agent === undefined) return null
    return presetIdOf(agent, serviceOf(ctx, 'agentPresets'))
  } catch {
    return null
  }
}

/** Replace one name's switch state inside a plain name list. */
function withName(list, name, wanted) {
  const set = new Set(nameList(list))
  if (wanted) set.delete(name)
  else set.add(name)
  return [...set].sort()
}

/** The live Agent context: the scope that carries the core tools. */
function agentScope(ctx) {
  try {
    const agents = serviceOf(ctx, 'agents')
    const list = typeof agents?.list === 'function' ? agents.list() : []
    const agent = Array.isArray(list) ? list[0] : undefined
    // schemas(scope) takes the Agent itself, the same argument the applied
    // proof already passes; handing it  gent.ctx silently lists the Host rows.
    return agent
  } catch {
    return undefined
  }
}

/** The names `tools.restrict()` would accept, or null when unreadable. */
function restrictableOf(ctx, scope) {
  try {
    const tools = serviceOf(ctx, 'tools')
    if (tools === undefined || typeof tools.view !== 'function') return null
    const view = tools.view(scope)
    const names = view?.restrictableNames
    if (names !== undefined && names !== null && typeof names.has === 'function' && typeof names[Symbol.iterator] === 'function') {
      return names instanceof Set ? names : new Set(names)
    }
  } catch { /* private API moved: report rows as toggleable and let the denied call decide */ }
  return null
}

/** Server names declared in the profile: longest first, for prefix matching. */
function declaredServerNames(ctx) {
  const out = []
  try {
    for (const entry of readEntries(ctx).rows) {
      if (entry.name !== MCP_CLIENT_PACKAGE) continue
      const name = asString(entry.config?.serverName)
      if (name !== undefined && !out.includes(name)) out.push(name)
    }
  } catch { /* no loader */ }
  out.sort((a, b) => b.length - a.length)
  return out
}

/** Heuristic size of one tool definition, matching the harness' token meter. */
function estimateSchemaTokens(schema) {
  try {
    return Math.ceil(JSON.stringify(schema).length / CHARS_PER_TOKEN)
  } catch {
    return 0
  }
}

/** Heuristic size of a character count, matching the harness' token meter. */
function estimateCharsTokens(chars) {
  const value = typeof chars === 'number' && Number.isFinite(chars) ? chars : 0
  return value > 0 ? Math.ceil(value / CHARS_PER_TOKEN) : 0
}

/** Heuristic size of plain text (a skill body, a catalog line…). */
function estimateTextTokens(text) {
  const value = typeof text === 'string' ? text : ''
  if (value.length === 0) return 0
  return Math.ceil(value.length / CHARS_PER_TOKEN)
}

/**
 * Read the front matter of one SKILL.md.
 *
 * The body is the whole file: that is what the model receives when the skill is
 * loaded, so its size is what the skill costs.
 */
function readSkillFile(file) {
  let text = ''
  try {
    if (statSync(file).size > 2_000_000) return undefined
    text = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
  const folder = file.replace(/[\\/][^\\/]+$/, '')
  const name = folder.split(/[\\/]/).pop() ?? ''
  const declared = /^---\s*$([\s\S]*?)^---\s*$/m.exec(text)
  const meta = declared === null ? '' : declared[1]
  const field = (key) => {
    const hit = new RegExp('^' + key + '\\s*:\\s*(.+)$', 'm').exec(meta)
    if (hit === null) return undefined
    return hit[1].trim().replace(/^['"]|['"]$/g, '')
  }
  return {
    name: field('name') ?? name,
    description: field('description') ?? '',
    path: file,
    chars: text.length,
  }
}

/** SKILL.md files under `dir`, depth-limited, skipping nested node_modules. */
function skillFilesIn(dir, depth, out) {
  if (depth > 4) return out
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' && depth > 0) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) skillFilesIn(full, depth + 1, out)
    else if (entry.name === 'SKILL.md') {
      const skill = readSkillFile(full)
      if (skill !== undefined) out.push(skill)
    }
  }
  return out
}

/**
 * Every skill file the panel's Global list can show: the user's own skills
 * (`<dshHome>/skills`) and the ones plugin packages ship
 * (`<profile>/node_modules/<package>/…/SKILL.md`).
 */
function skillFilesOnDisk() {
  const found = []
  skillFilesIn(join(dshHome(), 'skills'), 1, found)
  let profiles = []
  try {
    profiles = readdirSync(join(dshHome(), 'profiles'), { withFileTypes: true })
  } catch {
    profiles = []
  }
  for (const profile of profiles) {
    if (!profile.isDirectory()) continue
    const modules = join(dshHome(), 'profiles', profile.name, 'node_modules')
    let entries = []
    try {
      entries = readdirSync(modules, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const root = join(modules, entry.name)
      if (entry.name.startsWith('@')) {
        let scoped = []
        try {
          scoped = readdirSync(root, { withFileTypes: true })
        } catch {
          scoped = []
        }
        for (const inner of scoped) {
          if (inner.isDirectory()) skillFilesIn(join(root, inner.name), 1, found)
        }
      } else skillFilesIn(root, 1, found)
    }
  }
  return found
}

/**
 * The skill catalog, priced two ways: how much a skill costs once its body is
 * loaded, and how much its catalog line already costs on every request.
 */
async function skillsPayload(ctx) {
  const skills = serviceOf(ctx, 'skills')
  const merged = new Map()
  // Files first: that is what the panel lists, including the user's own skills
  // and the ones plugin packages ship.
  for (const file of skillFilesOnDisk()) {
    if (merged.has(file.name)) continue
    merged.set(file.name, {
      name: file.name,
      description: asString(file.description, 200) ?? '',
      source: 'filesystem',
      provider: 'files',
      chars: file.chars,
      tokens: estimateCharsTokens(file.chars),
      catalog: 0,
    })
  }
  // Then the registry, one view per live Agent plus the global one. The panel
  // reads a skill's scope as the Agent itself (`registry.list({ cwd, scope })`),
  // and a preset's bundled skills only appear in that Agent's layer: a single
  // global view listed six file skills out of the thirteen the page shows.
  if (skills !== undefined && typeof skills.list === 'function') {
    const views = []
    try {
      const agents = serviceOf(ctx, 'agents')
      const live = typeof agents?.list === 'function' ? agents.list() : []
      for (const agent of Array.isArray(live) ? live : []) {
        if (agent === null || typeof agent !== 'object') continue
        let cwd
        try {
          const session = serviceOf(ctx, 'sessions')?.get?.(agent.id)
          if (typeof session?.header?.cwd === 'string' && session.header.cwd !== '') cwd = session.header.cwd
        } catch {
          cwd = undefined
        }
        views.push({ scope: agent, cwd })
      }
    } catch { /* no live Agent: the global view below still runs */ }
    views.push({ scope: undefined, cwd: undefined })
    for (const view of views) {
      const options = view.cwd === undefined ? { scope: view.scope } : { scope: view.scope, cwd: view.cwd }
      let summaries = []
      try {
        summaries = await skills.list(options)
      } catch {
        continue
      }
      for (const summary of Array.isArray(summaries) ? summaries : []) {
        const name = asString(summary?.name)
        if (name === undefined) continue
        const previous = merged.get(name)
        const description = asString(summary?.description, 200) ?? previous?.description ?? ''
        let chars = previous?.chars ?? 0
        try {
          const definition = typeof skills.get === 'function' ? await skills.get(name, options) : undefined
          if (typeof definition?.content === 'string') chars = definition.content.length
        } catch { /* keep the file size when the body cannot be loaded */ }
        merged.set(name, {
          name,
          description,
          source: asString(summary?.source) ?? previous?.source ?? 'runtime',
          provider: asString(summary?.provider) ?? previous?.provider ?? '',
          chars,
          tokens: estimateCharsTokens(chars),
          catalog: 0,
        })
      }
    }
  }
  const rows = [...merged.values()]
  for (const row of rows) row.catalog = estimateTextTokens(row.name + ' ' + row.description)
  rows.sort((a, b) => a.name.localeCompare(b.name))
  if (rows.length === 0) {
    return { ok: false, kind: 'skills', error: 'no skill file was found', skills: [] }
  }
  return {
    ok: true,
    kind: 'skills',
    generatedAt: new Date().toISOString(),
    summary: {
      skills: rows.length,
      tokens: rows.reduce((total, row) => total + row.tokens, 0),
      catalog: rows.reduce((total, row) => total + row.catalog, 0),
      loaded: rows.filter((row) => row.chars > 0).length,
    },
    skills: rows,
  }
}

/**
 * The exact definition the model receives, pretty-printed for the expanded row.
 *
 * Only the three model-visible fields are kept: that is what the schema really
 * costs and what the model actually reads.
 */
function definitionText(schema) {
  try {
    const visible = {
      name: schema.name,
      description: typeof schema.description === 'string' ? schema.description : '',
      parameters: schema.parameters,
    }
    const text = JSON.stringify(visible, null, 2)
    return {
      definition: text.length > TOOL_TEXT_LIMIT ? text.slice(0, TOOL_TEXT_LIMIT) : text,
      definitionTruncated: text.length > TOOL_TEXT_LIMIT,
    }
  } catch {
    return { definition: '', definitionTruncated: false }
  }
}

/* -------------------------------------------------------------------------- */
/* Plugin attribution by name (heuristic)                                      */
/* -------------------------------------------------------------------------- */

/** Package words that identify no plugin: they appear in half of them. */
const GENERIC_WORDS = new Set([
  'dsh', 'tool', 'tools', 'client', 'ui', 'host', 'plugin', 'plugins', 'local', 'experimental',
  'bundle', 'preset', 'app', 'core', 'api', 'registry', 'provider', 'system', 'prompt', 'session',
  'agent', 'goal', 'plan', 'jobs', 'skill', 'mcp', 'web', 'fs', 'harness', 'index', 'dist', 'src',
  'deepseek', 'openai', 'node', 'http', 'https', 'github', 'main',
])

/** Strip the npm scope so the tag stays readable. */
function shortPluginName(name) {
  const text = asString(name, 120)
  if (text === undefined) return undefined
  const slug = text.split('/').pop()
  return slug.replace(/\.js$/i, '')
}

/** Significant words of a package name, in package order. */
function wordsOfPackage(name) {
  const base = String(name).split('/').pop().replace(/\.js$/i, '').replace(/^dsh-/, '')
  const words = []
  for (const word of base.split(/[-_]/)) {
    const token = word.toLowerCase()
    if (token.length < 4 || GENERIC_WORDS.has(token) || words.includes(token)) continue
    words.push(token)
  }
  return { base: base.toLowerCase(), words }
}

/**
 * Candidate plugins to attribute a name to, built from the live composition.
 *
 * This is a heuristic and says so: it only uses package words, so a tool whose
 * name shares nothing with its plugin stays untagged instead of being guessed.
 */
function ownerTable(ctx) {
  const table = []
  try {
    for (const entry of readEntries(ctx).rows) {
      if (entry.disabled === true) continue
      const name = entry.name
      if (typeof name !== 'string' || name.length === 0) continue
      if (name.startsWith('file:') || name.includes('\\')) continue
      const parsed = wordsOfPackage(name)
      if (parsed.words.length === 0) continue
      table.push({
        name,
        base: parsed.base,
        words: parsed.words,
        primary: parsed.words[0],
        last: parsed.words[parsed.words.length - 1],
      })
    }
  } catch { /* no loader: nothing is tagged */ }
  return table
}

/** Words of a tool or section name, for whole-word comparisons. */
function nameWords(name) {
  return String(name).toLowerCase().split(/[:_-]/).filter((word) => word.length > 0)
}

/**
 * Tools whose owner the name cannot reveal, checked against the installed
 * package rather than guessed: `dsh-free-search` ships `lib/research.js` and
 * `lib/weather.js` and registers exactly these names.
 */
const TOOL_OWNER_HINTS = {
  research: 'dsh-free-search',
  weather: 'dsh-free-search',
}

/**
 * Best-effort plugin for one tool (`tool`) or prompt section (`section`).
 *
 * Strong signals only: the name starts with a package word, or a section's
 * prefix does, or one long package word appears verbatim in the name. Two
 * different plugins matching just as well means no tag at all — except that an
 * installed plugin beats a first-party package, since the first-party web
 * search provider shares the word "search" with a third-party search plugin.
 */
function guessOwner(kind, name, table) {
  const parts = nameWords(name)
  const lower = String(name).toLowerCase()
  const slug = lower.replace(/_/g, '-')
  const prefix = lower.split(':')[0].replace(/-/g, '_')
  const last = parts[parts.length - 1]
  const matches = []
  for (const entry of table) {
    if (entry.base === slug) { matches.push({ plugin: entry.name, token: slug, score: 5 }); continue }
    if (entry.base === 'tool-' + slug) { matches.push({ plugin: entry.name, token: slug, score: 4 }); continue }
    for (const token of entry.words) {
      let score = 0
      // Only the package's own leading word may act as a prefix: otherwise a
      // generic tail ("cache", "domain", "platform") tags unrelated tools.
      if (token === entry.primary) {
        if (kind === 'tool') {
          if (lower.startsWith(token + '_')) score = 3
          else if (parts.includes(token) && token.length >= 6) score = 2
        } else {
          if (prefix === token || prefix.startsWith(token + '_')) score = 3
          else if (parts.includes(token) && token.length >= 6) score = 2
        }
      } else if (token === entry.last && token === last && token.length >= 6) {
        // The name ends with the plugin's own last word ("*_search" -> free-search).
        score = 2
      }
      if (score > 0) matches.push({ plugin: entry.name, token, score })
    }
  }
  if (matches.length === 0) return undefined
  const thirdParty = (plugin) => !String(plugin).startsWith('@deepseek-ai/')
  matches.sort((a, b) => (b.score - a.score)
    || (b.token.length - a.token.length)
    || (thirdParty(a.plugin) === thirdParty(b.plugin) ? 0 : (thirdParty(a.plugin) ? -1 : 1))
    || a.plugin.localeCompare(b.plugin))
  const best = matches[0]
  const rival = matches[1]
  if (rival !== undefined && rival.score === best.score && rival.token === best.token
    && thirdParty(rival.plugin) === thirdParty(best.plugin)) return undefined
  return shortPluginName(best.plugin)
}

/**
 * Attribution for the sections an MCP server publishes.
 *
 * The section name is the server, and the inventory already knows which plugin
 * mounts it, so this one is not a guess at all.
 */
function mcpSectionOwner(serverName, table, serversOf) {
  if (serverName === RESOURCE_BRIDGE_NAME) return shortPluginName(RESOURCE_BRIDGE_PACKAGE)
  try {
    const row = serversOf().find((server) => server.name === serverName)
    if (row !== undefined) {
      if (typeof row.provider === 'string' && row.provider.length > 0) return shortPluginName(row.provider)
      if (row.source === 'profile') return shortPluginName(MCP_CLIENT_PACKAGE)
    }
  } catch { /* fall through to the name heuristic */ }
  return guessOwner('section', 'mcp:' + serverName, table)
}

/** Every public tool the profile can present, one row each. */
async function toolsPayload(ctx, state, wantApplied) {
  // The core tools live in the Agent scope, not the Host one: reading without a
  // scope lists only the plugin-registered tools and under-reports the budget.
  // A tool that only one preset registers is invisible to every other view too,
  // so the payload unions the Host scope, every declared preset and every live
  // Agent, and remembers which presets contributed each name.
  const directory = await scopeDirectory(ctx)
  const collected = new Map()
  let available = false
  const absorb = (rows, label, global) => {
    for (const schema of rows) {
      if (schema === null || typeof schema !== 'object' || typeof schema.name !== 'string') continue
      let entry = collected.get(schema.name)
      if (entry === undefined) {
        entry = { schema, presets: new Set(), global: false }
        collected.set(schema.name, entry)
      }
      if (global === true) entry.global = true
      if (typeof label === 'string' && label.length > 0) entry.presets.add(label)
    }
  }

  try {
    const hosted = readSchemas(ctx)
    available = hosted.available
    absorb(hosted.rows, undefined, true)
    for (const preset of directory.presets) {
      if (preset.key === undefined) continue
      const scoped = readSchemas(ctx, preset.key)
      available = available || scoped.available
      absorb(scoped.rows, preset.id, false)
    }
    for (const entry of directory.agents) {
      const scoped = readSchemas(ctx, entry.agent)
      available = available || scoped.available
      absorb(scoped.rows, entry.id, false)
    }
  } finally {
    await releaseDirectory(directory)
  }

  const declared = declaredServerNames(ctx)
  const restrictable = restrictableAcross(ctx, directory)
  const off = new Set(toolNamesOff(state))
  const table = ownerTable(ctx)
  // One effective switch set per preset, reused for every row, so the tab can
  // render a preset's own state without a per-row recomputation.
  const presetOff = new Map()
  for (const id of directory.ids) presetOff.set(id, offSetForPreset(state, id, 'tools'))

  const rows = []
  for (const [name, entry] of collected) {
    const schema = entry.schema
    const server = RESOURCE_TOOLS.includes(name)
      ? RESOURCE_BRIDGE_NAME
      : serverOfTool(name, declared)
    // MCP servers already have their own section in the panel, with a card and
    // a per-server switch: this tab only covers the harness' own tools.
    if (server !== undefined) continue
    const presets = [...entry.presets].sort()
    // Coverage decides the tag: a host-registered tool can still be missing
    // from a preset with a narrower tool set.
    const inAll = directory.total > 0 && presets.length >= directory.total
    const conditional = !inAll && presets.length > 0
    const owner = hintedOwner(ctx, name, table)
    rows.push({
      ...definitionText(schema),
      name,
      group: owner ?? UNATTRIBUTED,
      description: asString(schema.description, 220) ?? '',
      tokens: estimateSchemaTokens(schema),
      enabled: !off.has(name),
      owner,
      serverDisabled: false,
      locked: restrictable !== null && !restrictable.has(name),
      presets,
      presetsOff: presetOffList(presetOff, name),
      conditional,
      inAll,
      scope: entry.global === true ? 'global' : 'preset',
    })
  }
  // Plugin groups first, alphabetical; the tools no plugin claims go last.
  rows.sort(compareGroups)

  const groups = groupsOf(rows)

  const result = {
    ok: true,
    kind: 'tools',
    generatedAt: new Date().toISOString(),
    summary: {
      tools: rows.length,
      on: rows.filter((row) => row.enabled).length,
      off: rows.filter((row) => !row.enabled).length,
      tokens: rows.reduce((sum, row) => sum + (row.enabled ? row.tokens : 0), 0),
      restricted: rows.filter((row) => row.locked).length,
      conditional: rows.filter((row) => row.conditional).length,
      presetTotals: presetTotalsOf(rows, directory.ids, agentCountsOf(directory), directory.names),
      presets: directory.total,
    },
    groups,
    tools: rows,
    presets: [...directory.ids].sort(),
    presetNames: Object.fromEntries(directory.names),
    diagnostics: {
      schemasAvailable: available,
      restrictable: restrictable === null ? null : restrictable.size,
      switchedOff: [...off].length,
      scoped: directory.presets.length,
      agents: directory.agents.length,
      directoryError: directory.error,
      owned: rows.filter((row) => row.owner !== undefined).length,
    },
  }
  if (wantApplied === true) {
    result.applied = appliedTools(
      ctx,
      (agentId) => [...offSetForPreset(state, presetIdOfAgentId(ctx, agentId), 'tools')],
    )
  }
  return result
}

/**
 * Proof of effect for the route: the schema set each live Agent would receive
 * right now. A switched-off tool listed under `visible` was not denied (it is
 * not restrictable), which the row already reports as `locked`.
 */
function appliedTools(ctx, offFor) {
  const tools = serviceOf(ctx, 'tools')
  if (tools === undefined || typeof tools.schemas !== 'function') return { agents: 0, error: 'no tools service' }
  let agents = []
  try {
    const list = serviceOf(ctx, 'agents')?.list?.()
    if (Array.isArray(list)) agents = list
  } catch { agents = [] }

  // Every name any Agent switches off, so one name denied in one preset still
  // reports as visible in the others instead of disappearing from the proof.
  const targets = []
  const union = new Set()
  for (const agent of agents) {
    if (agent === null || typeof agent !== 'object') continue
    let off = []
    try {
      off = offFor(agent.id) ?? []
    } catch { off = [] }
    for (const name of off) union.add(name)
    targets.push({ agent, off: new Set(off) })
  }
  if (union.size === 0) return { agents: 0, hidden: [], visible: [] }

  const hidden = new Map()
  const visible = new Map()
  const errors = []
  let count = 0
  for (const { agent, off } of targets) {
    count += 1
    let names
    try {
      names = new Set()
      for (const schema of tools.schemas(agent) ?? []) {
        if (schema !== null && typeof schema === 'object' && typeof schema.name === 'string') names.add(schema.name)
      }
    } catch (error) {
      errors.push(String(error?.message ?? error).slice(0, 180))
      continue
    }
    for (const name of union) {
      // Still denied here but already switched back on: it stays visible.
      const denied = off.has(name) && !names.has(name)
      const map = names.has(name) ? visible : (denied ? hidden : visible)
      map.set(name, (map.get(name) ?? 0) + 1)
    }
  }
  return {
    agents: count,
    hidden: [...hidden.keys()].filter((name) => (visible.get(name) ?? 0) === 0).sort(),
    visible: [...visible.keys()].sort(),
    partial: [...hidden.keys()].filter((name) => (visible.get(name) ?? 0) > 0).sort(),
    errors: errors.slice(0, 4),
  }
}

/** Tool owner: an explicit, verified hint first, then the name heuristic. */
function hintedOwner(ctx, toolName, table) {
  const hint = TOOL_OWNER_HINTS[toolName]
  if (hint !== undefined) {
    // Only trust the hint while that plugin is actually loaded.
    const known = table.some((entry) => String(entry.name).split('/').pop() === hint)
    if (known) return hint
  }
  return guessOwner('tool', toolName, table)
}

/** The prompt registry, read without running an assembly. */
function promptRegistry(ctx) {
  const prompt = serviceOf(ctx, 'systemPrompt')
  const out = { available: prompt !== undefined, map: new Map(), error: null }
  if (prompt === undefined) return out
  try {
    const layers = prompt.layers
    if (layers !== undefined && layers !== null && typeof layers.merge === 'function') {
      for (const [name, section] of layers.merge(undefined, (layer) => layer.sections)) {
        if (typeof name === 'string' && section !== null && typeof section === 'object') out.map.set(name, section)
      }
    }
  } catch (error) {
    out.error = String(error?.message ?? error).slice(0, 240)
  }
  return out
}

/**
 * One-line description of a prompt section, for the page tab.
 *
 * Known sections get a hand-written sentence; anything a plugin contributes
 * later falls back to the first line of its own text so the row is never bare.
 */
function describeSection(name, text) {
  const fixed = {
    'harness:identity': 'Fixed opener: the identity the harness gives the model.',
    'deployment:persona-prefix': 'Persona text rendered before the harness guidance.',
    'deployment:persona-suffix': 'Persona text rendered after the harness guidance.',
    'plan:policy': 'Plan-mode policy; empty unless plan mode is active.',
    'team:policy': 'Rules the agent team is expected to follow.',
    'tools:ptc-only': 'How the code-execution transport is used.',
    'tools:sdk': 'Generated SDK documentation for the tools of this step.',
    'context:file-reference': 'How @file references are resolved.',
    'mcp-resource-servers': 'Instructions for the MCP resource tools.',
    'ui:deliverable-file-references': 'How deliverable file references are presented.',
    'harness:source': 'Where this harness build keeps its source.',
    'app:web-surface': 'Which web surface this session runs in.',
    'free-search:engines': 'The configured search engines and how to query them.',
  }
  if (Object.hasOwn(fixed, name)) return fixed[name]
  if (name.startsWith('mcp:')) return 'Instructions published by the MCP server ' + name.slice(4) + '.'
  if (name.startsWith('tool:')) return 'Guidance for using the ' + name.slice(5) + ' tool.'
  if (name.startsWith('context:')) return 'Runtime context ' + name.slice(8) + '.'
  const body = typeof text === 'string' ? text : ''
  const first = body.split('\n').map((line) => line.trim()).find((line) => line.length > 0)
  if (first !== undefined) return first.length > 150 ? first.slice(0, 147) + '\u2026' : first
  return 'Prompt section contributed by a plugin.'
}

/**
 * Every Agent preset the profile declares, plus the live Agents that run one.
 *
 * A bare `assemble({})` only evaluates global providers, so a preset that
 * registers its sections, runtime contexts and generated tool documentation
 * inside its own scope is invisible to it — which is why the page reported a
 * small fraction of the real prompt. `acquireScope()` reads one preset's live
 * registrations without starting an Agent, so the payload can describe every
 * declared preset, including the ones no conversation uses, and say which
 * presets provide each row.
 *
 * Each lease is released by `releaseDirectory` once the payload has read it.
 */
async function scopeDirectory(ctx) {
  const out = {
    presets: [],
    agents: [],
    names: new Map(),
    ids: new Set(),
    roster: [],
    total: 0,
    error: null,
  }
  const service = serviceOf(ctx, 'agentPresets')

  // 1. The selection roster: exactly the presets the UI offers.
  //
  //    `list()` also returns every declaration, which includes rows a user never
  //    sees in the picker; naming one of those would put a preset in a tag that
  //    the user cannot select. `remoteExportList()` is the roster, so it wins
  //    whenever the Host exposes it.
  let declared = []
  try {
    if (service !== undefined && typeof service.remoteExportList === 'function') {
      const roster = await service.remoteExportList()
      declared = Array.isArray(roster?.presets) ? roster.presets : []
    } else if (service !== undefined && typeof service.list === 'function') {
      declared = await service.list()
    }
  } catch (error) {
    out.error = errorTextOf(error)
  }
  const seen = new Set()
  for (const preset of Array.isArray(declared) ? declared : []) {
    if (preset === null || typeof preset !== 'object') continue
    const id = asString(preset.id)
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    // A preset that cannot compose a session is not a choice the user can
    // make: the picker hides it, so the tags do too.
    if (asString(preset.broken) !== undefined) continue
    // A shipped preset publishes no name; the Browser half owns those labels,
    // so an absent name stays absent instead of collapsing to the raw id.
    const published = asString(preset.name)
    if (published !== undefined) out.names.set(id, published)
    out.roster.push(id)
    // The id counts as a preset even when no scope can be acquired for it.
    out.ids.add(id)
    if (preset.isDefault === true) out.isDefault = id
  }

  // 2. One read-only scope per preset: the only view of registrations that no
  //    live conversation carries yet.
  if (service !== undefined && typeof service.acquireScope === 'function') {
    for (const id of out.roster) {
      if (out.presets.length >= MAX_PRESETS) break
      const entry = { id, key: undefined, lease: undefined, error: null }
      try {
        const lease = await service.acquireScope(id)
        entry.key = lease?.key
        entry.lease = lease
      } catch (error) {
        entry.error = errorTextOf(error)
      }
      out.presets.push(entry)
      out.ids.add(id)
    }
  }

  // 3. Live Agents: a running conversation may hold a preset outside the roster.
  let live = []
  try {
    live = serviceOf(ctx, 'agents')?.list?.() ?? []
  } catch {
    live = []
  }
  for (const agent of Array.isArray(live) ? live : []) {
    if (agent === null || typeof agent !== 'object') continue
    const id = presetIdOf(agent, service)
    out.agents.push({ agent, id })
    if (id !== null) out.ids.add(id)
  }
  out.total = out.ids.size
  return out
}

/**
 * The preset one live Agent runs.
 *
 * `composedPreset` reads the revision the Agent is bound to, the Session
 * projects the selection the conversation recorded, and the header keeps that
 * selection even when the preset left the roster. Any of the three may be
 * unavailable on a minimal host, so each is tried in turn.
 */
function presetIdOf(agent, service) {
  const read = (source) => {
    try {
      const value = source()
      return typeof value === 'string' && value.length > 0 ? value : undefined
    } catch {
      return undefined
    }
  }
  if (service !== undefined && agent.ctx !== undefined) {
    const bound = read(() => service.composedPreset(agent.ctx))
    if (bound !== undefined) return bound
  }
  if (service !== undefined && agent.session !== undefined) {
    const selected = read(() => service.presetForSession(agent.session))
    if (selected !== undefined) return selected
  }
  const recorded = read(() => agent.session?.header?.agentPreset)
  return recorded ?? null
}

/** Release the scope leases `scopeDirectory` acquired; failures are harmless. */
async function releaseDirectory(directory) {
  for (const preset of directory?.presets ?? []) {
    const lease = preset.lease
    preset.lease = undefined
    if (lease === undefined || lease === null) continue
    try {
      const dispose = lease[Symbol.asyncDispose] ?? lease.dispose
      if (typeof dispose === 'function') await dispose.call(lease)
    } catch { /* a lease that will not close must not fail the page */ }
  }
}

/** The names `tools.restrict()` accepts in every live Agent, or null. */
function restrictableAcross(ctx, directory) {
  const tools = serviceOf(ctx, 'tools')
  if (tools === undefined || typeof tools.view !== 'function') return null
  const scopes = []
  for (const entry of directory?.agents ?? []) scopes.push(entry.agent)
  if (scopes.length === 0) {
    const only = agentScope(ctx)
    if (only !== undefined) scopes.push(only)
  }
  const union = new Set()
  let read = 0
  for (const scope of scopes) {
    let names
    try {
      names = tools.view(scope)?.restrictableNames
    } catch {
      continue
    }
    if (names === undefined || names === null || typeof names[Symbol.iterator] !== 'function') continue
    read += 1
    try {
      for (const name of names) union.add(name)
    } catch { /* oddly shaped set: keep what was read */ }
  }
  return read === 0 ? null : union
}

/**
 * Tokens one preset actually assembles, from the rows the payload already has.
 *
 * The payload's own total is the union of every preset, which overstates any
 * single conversation: this says what each preset really sends, so a number the
 * model reports for one conversation can be matched to a row here.
 */
function presetTotalsOf(rows, ids, agentCounts, names) {
  const out = []
  for (const id of [...ids].sort()) {
    let tokens = 0
    let active = 0
    for (const row of rows) {
      if (row.enabled !== true) continue
      const scope = row.scope === 'global' || (Array.isArray(row.presets) && row.presets.includes(id))
      if (!scope) continue
      tokens += row.tokens
      active += 1
    }
    // How many live conversations actually run this preset. A declared preset
    // with none is real but unused, which is worth saying instead of leaving a
    // name the reader cannot place.
    // The id travels too: a built-in preset publishes no name, and the client
    // owns the localized display text for those.
    out.push({ id, name: names?.get(id) ?? null, tokens, rows: active, agents: agentCounts?.get(id) ?? 0 })
  }
  return out
}

/** Live Agents per preset label. */
function agentCountsOf(directory) {
  const counts = new Map()
  for (const entry of directory?.agents ?? []) {
    if (entry.id === null || entry.id === undefined) continue
    counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1)
  }
  return counts
}

/**
 * Per-preset token weights, for the New Session agent-preset menu.
 *
 * The shipped chips are outside our slots, so the Client half decorates their
 * menu instead of replacing it; this is the data that decoration needs: what
 * each preset actually assembles as prompt plus tool declarations.
 */
/**
 * The agent manager's data: one row per Agent, with what it actually costs and
 * what it can call.
 *
 * DSH has no project-scoped preset — a declaration belongs to the profile, the
 * same way a bundle does — so the only real split is "shipped" versus
 * "declared here". The payload says so instead of inventing a scope.
 */
/**
 * Descriptions of the shipped presets.
 *
 * A shipped declaration publishes neither a name nor a description — the
 * shipped settings surface prints them from its own dictionary. The panel
 * shows the same wording rather than an empty line, and only ever for the four
 * ids below; a custom Agent uses whatever it declares.
 */
const BUILTIN_PRESET_DESCRIPTIONS = {
  standard: 'Work with code, files, and information. Suitable for most tasks, with search, editing, terminal commands, and other tools available as needed.',
  ptc: 'Includes all Standard mode capabilities. Better suited to tasks that call tools in batches and then filter, organize, deduplicate, count, or summarize the results.',
  minimal: 'The agent uses a terminal and image reading, with context compaction. Useful for testing and comparing its basic performance.',
  cordis: 'Customize DSH through conversation. Let the agent write plugins that add features or UI, or combine tools and prompts to create your own mode.',
}

/**
 * The scope and type an Agent gets when the user has not chosen one.
 *
 * Both are conventions rather than facts: a shipped preset is an Agent, and a
 * preset whose id belongs to a workflow bundle is the sub-agent that workflow
 * delegates to. Everything else starts as a global Agent.
 */
/**
 * Presets declared as a workflow's sub-agents.
 *
 * Named one by one rather than matched by prefix: the dsh-openfox patch
 * describes `openfox-planner` and `openfox-builder` as *agents* ("the OpenFox
 * planner agent", "the OpenFox builder agent") and only these three as
 * sub-agents. A prefix rule got that wrong.
 */
const SUBAGENT_PRESET_IDS = new Set([
  'openfox-verifier',
  'openfox-code-reviewer',
  'openfox-explorer',
])

function defaultPresetMeta(id) {
  return { scope: 'global', kind: SUBAGENT_PRESET_IDS.has(id) ? 'subagent' : 'agent' }
}

/** The workspace that identifies "this project", or null when unknown. */
function currentProject(ctx) {
  for (const name of ['workspace', 'uiWorkspace', 'workspaces']) {
    const service = serviceOf(ctx, name)
    if (service === undefined) continue
    try {
      const value = typeof service.current === 'function' ? service.current() : service.current
      const path = typeof value === 'string' ? value : value?.root
      if (typeof path === 'string' && path.length > 0) return path
    } catch { /* next service */ }
  }
  try {
    const stored = ctx.get('workspace')?.list?.()
    if (Array.isArray(stored) && typeof stored[0] === 'string') return stored[0]
  } catch { /* unknown */ }
  return null
}

async function agentsPayload(ctx, state) {
  const directory = await scopeDirectory(ctx)
  const service = serviceOf(ctx, 'agentPresets')

  // Published metadata, so names and descriptions come from the declaration
  // rather than from a hard-coded table.
  const meta = new Map()
  let rosterError = null
  try {
    const rows = service !== undefined && typeof service.list === 'function'
      ? await service.list()
      : []
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row === null || typeof row !== 'object' || typeof row.id !== 'string') continue
      meta.set(row.id, row)
    }
  } catch (error) {
    rosterError = errorTextOf(error)
  }

  // Token cost per agent: the same totals the preset menu shows.
  const [prompts, tools] = await Promise.all([
    promptsPayload(ctx, state).catch(() => null),
    toolsPayload(ctx, state).catch(() => null),
  ])
  const promptTotals = new Map()
  for (const entry of prompts?.summary?.presetTotals ?? []) promptTotals.set(entry.id, entry.tokens ?? 0)
  const toolTotals = new Map()
  for (const entry of tools?.summary?.presetTotals ?? []) toolTotals.set(entry.id, entry.tokens ?? 0)

  // Which tools each Agent can call: the tool rows already carry the presets
  // that produce them, so this is a filter, not a second scan.
  const toolsByAgent = new Map()
  for (const row of tools?.tools ?? []) {
    for (const id of Array.isArray(row.presets) ? row.presets : []) {
      if (!toolsByAgent.has(id)) toolsByAgent.set(id, [])
      toolsByAgent.get(id).push(row.name)
    }
  }

  const rows = []
  for (const id of directory.roster) {
    const declared = meta.get(id) ?? {}
    const promptTokens = promptTotals.get(id) ?? 0
    const toolTokens = toolTotals.get(id) ?? 0
    // A shipped preset publishes no name: the Browser half owns its label.
    const builtIn = typeof declared.name !== 'string' || declared.name.length === 0
    rows.push({
      id,
      name: typeof declared.name === 'string' ? declared.name : null,
      description: typeof declared.description === 'string' && declared.description.length > 0
        ? declared.description
        : (BUILTIN_PRESET_DESCRIPTIONS[id] ?? null),
      order: typeof declared.order === 'number' ? declared.order : null,
      builtIn,
      isDefault: declared.isDefault === true || directory.isDefault === id,
      broken: typeof declared.broken === 'string' ? declared.broken : null,
      promptTokens,
      toolTokens,
      totalTokens: promptTokens + toolTokens,
      tools: (toolsByAgent.get(id) ?? []).sort(),
      // MCP servers this Agent forces on, whatever the profile says.
      pinnedMcp: pinnedServersFor(state, id),
      // Editable only when this panel owns the declaration. A preset shipped
      // by DSH, or declared by an installed bundle, is restored by its bundle
      // on the next load, so pretending to edit it would be a lie.
      editable: Array.isArray(state?.userAgents) && state.userAgents.includes(id),
      ...(() => {
        const stored = state?.presetMeta !== null && typeof state?.presetMeta === 'object' ? state.presetMeta[id] : undefined
        const fallback = defaultPresetMeta(id)
        return {
          scope: stored?.scope ?? fallback.scope,
          kind: stored?.kind ?? fallback.kind,
        }
      })(),
    })
  }
  rows.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999) || a.id.localeCompare(b.id))

  return {
    ok: true,
    kind: 'agents',
    generatedAt: new Date().toISOString(),
    agents: rows,
    builtInAgents: rows.filter((row) => row.builtIn).map((row) => row.id),
    customAgents: rows.filter((row) => !row.builtIn).map((row) => row.id),
    scope: {
      global: 'the profile: every agent declared in this dsh profile',
      project: null,
      note: 'DSH declares presets per profile; a project-scoped preset does not exist.',
    },
    error: rosterError ?? directory.error ?? null,
    project: currentProject(ctx),
    groups: {
      globalAgents: rows.filter((row) => row.scope === 'global' && row.kind === 'agent').map((row) => row.id),
      globalSubAgents: rows.filter((row) => row.scope === 'global' && row.kind === 'subagent').map((row) => row.id),
      projectAgents: rows.filter((row) => row.scope === 'project' && row.kind === 'agent').map((row) => row.id),
      projectSubAgents: rows.filter((row) => row.scope === 'project' && row.kind === 'subagent').map((row) => row.id),
    },
    summary: {
      agents: rows.length,
      builtIn: rows.filter((row) => row.builtIn).length,
      custom: rows.filter((row) => !row.builtIn).length,
    },
  }
}

async function presetsPayload(ctx, state) {
  const [prompts, tools] = await Promise.all([
    promptsPayload(ctx, state).catch((error) => ({ summary: {}, prompts: [], error: errorTextOf(error) })),
    toolsPayload(ctx, state).catch((error) => ({ summary: {}, tools: [], error: errorTextOf(error) })),
  ])
  const colors = AGENT_COLORS
  const chosen = state?.colors !== null && typeof state?.colors === 'object' ? state.colors : {}
  const byId = new Map()
  const touch = (id) => {
    if (!byId.has(id)) {
      byId.set(id, { id, name: null, promptTokens: 0, promptRows: 0, toolTokens: 0, toolRows: 0, agents: 0, color: null })
    }
    return byId.get(id)
  }
  for (const entry of prompts.summary?.presetTotals ?? []) {
    const row = touch(entry.id)
    row.promptTokens = entry.tokens
    row.promptRows = entry.rows
    row.agents = entry.agents ?? 0
    if (typeof entry.name === 'string') row.name = entry.name
  }
  for (const entry of tools.summary?.presetTotals ?? []) {
    const row = touch(entry.id)
    row.toolTokens = entry.tokens
    row.toolRows = entry.rows
    if (typeof entry.name === 'string' && row.name === null) row.name = entry.name
  }
  for (const row of byId.values()) {
    const picked = typeof chosen[row.id] === 'string' ? chosen[row.id] : null
    if (picked !== null) row.color = picked
  }
  return {
    ok: true,
    kind: 'presets',
    generatedAt: new Date().toISOString(),
    palette: colors,
    presets: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    summary: {
      presets: byId.size,
      promptTokens: prompts.summary?.tokens ?? 0,
      toolTokens: tools.summary?.tokens ?? 0,
      colors: Object.keys(chosen).length,
    },
  }
}

/**
 * Every system-prompt contribution, in the order the model receives it.
 *
 * Sections and runtime contexts are collected from three passes: the global
 * registry, every declared preset scope, and every live Agent. A row records
 * the presets that produce it, so the page can tag the rows only some presets
 * provide instead of silently hiding them.
 */
async function promptsPayload(ctx, state, wantApplied) {
  const prompt = serviceOf(ctx, 'systemPrompt')
  const registry = promptRegistry(ctx)
  const directory = await scopeDirectory(ctx)
  let assembled = false
  let assembleError = null

  const collected = new Map()
  const collect = (kind, name, text, order, dynamic, label, global) => {
    if (typeof name !== 'string' || name.length === 0) return
    const key = kind + '\u0000' + name
    let row = collected.get(key)
    if (row === undefined) {
      row = {
        kind,
        name,
        text: '',
        // Runtime contexts have no registered placement; they sort after the
        // sections of the same group so the reading order stays recognisable.
        order: Number.isFinite(order) ? order : 0,
        dynamic: false,
        presets: new Set(),
        global: false,
      }
      collected.set(key, row)
    }
    if (typeof text === 'string' && text.length > row.text.length) row.text = text
    if (dynamic === true) row.dynamic = true
    if (global === true) row.global = true
    if (typeof label === 'string' && label.length > 0) row.presets.add(label)
  }
  const absorb = (assembly, label, global) => {
    if (assembly === null || typeof assembly !== 'object') return
    for (const section of Array.isArray(assembly.sections) ? assembly.sections : []) {
      if (section === null || typeof section !== 'object' || typeof section.name !== 'string') continue
      const known = registry.map.get(section.name)
      collect('section', section.name, section.text, asNumber(known?.order), false, label, global)
    }
    for (const entry of Array.isArray(assembly.contexts) ? assembly.contexts : []) {
      if (entry === null || typeof entry !== 'object' || typeof entry.name !== 'string') continue
      collect('context', entry.name, entry.text, undefined, true, label, global)
    }
  }

  try {
    if (prompt !== undefined && typeof prompt.assemble === 'function') {
      // The global pass fixes what every preset inherits.
      try {
        absorb(await prompt.assemble({}), undefined, true)
        assembled = true
      } catch (error) {
        assembleError = errorTextOf(error)
      }
      // One pass per declared preset, including presets no conversation uses.
      for (const preset of directory.presets) {
        if (preset.key === undefined) continue
        try {
          absorb(await prompt.assemble({ scope: preset.key }), preset.id, false)
          assembled = true
        } catch (error) {
          preset.error = preset.error ?? errorTextOf(error)
        }
      }
      // A live Agent may run a preset outside the roster.
      for (const entry of directory.agents) {
        try {
          absorb(await prompt.assemble({ agent: entry.agent, scope: entry.agent }), entry.id, false)
          assembled = true
        } catch { /* one unreadable Agent must not blank the page */ }
      }
    }
  } finally {
    await releaseDirectory(directory)
  }

  // Without any successful assembly the registry still lists every section, so
  // the tab reports what it can rather than an empty page.
  if (!assembled) {
    for (const [name, section] of registry.map) {
      let text = ''
      let dynamic = false
      if (typeof section.text === 'string') text = section.text
      else if (typeof section.text === 'function') {
        dynamic = true
        try {
          const value = section.text({})
          if (typeof value === 'string') text = value
        } catch { /* context-dependent text: listed without a body */ }
      }
      collect('section', name, text, asNumber(section.order), dynamic, undefined, true)
    }
  }

  const off = new Set(promptNamesOff(state))
  const table = ownerTable(ctx)
  const presetOff = new Map()
  for (const id of directory.ids) presetOff.set(id, offSetForPreset(state, id, 'prompts'))
  // One inventory pass, and only when an MCP section actually asks for it.
  let servers = null
  const serversOf = () => {
    if (servers === null) {
      try { servers = inventory(ctx, new Set(), null, null).servers ?? [] } catch { servers = [] }
    }
    return servers
  }

  const rows = []
  for (const entry of collected.values()) {
    const body = typeof entry.text === 'string' ? entry.text : ''
    const presets = [...entry.presets].sort()
    // Coverage decides the tag, not where the row was registered: a globally
    // registered section can still be absent from a preset that replaces the
    // whole prompt, and saying "every agent" there would be wrong.
    const inAll = directory.total > 0 && presets.length >= directory.total
    const conditional = !inAll && presets.length > 0
    const owner = entry.kind === 'context'
      ? (guessOwner('section', entry.name, table) ?? UNATTRIBUTED)
      : entry.name === RESOURCE_BRIDGE_NAME
        ? shortPluginName(RESOURCE_BRIDGE_PACKAGE)
        : entry.name.startsWith('mcp:')
          ? mcpSectionOwner(entry.name.slice(4), table, serversOf)
          : entry.name.startsWith('tool:')
            // `tool:<name>` is the guidance of that tool: same owner as the tool.
            ? guessOwner('tool', entry.name.slice(5), table)
            : guessOwner('section', entry.name, table)
    const order = Number.isFinite(entry.order) ? entry.order : 0
    rows.push({
      name: entry.name,
      kind: entry.kind,
      order,
      sortKey: entry.kind === 'context' ? 100000 + order : order,
      tokens: Math.ceil(body.length / CHARS_PER_TOKEN),
      chars: body.length,
      empty: body.length === 0,
      dynamic: entry.dynamic,
      enabled: !off.has(entry.name),
      // Only a registered section can be shadowed by an empty one; a runtime
      // context follows the request and has no profile switch.
      locked: entry.kind !== 'section',
      description: describeSection(entry.name, body),
      owner,
      group: owner ?? UNATTRIBUTED,
      truncated: body.length > PROMPT_TEXT_LIMIT,
      text: body.length > PROMPT_TEXT_LIMIT ? body.slice(0, PROMPT_TEXT_LIMIT) : body,
      presets,
      presetsOff: presetOffList(presetOff, entry.name),
      conditional,
      inAll,
      scope: entry.global === true ? 'global' : 'preset',
    })
  }
  rows.sort(compareGroups)

  const result = {
    ok: true,
    kind: 'prompts',
    generatedAt: new Date().toISOString(),
    summary: {
      sections: rows.filter((row) => row.kind === 'section').length,
      contexts: rows.filter((row) => row.kind === 'context').length,
      on: rows.filter((row) => row.enabled).length,
      off: rows.filter((row) => !row.enabled).length,
      tokens: rows.reduce((sum, row) => sum + (row.enabled ? row.tokens : 0), 0),
      conditional: rows.filter((row) => row.conditional).length,
      presetTotals: presetTotalsOf(rows, directory.ids, agentCountsOf(directory), directory.names),
      presets: directory.total,
    },
    groups: groupsOf(rows),
    prompts: rows,
    presets: [...directory.ids].sort(),
    presetNames: Object.fromEntries(directory.names),
    diagnostics: {
      service: prompt !== undefined,
      assembled,
      assembleError,
      registryError: registry.error,
      registry: registry.map.size,
      scoped: directory.presets.length,
      agents: directory.agents.length,
      presetErrors: directory.presets
        .filter((preset) => preset.error !== null)
        .map((preset) => preset.id + ': ' + preset.error)
        .slice(0, 4),
      directoryError: directory.error,
      owned: rows.filter((row) => row.owner !== undefined).length,
    },
  }
  if (wantApplied === true) {
    result.applied = await appliedSections(
      ctx,
      prompt,
      (agentId) => [...offSetForPreset(state, presetIdOfAgentId(ctx, agentId), 'prompts')],
    )
  }
  return result
}

/**
 * Proof of effect, for the route only: assemble each live Agent's prompt and
 * report which switched-off sections no longer contribute any text. A section
 * that stays visible is one whose owner registered it in the same scope (an
 * agent preset), which cannot be shadowed.
 */
async function appliedSections(ctx, prompt, offFor) {
  if (prompt === undefined || typeof prompt.assemble !== 'function') return { agents: 0, error: 'no systemPrompt service' }
  let agents = []
  try {
    const list = serviceOf(ctx, 'agents')?.list?.()
    if (Array.isArray(list)) agents = list
  } catch { agents = [] }
  // Every name any Agent hides, so a switch scoped to one preset still reports
  // that the other presets keep the section.
  const targets = []
  const union = new Set()
  for (const agent of agents) {
    if (agent === null || typeof agent !== 'object') continue
    let off = []
    try {
      off = offFor(agent.id) ?? []
    } catch { off = [] }
    for (const name of off) union.add(name)
    targets.push({ agent, off: new Set(off) })
  }
  if (union.size === 0) return { agents: 0, hidden: [], visible: [] }

  const hidden = new Map()
  const visible = new Map()
  const errors = []
  let count = 0
  for (const { agent, off } of targets) {
    count += 1
    try {
      const assembly = await prompt.assemble({ agent, scope: agent })
      const contributing = new Set()
      for (const section of Array.isArray(assembly?.sections) ? assembly.sections : []) {
        if (section !== null && typeof section === 'object' && typeof section.text === 'string' && section.text.length > 0) {
          contributing.add(section.name)
        }
      }
      for (const name of union) {
        const map = contributing.has(name) ? visible : hidden
        map.set(name, (map.get(name) ?? 0) + 1)
      }
    } catch (error) {
      errors.push(String(error?.message ?? error).slice(0, 180))
    }
  }
  return {
    agents: count,
    // Gone from every Agent's prompt: the shadow is in effect.
    hidden: [...hidden.keys()].filter((name) => (visible.get(name) ?? 0) === 0).sort(),
    // Still contributing text somewhere: that preset keeps it.
    visible: [...visible.keys()].sort(),
    // Hidden for some presets only: exactly what a per-preset switch does.
    partial: [...hidden.keys()].filter((name) => (visible.get(name) ?? 0) > 0).sort(),
    errors: errors.slice(0, 4),
  }
}

/**
 * A `!!js` value, kept as data.
 *
 * A preset may carry `!!js` expressions for platform conditionals and for
 * credentials. Reading one as a plain string and writing it back turned
 * `disabled: !!js process.platform === 'win32'` into `disabled: "process…"`,
 * which the Loader reads as truthy: every Agent created from a template lost
 * its bash tool that way. The marker round-trips the tag untouched.
 */
class DshJs {
  constructor(text) { this.text = String(text ?? '') }
}

/** js-yaml schema that reads and writes `!!js` the way the Loader does. */
function dshYamlSchema(yaml) {
  const type = new yaml.Type('tag:yaml.org,2002:js', {
    kind: 'scalar',
    instanceOf: DshJs,
    construct: (value) => new DshJs(value),
    represent: (value) => value.text,
  })
  return yaml.DEFAULT_SCHEMA.extend([type])
}

/** Wait, so a hot-applied declaration can be read back. */
function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/**
 * Watch one declaration until the registry reports it.
 *
 * `null` means it is on the roster and selectable; a string is the diagnostic,
 * including the case where it never appeared at all — a plugin list that cannot
 * resolve leaves the row broken, and this is what lets the creation route take
 * the block back instead of handing the user an Agent they cannot pick.
 */
async function waitForBreakage(service, id, budgetMs) {
  const deadline = Date.now() + budgetMs
  for (;;) {
    let row = null
    try {
      const rows = typeof service.list === 'function' ? await service.list() : []
      row = (Array.isArray(rows) ? rows : []).find((entry) => entry?.id === id) ?? null
    } catch { row = null }
    if (row !== null) {
      return typeof row.broken === 'string' && row.broken.length > 0 ? row.broken : null
    }
    if (Date.now() >= deadline) return 'la déclaration n’apparaît pas dans le registre'
    await sleep(250)
  }
}

/**
 * Remove the plain `disabled: true` line of one profile MCP row.
 *
 * DSH hot-applies the profile patch, so this is the switch that actually starts
 * a server; the row keeps every other setting and a timestamped backup is left
 * beside the file.
 */
function enableServerRow(serverName) {
  try {
    const file = join(dshHome(), 'profiles', 'desktop', 'cordis.patch.yml')
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    const wanted = new RegExp('^\\s*serverName:\\s*"?' + serverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"?\\s*$')
    const anchor = lines.findIndex((line) => wanted.test(line))
    if (anchor < 0) return { ok: false, error: 'serveur absent du patch de profil' }
    let start = anchor
    while (start > 0 && !/^\s*-\s*id:/.test(lines[start])) start -= 1
    let end = anchor
    while (end + 1 < lines.length && !/^\s*-\s*id:/.test(lines[end + 1])) end += 1
    let removed = false
    for (let index = start; index <= end; index += 1) {
      if (/^\s*disabled:\s*true\s*$/.test(lines[index])) {
        lines.splice(index, 1)
        removed = true
        break
      }
    }
    if (!removed) return { ok: true, removed: false }
    copyFileSync(file, file + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-'))
    writeFileSync(file, lines.join('\n'), 'utf8')
    pushDiag('enable-server', serverName)
    return { ok: true, removed: true }
  } catch (error) {
    return { ok: false, error: errorTextOf(error) }
  }
}

function sendJson(res, status, payload) {
  try {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  } catch {
    try { res.end() } catch { /* socket already gone */ }
  }
}

export const inject = ['webServer']

/**
 * Public tool names owned by the disabled servers, evaluated right before a
 * restriction is applied so late-connecting MCP tools are caught too.
 */
function denyNames(ctx, off) {
  if (off.size === 0) return []
  const names = new Set()
  const wanted = new Set(off)
  if (wanted.has(RESOURCE_BRIDGE_NAME)) {
    for (const name of RESOURCE_TOOLS) names.add(name)
    wanted.delete(RESOURCE_BRIDGE_NAME)
  }
  if (wanted.size === 0) return [...names]
  const { rows } = readSchemas(ctx)
  for (const schema of rows) {
    if (typeof schema?.name !== 'string') continue
    for (const server of wanted) {
      if (schema.name.startsWith('mcp__' + server + '__')) {
        names.add(schema.name)
        break
      }
    }
  }
  return [...names]
}

/** Deny set for one conversation: profile default plus its own overrides. */
function offSetFor(state, sessionId) {
  const off = new Set(Array.isArray(state?.disabled) ? state.disabled : [])
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    const over = state?.sessions?.[sessionId]
    if (over !== undefined && over !== null) {
      for (const name of Array.isArray(over.off) ? over.off : []) off.add(name)
      for (const name of Array.isArray(over.on) ? over.on : []) off.delete(name)
    }
  }
  return off
}

/**
 * Write one switch: a conversation override when `sessionId` is given, the
 * profile default otherwise. An override equal to the default is dropped, so
 * the file only ever records real differences.
 */
function writeToggle(state, name, wanted, sessionId) {
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    const sessions = state.sessions !== null && typeof state.sessions === 'object' ? state.sessions : {}
    const current = sessions[sessionId]
    const row = {
      on: Array.isArray(current?.on) ? current.on.filter((value) => value !== name) : [],
      off: Array.isArray(current?.off) ? current.off.filter((value) => value !== name) : [],
      at: 0,
    }
    const globalOn = !state.disabled.includes(name)
    if (wanted !== globalOn) {
      if (wanted) row.on.push(name)
      else row.off.push(name)
    }
    row.at = Date.now()
    if (row.on.length === 0 && row.off.length === 0) delete sessions[sessionId]
    else sessions[sessionId] = row
    state.sessions = sessions
    return
  }
  const next = state.disabled.filter((value) => value !== name)
  if (!wanted) next.push(name)
  state.disabled = next
}

export function apply(ctx) {
  const state = loadState()

  // Flush on the way out. `mcpToolCache` in particular is learned while the
  // app runs and is the only record of a switched-off server's weight; a
  // debounced write that has not fired yet would be lost on quit, which is how
  // the remembered weight vanished across a restart.
  try {
    let flushed = false
    const flush = () => {
      if (flushed) return
      flushed = true
      try { saveStateSync(state) } catch { /* nothing more to do */ }
    }
    process.once('exit', flush)
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      process.once(signal, () => {
        flush()
        // The default handler still runs; this only guarantees the write.
      })
    }
    try {
      ctx.effect(() => () => flush(), 'mcp-companion: flush state')
    } catch { /* no effect scope */ }
  } catch { /* no process handle */ }
  
  // Intercept subagent creation to enforce configured subagent model policy
  const subagents = ctx.get('subagents')
  if (subagents && typeof subagents.startActivation === 'function') {
    const originalStartActivation = subagents.startActivation.bind(subagents)
    subagents.startActivation = async function(spec) {
      if (spec && spec.parent) {
        // Read current parent model
        const parentHeader = spec.parent.session?.requestHeader?.()?.config
        const parentProvider = parentHeader?.provider ?? spec.parent.options?.provider
        const parentModel = parentHeader?.model ?? spec.parent.options?.model

        // 1. Force subagent model if enabled
        if (state.subagentForceModel) {
          let forcedRoute = null
          if (state.forcedSubagentModel && state.forcedSubagentModel !== 'auto') {
            const raw = state.forcedSubagentModel.trim()
            if (raw.includes('/')) {
              const idx = raw.indexOf('/')
              forcedRoute = { provider: raw.slice(0, idx), model: raw.slice(idx + 1) }
            } else {
              forcedRoute = { model: raw }
            }
          }

          // If no specific model is set or 'auto', look for allowed models in settings
          if (!forcedRoute) {
            try {
              const sel = ctx.get('subagentModelSelection')
              const allowed = sel?.config?.allowedModels?.get?.() || []
              if (Array.isArray(allowed) && allowed.length > 0) {
                const pick = allowed.find(r => !state.subagentBlockMainModel || r.model !== parentModel) || allowed[0]
                if (pick) forcedRoute = { provider: pick.provider, model: pick.model }
              }
            } catch { /* ignore */ }
          }

          if (forcedRoute && forcedRoute.model) {
            spec.agentOptions = {
              ...(spec.agentOptions || {}),
              ...(forcedRoute.provider ? { provider: forcedRoute.provider } : {}),
              model: forcedRoute.model,
            }
          }
        }

        // 2. Block main agent's model if enabled
        if (state.subagentBlockMainModel) {
          const effectiveModel = spec.agentOptions?.model ?? parentModel
          const effectiveProvider = spec.agentOptions?.provider ?? parentProvider

          if (effectiveModel === parentModel && (!effectiveProvider || effectiveProvider === parentProvider)) {
            // Check if there is an alternative allowed model to switch to automatically
            let switched = false
            try {
              const sel = ctx.get('subagentModelSelection')
              const allowed = sel?.config?.allowedModels?.get?.() || []
              if (Array.isArray(allowed) && allowed.length > 0) {
                const alt = allowed.find(r => r.model !== parentModel)
                if (alt) {
                  spec.agentOptions = {
                    ...(spec.agentOptions || {}),
                    provider: alt.provider,
                    model: alt.model,
                  }
                  switched = true
                }
              }
            } catch { /* ignore */ }

            if (!switched) {
              throw new Error(
                `[MCP Companion] Le subagent ne peut pas utiliser le meme modele que l'agent principal (${parentProvider ? parentProvider + '/' : ''}${parentModel}). Veuillez selectionner un modele distinct dans Plugins > Subagent.`
              )
            }
          }
        }
      }

      return originalStartActivation(spec)
    }
  }

  let controller
  try {
    controller = attachDisableController(
      ctx,
      // Denied for one conversation: the MCP servers switched off there, plus
      // the individual tools switched off for the whole profile.
      // Tools: what this conversation switched off, plus what this Agent's
      // preset switched off. The preset bucket inherits every profile switch,
      // so a global toggle still reaches presets that never overrode it.
      (agentId) => denyNamesForPreset(ctx, state, agentId, presetIdOfAgentId(ctx, agentId)),
      // Prompt sections: the profile list resolved for this Agent's preset.
      (agentId) => [...offSetForPreset(state, presetIdOfAgentId(ctx, agentId), 'prompts')],
    )
    ctx.on('agent/created', (payload) => pushDiag('agent-created', String(payload?.agent?.id ?? '')))
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => () => {
        try { controller?.dispose() } catch { /* already disposed */ }
      })
    }
  } catch (error) {
    try { ctx.logger?.warn?.('dsh-customizer: MCP disable controller unavailable: %s', String(error?.message ?? error)) } catch { /* no logger */ }
  }

  const register = () => {
    const webServer = serviceOf(ctx, 'webServer')
    if (webServer === undefined || typeof webServer.register !== 'function') {
      throw new Error('DSH exposes no webServer service in this profile')
    }
    return webServer.register({
      kind: 'exact',
      path: ROUTE,
      handler: async (req, res) => {
        const method = String(req?.method ?? 'GET').toUpperCase()
        if (method !== 'GET' && method !== 'HEAD') {
          res.writeHead(405, { allow: 'GET, HEAD' })
          res.end()
          return
        }
        try {
          const url = new URL(String(req?.url ?? ROUTE), 'http://localhost')
          const clientVersion = url.searchParams.get('client')
          if (typeof clientVersion === 'string' && clientVersion.length > 0) {
            LAST_CLIENT = { version: clientVersion.slice(0, 40), at: new Date().toISOString() }
          }
          const paramOf = (name, max) => {
            const raw = url.searchParams.get(name)
            return typeof raw === 'string' && raw.length > 0 ? raw.slice(0, max) : null
          }
          const diag = paramOf('diag', 60)
          if (diag !== null) pushDiag(diag, paramOf('text', 300) ?? '')
          const draftState = paramOf('draftState', 600)
          if (draftState !== null) {
            DRAFT_STATE = { at: new Date().toISOString(), text: draftState }
          }
          const view = paramOf('view', 20)
          
          // Test endpoint for models
          const listModels = paramOf('listModels', 20)
          // Only when the probe is actually used: pushing on every request
          // evicted every useful report from the ring within a few clicks.
          if (listModels !== null) pushDiag('debug-listModels', String(listModels))
          if (listModels !== null) {
              const llm = serviceOf(ctx, 'llm')
              if (!llm) {
                  sendJson(res, 500, { ok: false, error: 'llm service not found' })
                  return
              }
              try {
                const models = await llm.listModels(listModels)
                sendJson(res, 200, { ok: true, models, count: models.length })
              } catch (e) {
                sendJson(res, 500, { ok: false, error: String(e) })
              }
              return
          }

          // Subagent settings read/write endpoints
          if (view === 'subagentSettings') {
            let allowedModels = []
            try {
              const sel = ctx.get('subagentModelSelection')
              const raw = sel?.config?.allowedModels?.get?.() || []
              if (Array.isArray(raw)) {
                allowedModels = raw.map((r) => ({ provider: r.provider, model: r.model }))
              }
            } catch { /* ignore */ }

            sendJson(res, 200, {
              ok: true,
              subagentForceModel: state.subagentForceModel === true,
              subagentBlockMainModel: state.subagentBlockMainModel === true,
              forcedSubagentModel: state.forcedSubagentModel ?? null,
              allowedModels,
            })
            return
          }

          if (url.searchParams.has('setSubagentSettings')) {
            const force = url.searchParams.get('force')
            const block = url.searchParams.get('block')
            const forced = url.searchParams.get('forced')
            if (force !== null) state.subagentForceModel = force === 'true'
            if (block !== null) state.subagentBlockMainModel = block === 'true'
            if (forced !== null) {
              const val = forced.trim()
              state.forcedSubagentModel = val.length > 0 && val !== 'none' && val !== 'auto' ? val : null
            }
            try {
              await saveState(state)
            } catch (error) {
              try { ctx.logger?.warn?.('dsh-customizer: cannot save subagent settings: %s', String(error?.message ?? error)) } catch { /* no logger */ }
            }
            sendJson(res, 200, {
              ok: true,
              subagentForceModel: state.subagentForceModel === true,
              subagentBlockMainModel: state.subagentBlockMainModel === true,
              forcedSubagentModel: state.forcedSubagentModel ?? null,
            })
            return
          }

          // One tool of the tab list: the switch is profile-wide, so the same
          // per-Agent deny the MCP switches use carries it.
          const toggleTool = paramOf('toggleTool', 200)
          if (toggleTool !== null) {
            const wanted = url.searchParams.get('enabled') === 'true'
            const known = (await toolsPayload(ctx, state)).tools.find((row) => row.name === toggleTool)
            if (known === undefined) {
              sendJson(res, 400, { ok: false, kind: 'tools', error: 'unknown tool: ' + toggleTool })
              return
            }
            // `preset=` scopes the switch to one Agent preset; without it the
            // switch is the profile-wide default.
            const presetId = paramOf('preset', 120)
            if (presetId !== null) writePresetToggle(state, presetId, 'tools', toggleTool, wanted)
            else state.tools = withName(state.tools, toggleTool, wanted)
            try {
              await saveState(state)
            } catch (error) {
              try { ctx.logger?.warn?.('dsh-customizer: cannot persist the tool switches: %s', String(error?.message ?? error)) } catch { /* no logger */ }
            }
            controller?.syncAll()
            sendJson(res, 200, await toolsPayload(ctx, state, url.searchParams.get('applied') === '1'))
            return
          }

          // One system-prompt section: hidden by an empty Agent-scoped shadow.
          const togglePrompt = paramOf('togglePrompt', 200)
          if (togglePrompt !== null) {
            const wanted = url.searchParams.get('enabled') === 'true'
            const before = await promptsPayload(ctx, state)
            const known = before.prompts.some((row) => row.name === togglePrompt)
              || promptNamesOff(state).includes(togglePrompt)
            if (!known) {
              sendJson(res, 400, { ok: false, kind: 'prompts', error: 'unknown prompt section: ' + togglePrompt })
              return
            }
            const presetId = paramOf('preset', 120)
            if (presetId !== null) writePresetToggle(state, presetId, 'prompts', togglePrompt, wanted)
            else state.prompts = withName(state.prompts, togglePrompt, wanted)
            try {
              await saveState(state)
            } catch (error) {
              try { ctx.logger?.warn?.('dsh-customizer: cannot persist the prompt switches: %s', String(error?.message ?? error)) } catch { /* no logger */ }
            }
            controller?.syncAll()
            sendJson(res, 200, await promptsPayload(ctx, state, url.searchParams.get('applied') === '1'))
            return
          }

          // A whole group switched at once: the tab header carries one switch
          // per group of more than one row, so this is the batch form of the
          // two single switches above — one persist, one reapply.
          const toggleTools = paramOf('toggleTools', 4000)
          if (toggleTools !== null) {
            const wanted = url.searchParams.get('enabled') === 'true'
            const names = toggleTools.split(',').map((name) => name.trim()).filter((name) => name.length > 0)
            const known = new Set((await toolsPayload(ctx, state)).tools.map((row) => row.name))
            const usable = names.filter((name) => known.has(name))
            if (usable.length === 0) {
              sendJson(res, 400, { ok: false, kind: 'tools', error: 'no known tool in that list' })
              return
            }
            const presetId = paramOf('preset', 120)
            for (const name of usable) {
              if (presetId !== null) writePresetToggle(state, presetId, 'tools', name, wanted)
              else state.tools = withName(state.tools, name, wanted)
            }
            try {
              await saveState(state)
            } catch (error) {
              try { ctx.logger?.warn?.('dsh-customizer: cannot persist the tool switches: %s', String(error?.message ?? error)) } catch { /* no logger */ }
            }
            controller?.syncAll()
            sendJson(res, 200, await toolsPayload(ctx, state, url.searchParams.get('applied') === '1'))
            return
          }

          const togglePrompts = paramOf('togglePrompts', 4000)
          if (togglePrompts !== null) {
            const wanted = url.searchParams.get('enabled') === 'true'
            const names = togglePrompts.split(',').map((name) => name.trim()).filter((name) => name.length > 0)
            const before = await promptsPayload(ctx, state)
            const listed = new Set(before.prompts.map((row) => row.name))
            const usable = names.filter((name) => listed.has(name) || promptNamesOff(state).includes(name))
            if (usable.length === 0) {
              sendJson(res, 400, { ok: false, kind: 'prompts', error: 'no known prompt section in that list' })
              return
            }
            const presetId = paramOf('preset', 120)
            for (const name of usable) {
              if (presetId !== null) writePresetToggle(state, presetId, 'prompts', name, wanted)
              else state.prompts = withName(state.prompts, name, wanted)
            }
            try {
              await saveState(state)
            } catch (error) {
              try { ctx.logger?.warn?.('dsh-customizer: cannot persist the prompt switches: %s', String(error?.message ?? error)) } catch { /* no logger */ }
            }
            controller?.syncAll()
            sendJson(res, 200, await promptsPayload(ctx, state, url.searchParams.get('applied') === '1'))
            return
          }

          // Per-Agent colour: stored server-side so every view of the same
          // Agent shows the same dot, including views opened in another tab.
          if (url.searchParams.has('setAgentColor')) {
            const agent = paramOf('agent', 120)
            // A hex value sets the colour; the bare `color=` parameter, present
            // but empty, clears it. Those are different states, so the empty
            // string is tested before `paramOf` folds it into "absent".
            const rawColor = url.searchParams.get('color')
            const clears = rawColor !== null && rawColor.trim() === ''
            const value = clears ? '' : paramOf('color', 24)
            if (agent === null) {
              sendJson(res, 400, { ok: false, error: 'missing agent' })
              return
            }
            const colors = state.colors !== null && typeof state.colors === 'object' && !Array.isArray(state.colors)
              ? state.colors
              : {}
            // The same regex as the state reader refuses anything that is not
            // a plain hex colour, so a state file edited by hand cannot inject
            // CSS into every page.
            if (!clears && (value === null || !/^#[0-9a-fA-F]{6}$/.test(value) && !/^#[0-9a-fA-F]{3}$/.test(value))) {
              sendJson(res, 400, { ok: false, error: 'bad colour' })
              return
            }
            if (clears) delete colors[agent]
            else {
              const keys = Object.keys(colors)
              if (!keys.includes(agent) && keys.length >= MAX_COLORS) {
                sendJson(res, 400, { ok: false, error: 'too many coloured agents' })
                return
              }
              colors[agent] = value.toLowerCase()
            }
            state.colors = colors
            try {
              await saveState(state)
            } catch (error) {
              try { ctx.logger?.warn?.('mcp-companion: cannot persist the agent colours: %s', String(error?.message ?? error)) } catch { /* no logger */ }
            }
            // Mirrored to the live client so a re-opened menu paints at once.
            AGENT_COLOR_STATE = { ...colors, at: new Date().toISOString() }
            sendJson(res, 200, { ok: true, agent, color: colors[agent] ?? null, palette: AGENT_COLORS })
            return
          }

          if (view === 'colorState') {
            const colors = state.colors !== null && typeof state.colors === 'object' ? state.colors : {}
            const hiddenPresets = Array.isArray(state.hiddenPresets) ? state.hiddenPresets : []
            sendJson(res, 200, { ok: true, colors, palette: AGENT_COLORS, hiddenPresets })
            return
          }

          // Keep a preset out of the New-Session agent menu, or put it back.
          // Sub-agent personas are ordinary presets with no flag of their own,
          // so the choice is stored rather than derived.
          if (url.searchParams.has('hidePreset')) {
            const id = paramOf('hidePreset', 120)
            const wanted = url.searchParams.get('hidden') !== 'false'
            if (id === null) {
              sendJson(res, 400, { ok: false, error: 'missing preset id' })
              return
            }
            const list = Array.isArray(state.hiddenPresets) ? state.hiddenPresets.slice() : []
            const next = wanted
              ? (list.includes(id) ? list : [...list, id])
              : list.filter((value) => value !== id)
            if (next.length > MAX_HIDDEN_PRESETS) {
              sendJson(res, 400, { ok: false, error: 'too many hidden presets' })
              return
            }
            state.hiddenPresets = next
            try {
              await saveState(state)
            } catch (error) {
              try { ctx.logger?.warn?.('mcp-companion: cannot persist the hidden presets: %s', String(error?.message ?? error)) } catch { /* no logger */ }
            }
            sendJson(res, 200, { ok: true, hiddenPresets: next })
            return
          }

          // Create one Agent from scratch.
          //
          // A preset is a plugin list, not a record: a new one is built from a
          // shipped template whose persona is replaced by the prompt the user
          // typed. Anything else would be a name without behaviour.
          if (url.searchParams.has('createAgent')) {
            const service = serviceOf(ctx, 'agentPresets')
            if (service === undefined || typeof service.readDocument !== 'function') {
              sendJson(res, 501, { ok: false, error: 'the preset registry cannot be read' })
              return
            }
            const rawName = paramOf('name', 120)
            if (rawName === null) {
              sendJson(res, 400, { ok: false, error: 'missing name' })
              return
            }
            const kind = url.searchParams.get('kind') === 'subagent' ? 'subagent' : 'agent'
            const description = paramOf('description', 400) ?? ''
            const prompt = paramOf('prompt', 4000) ?? ''
            try {
              const yaml = await import('js-yaml')
              const schema = dshYamlSchema(yaml)
              const taken = new Set()
              try {
                const rows = typeof service.list === 'function' ? await service.list() : []
                for (const row of Array.isArray(rows) ? rows : []) if (typeof row.id === 'string') taken.add(row.id)
              } catch { /* collision check is best effort */ }
              // Templates: the shipped modes carry a complete, supported plugin
              // list, so a new Agent inherits working behaviour instead of a
              // hand-made composition that may reference nothing.
              const template = await templatePlugins(service, kind, yaml, schema)
              if (template === null) {
                sendJson(res, 422, { ok: false, error: 'no template declaration could be read' })
                return
              }
              let plugins = template.plugins
              // Tool modules: the form sends the exact set it wants. A module
              // that is absent from the set leaves the composition for real —
              // the tool then does not exist in this Agent, it is not merely
              // switched off — and a module the template never had is appended.
              const toolsParam = url.searchParams.get('tools')
              if (toolsParam !== null) {
                const wanted = toolsParam.split(',')
                  .map((value) => value.trim())
                  .filter((value) => value.length > 0)
                const keep = new Set(wanted)
                const drop = new Set()
                walkEntries(plugins, (entry) => {
                  if (isToolModule(entry) && !keep.has(entry.name)) drop.add(entry.name)
                }, 0)
                plugins = dropToolModules(plugins, drop)
                const ids = new Set()
                walkEntries(plugins, (entry) => { if (typeof entry.id === 'string') ids.add(entry.id) }, 0)
                for (const name of wanted) {
                  if (listHasPackage(plugins, name)) continue
                  plugins.push({ id: entryIdFor(name, ids), name })
                }
              }
              // The persona carries the Agent's own instructions.
              const persona = plugins.find((row) => typeof row?.name === 'string' && row.name.endsWith('dsh-persona'))
              if (persona !== undefined) {
                persona.config = persona.config !== null && typeof persona.config === 'object' ? persona.config : {}
                persona.config.prefix = prompt.length > 0 ? prompt : 'You are ' + rawName + '.'
              } else if (prompt.length > 0) {
                plugins.unshift({ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: prompt } })
              }
              const base = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'agent'
              let candidate = base
              let index = 2
              while (taken.has(candidate)) { candidate = base + '-' + index; index += 1 }
              const config = { id: candidate, name: rawName, plugins }
              if (description.length > 0) config.description = description
              const block = yaml.dump([{ insert: [{ id: 'preset-' + candidate, name: '@deepseek-ai/dsh-agent-preset', config }] }], { schema, lineWidth: 120 })
              const { readFileSync: readFile, writeFileSync: writeFile, copyFileSync } = await import('node:fs')
              const { join } = await import('node:path')
              const file = join(dshHome(), 'profiles', 'desktop', 'cordis.patch.yml')
              const text = readFile(file, 'utf8')
              copyFileSync(file, file + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-'))
              const joined = text.endsWith('\n') ? text : text + '\n'
              writeFile(file, joined + block, 'utf8')
              pushDiag('create-agent', candidate + ' from ' + template.id)

              // MCP servers this Agent must keep, and which of their tools.
              //
              // The pin is stored by server name with the chosen tool names, so
              // it holds before the server has answered: a stopped server is
              // started, denied profile-wide, and handed back to this preset
              // alone. A partial choice is stored as the names it keeps; the
              // rest of that server is denied for this Agent only.
              const mcpParam = url.searchParams.get('mcp')
              const wanted = mcpParam === null
                ? []
                : mcpParam.split(';').map((value) => value.trim()).filter((value) => value.length > 0)
              const pinned = []
              const warnings = []
              const pins = []
              for (const spec of wanted) {
                const split = spec.indexOf(':')
                const server = (split < 0 ? spec : spec.slice(0, split)).trim()
                const toolsPart = split < 0 ? '*' : spec.slice(split + 1).trim()
                if (server.length === 0) continue
                let row = null
                try {
                  row = readEntries(ctx).rows.find((entry) => entry.name === MCP_CLIENT_PACKAGE
                    && entry.config?.serverName === server) ?? null
                } catch { row = null }
                if (row === null) {
                  warnings.push(server + ' : serveur inconnu dans ce profil')
                  continue
                }
                const tools = toolsPart === '*' || toolsPart.length === 0
                  ? ['*']
                  : toolsPart.split('|').map((value) => value.trim()).filter((value) => value.length > 0)
                if (tools.length === 0) continue
                const wasOff = row.disabled === true || row.enabled === false
                if (wasOff) {
                  const started = enableServerRow(server)
                  if (started.ok !== true) {
                    warnings.push(server + ' : ' + String(started.error))
                    continue
                  }
                  // Off for everyone else, so the pin really is exclusive.
                  if (!state.disabled.includes(server)) {
                    state.disabled = [...state.disabled, server].sort()
                  }
                }
                pins.push({ server, tools })
                pinned.push({ server, started: wasOff, tools: tools[0] === '*' ? 'tous' : tools.length })
              }
              if (pins.length > 0) {
                writeMcpPins(state, candidate, pins)
                try {
                  await saveState(state)
                } catch (error) {
                  warnings.push('état non enregistré : ' + String(error?.message ?? error))
                }
              }
              // A composition that does not activate would leave a roster entry
              // that cannot be selected, so the appended block is withdrawn
              // instead of reported as created.
              if (pins.length > 0 || plugins.some((entry) => isToolModule(entry))) {
                const broken = await waitForBreakage(service, candidate, 5000)
                if (broken !== null) {
                  try { writeFile(file, text, 'utf8') } catch { /* best effort */ }
                  if (pins.length > 0) {
                    writeMcpPins(state, candidate, [])
                    try { await saveState(state) } catch { /* best effort */ }
                  }
                  sendJson(res, 422, { ok: false, error: 'la composition ne s’active pas : ' + broken })
                  return
                }
              }
              sendJson(res, 200, { ok: true, id: candidate, name: rawName, kind, template: template.id, pinned, warnings })
            } catch (error) {
              sendJson(res, 500, { ok: false, error: errorTextOf(error) })
            }
            return
          }

          // Duplicate one Agent: a new declaration appended to the profile
          // patch, never a rewrite of the original. DSH hot-applies the file.
          if (url.searchParams.has('duplicateAgent')) {
            const source = paramOf('duplicateAgent', 120)
            if (source === null) {
              sendJson(res, 400, { ok: false, error: 'missing source id' })
              return
            }
            const service = serviceOf(ctx, 'agentPresets')
            if (service === undefined || typeof service.readDocument !== 'function') {
              sendJson(res, 501, { ok: false, error: 'the preset registry cannot be read' })
              return
            }
            try {
              const yaml = await import('js-yaml')
              const schema = dshYamlSchema(yaml)
              const document = await service.readDocument(source)
              const content = typeof document?.content === 'string' ? document.content : ''
              const plugins = yaml.load(content, { schema })
              if (!Array.isArray(plugins)) {
                sendJson(res, 422, { ok: false, error: 'the declaration carries no plugin list' })
                return
              }
              // A fresh id, derived from the source and never colliding.
              const taken = new Set()
              try {
                const rows = typeof service.list === 'function' ? await service.list() : []
                for (const row of Array.isArray(rows) ? rows : []) if (typeof row.id === 'string') taken.add(row.id)
              } catch { /* collision check is best effort */ }
              const base = String(document?.id ?? source).replace(/[^a-z0-9-]/gi, '-').toLowerCase()
              let candidate = base + '-copy'
              let index = 2
              while (taken.has(candidate)) { candidate = base + '-copy-' + index; index += 1 }
              const wantedName = paramOf('name', 120) ?? ((typeof document?.name === 'string' && document.name.length > 0 ? document.name : source) + ' copy')
              const config = {
                id: candidate,
                name: wantedName,
                plugins,
              }
              if (typeof document?.description === 'string' && document.description.length > 0) {
                config.description = document.description
              }
              const block = yaml.dump([{ insert: [{ id: 'preset-' + candidate, name: '@deepseek-ai/dsh-agent-preset', config }] }], { schema, lineWidth: 120 })
              const { readFileSync: readFile, writeFileSync: writeFile, copyFileSync } = await import('node:fs')
              const { join } = await import('node:path')
              const file = join(dshHome(), 'profiles', 'desktop', 'cordis.patch.yml')
              const text = readFile(file, 'utf8')
              copyFileSync(file, file + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-'))
              const joined = text.endsWith('\n') ? text : text + '\n'
              writeFile(file, joined + block, 'utf8')
              pushDiag('duplicate-agent', source + ' -> ' + candidate)
              sendJson(res, 200, { ok: true, source, id: candidate, name: wantedName })
            } catch (error) {
              sendJson(res, 500, { ok: false, error: errorTextOf(error) })
            }
            return
          }

          // Turn one MCP server back on in the profile.
          //
          // A loader-disabled server is never activated, so no conversation can
          // borrow its tools: enabling it once is the only way to make it
          // usable at all. The edit is surgical — one `disabled` line inside
          // that server's own block — and the file is copied first, because a
          // YAML round-trip would destroy its comments and `!!js` expressions.
          if (url.searchParams.has('enableServer')) {
            const name = paramOf('enableServer', 120)
            if (name === null) {
              sendJson(res, 400, { ok: false, error: 'missing server name' })
              return
            }
            try {
              const { readFileSync: readFile, writeFileSync: writeFile, copyFileSync } = await import('node:fs')
              const { join } = await import('node:path')
              const file = join(dshHome(), 'profiles', 'desktop', 'cordis.patch.yml')
              const text = readFile(file, 'utf8')
              const lines = text.split('\n')
              const wanted = new RegExp('^\\s*serverName:\\s*"?' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"?\\s*$')
              const anchor = lines.findIndex((line) => wanted.test(line))
              if (anchor < 0) {
                sendJson(res, 404, { ok: false, error: 'server not found in the profile patch: ' + name })
                return
              }
              // The block runs from its own `- id:` line to the next one.
              let start = anchor
              while (start > 0 && !/^\s*-\s*id:/.test(lines[start])) start -= 1
              let end = anchor
              while (end + 1 < lines.length && !/^\s*-\s*id:/.test(lines[end + 1])) end += 1
              let removed = false
              for (let index = start; index <= end; index += 1) {
                if (/^\s*disabled:\s*true\s*$/.test(lines[index])) {
                  lines.splice(index, 1)
                  removed = true
                  break
                }
              }
              if (!removed) {
                sendJson(res, 409, { ok: false, error: 'no plain `disabled: true` line for ' + name })
                return
              }
              copyFileSync(file, file + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-'))
              writeFile(file, lines.join('\n'), 'utf8')
              pushDiag('enable-server', name)
              sendJson(res, 200, { ok: true, server: name, note: 'DSH hot-applies the profile patch' })
            } catch (error) {
              sendJson(res, 500, { ok: false, error: errorTextOf(error) })
            }
            return
          }

          // Switch one whole MCP server for a single conversation.
          //
          // The override has to be written per tool name, because that is what
          // the deny list and `tools.restrict` speak. Writing the server name
          // instead — which the older single-name toggle did — matched no tool
          // and silently changed nothing.
          if (url.searchParams.has('toggleServer')) {
            const name = paramOf('toggleServer', 120)
            const session = paramOf('session', 200)
            const wanted = url.searchParams.get('enabled') === 'true'
            if (name === null || session === null) {
              sendJson(res, 400, { ok: false, error: 'missing server or session' })
              return
            }
            const before = inventory(ctx, offSetFor(state, session), session, state)
            const target = before.servers.find((row) => row.name === name)
            if (target === undefined) {
              sendJson(res, 404, { ok: false, error: 'unknown server: ' + name })
              return
            }
            const names = (Array.isArray(target.tools) ? target.tools : []).map((tool) => tool.name)
            if (names.length === 0) {
              sendJson(res, 409, { ok: false, error: 'server has no tools yet', retry: true })
              return
            }
            const sessions = state.sessions !== null && typeof state.sessions === 'object' ? state.sessions : {}
            const current = sessions[session]
            const on = (Array.isArray(current?.on) ? current.on : []).filter((value) => names.includes(value) === false)
            const off = (Array.isArray(current?.off) ? current.off : []).filter((value) => names.includes(value) === false)
            const target_ = wanted ? on : off
            for (const toolName of names) if (target_.includes(toolName) === false) target_.push(toolName)
            const row = { on, off, at: Date.now() }
            if (row.on.length === 0 && row.off.length === 0) delete sessions[session]
            else sessions[session] = row
            state.sessions = sessions
            try {
              await saveState(state)
            } catch (error) {
              sendJson(res, 500, { ok: false, error: errorTextOf(error) })
              return
            }
            try { controller?.syncOne(session) } catch { /* the next tick reapplies */ }
            sendJson(res, 200, { ok: true, server: name, session, enabled: wanted, tools: names.length })
            return
          }

          // Load one MCP server and confine it to a single conversation.
          //
          // DSH cannot enable a plugin for one session only, so the server is
          // loaded once — otherwise its tools do not exist at all — and every
          // one of its tool names is then denied profile-wide, with the same
          // names allowed back for the given conversation. The net effect is
          // what a per-conversation switch promises: inert everywhere, active
          // here.
          if (url.searchParams.has('scopeServer')) {
            const name = paramOf('scopeServer', 120)
            const session = paramOf('session', 200)
            if (name === null || session === null) {
              sendJson(res, 400, { ok: false, error: 'missing server or session' })
              return
            }
            const before = inventory(ctx, offSetFor(state, session), session, state)
            const target = before.servers.find((row) => row.name === name)
            if (target === undefined) {
              sendJson(res, 404, { ok: false, error: 'unknown server: ' + name })
              return
            }
            const names = (Array.isArray(target.tools) ? target.tools : []).map((tool) => tool.name)
            if (names.length === 0) {
              // Not loaded yet: the caller retries once the plugin reports tools.
              sendJson(res, 409, { ok: false, error: 'server has no tools yet', retry: true })
              return
            }
            const disabled = new Set(Array.isArray(state.disabled) ? state.disabled : [])
            for (const toolName of names) disabled.add(toolName)
            state.disabled = [...disabled]
            const sessions = state.sessions !== null && typeof state.sessions === 'object' ? state.sessions : {}
            const current = sessions[session]
            const row = {
              on: Array.isArray(current?.on) ? current.on.slice() : [],
              off: (Array.isArray(current?.off) ? current.off : []).filter((value) => names.includes(value) === false),
              at: Date.now(),
            }
            for (const toolName of names) if (row.on.includes(toolName) === false) row.on.push(toolName)
            sessions[session] = row
            state.sessions = sessions
            try {
              await saveState(state)
            } catch (error) {
              sendJson(res, 500, { ok: false, error: errorTextOf(error) })
              return
            }
            try { controller?.syncOne(session) } catch { /* the next tick reapplies */ }
            sendJson(res, 200, { ok: true, server: name, session, tools: names.length })
            return
          }

          // Reclassify one Agent: its scope or its type. Both are stored
          // choices; DSH carries neither on a declaration.
          if (url.searchParams.has('setPresetMeta')) {
            const id = paramOf('id', 120)
            if (id === null) {
              sendJson(res, 400, { ok: false, error: 'missing id' })
              return
            }
            const meta = state.presetMeta !== null && typeof state.presetMeta === 'object' && !Array.isArray(state.presetMeta)
              ? { ...state.presetMeta }
              : {}
            const current = meta[id] !== null && typeof meta[id] === 'object' ? { ...meta[id] } : {}
            // `reset=1` drops the stored choice so the default applies again.
            if (url.searchParams.get('reset') === '1') {
              delete meta[id]
              state.presetMeta = meta
              try {
                await saveState(state)
              } catch { /* the next write retries */ }
              sendJson(res, 200, { ok: true, id, meta: null })
              return
            }
            const scope = paramOf('scope', 20)
            const kind = paramOf('kind', 20)
            if (scope !== null) {
              if (scope !== 'global' && scope !== 'project') {
                sendJson(res, 400, { ok: false, error: 'bad scope' })
                return
              }
              current.scope = scope
            }
            if (kind !== null) {
              if (kind !== 'agent' && kind !== 'subagent') {
                sendJson(res, 400, { ok: false, error: 'bad kind' })
                return
              }
              current.kind = kind
            }
            meta[id] = current
            state.presetMeta = meta
            try {
              await saveState(state)
            } catch (error) {
              try { ctx.logger?.warn?.('mcp-companion: cannot persist the agent scope: %s', String(error?.message ?? error)) } catch { /* no logger */ }
            }
            sendJson(res, 200, { ok: true, id, meta: current })
            return
          }

          // One Agent's declared composition, so the editor shows the prompt
          // the Agent actually receives instead of a placeholder.
          if (view === 'agentDoc') {
            const id = paramOf('id', 120)
            if (id === null) {
              sendJson(res, 400, { ok: false, error: 'missing id' })
              return
            }
            const service = serviceOf(ctx, 'agentPresets')
            let document = null
            let error = null
            try {
              if (service !== undefined && typeof service.readDocument === 'function') {
                document = await service.readDocument(id)
              }
            } catch (caught) {
              error = errorTextOf(caught)
            }
            const content = typeof document?.content === 'string'
              ? document.content
              : (typeof document === 'string' ? document : '')
            // Parsed, not pattern-matched: a YAML block scalar contains its own
            // bullets and blank lines, so any regex stops at the first one. The
            // persona row carries the Agent's own instructions in `config.prefix`.
            let prompt = null
            let composition = null
            if (content.length > 0) {
              try {
                const yaml = await import('js-yaml')
                // A declaration may carry `!!js` expressions for platform
                // conditionals. Refusing the whole document over one would hide
                // every shipped preset's prompt, so the tag is read as the plain
                // string it is: nothing here executes it.
                // The tag must be named in its canonical form: js-yaml resolves
                // `!!js` to `tag:yaml.org,2002:js`, and declaring the short form
                // leaves the document unparsable.
                const jsTag = new yaml.Type('tag:yaml.org,2002:js', {
                  kind: 'scalar',
                  construct: (value) => String(value ?? ''),
                })
                const schema = yaml.DEFAULT_SCHEMA.extend([jsTag])
                composition = yaml.load(content, { schema })
              } catch { /* unparsable declaration stays opaque */ }
            }
            const findPersona = (rows) => {
              for (const row of Array.isArray(rows) ? rows : []) {
                if (row === null || typeof row !== 'object') continue
                if (typeof row.name === 'string' && row.name.endsWith('dsh-persona')) {
                  const prefix = row?.config?.prefix
                  if (typeof prefix === 'string') return prefix
                }
                const nested = findPersona(row.plugins ?? row.group ?? row.children)
                if (nested !== null) return nested
              }
              return null
            }
            prompt = findPersona(composition)
            let promptSource = prompt === null ? null : 'persona'
            // No persona of its own: the prompt a shipped Agent receives is the
            // assembled set of prompt sections, so show that rather than nothing.
            if (prompt === null) {
              try {
                const composed = await promptsPayload(ctx, state)
                const parts = []
                for (const row of composed?.prompts ?? []) {
                  const inScope = row.scope === 'global'
                    || row.inAll === true
                    || (Array.isArray(row.presets) && row.presets.includes(id))
                  if (!inScope) continue
                  if (typeof row.text !== 'string' || row.text.length === 0) continue
                  parts.push(row.text)
                }
                if (parts.length > 0) {
                  prompt = parts.join('\n\n')
                  promptSource = 'sections'
                }
              } catch { /* keep the empty prompt */ }
            }
            sendJson(res, 200, {
              ok: true,
              kind: 'agentDoc',
              id,
              name: typeof document?.name === 'string' ? document.name : null,
              description: typeof document?.description === 'string' ? document.description : null,
              prompt,
              promptSource,
              contentChars: content.length,
              content: url.searchParams.get('raw') === '1' ? content.slice(0, 4000) : undefined,
              error,
            })
            return
          }

          // What one preset's realm really exposes.
          //
          // The tools and MCP tabs deliberately hide `mcp__*` rows (the MCP
          // panel owns them), so neither can answer "does this Agent see that
          // server?". This route reads one preset scope and reports the servers
          // behind its tool names, which is the only honest proof that an MCP
          // client mounted inside a composition stayed inside it.
          if (view === 'scopeTools') {
            const id = paramOf('preset', 120)
            const service = serviceOf(ctx, 'agentPresets')
            if (id === null) {
              sendJson(res, 400, { ok: false, error: 'missing preset' })
              return
            }
            if (service === undefined || typeof service.acquireScope !== 'function') {
              sendJson(res, 501, { ok: false, error: 'the preset registry cannot be scoped' })
              return
            }
            let lease = null
            let rows = []
            let error = null
            try {
              lease = await service.acquireScope(id)
              rows = readSchemas(ctx, lease?.key).rows
            } catch (cause) {
              error = errorTextOf(cause)
            } finally {
              try {
                const dispose = lease?.[Symbol.asyncDispose] ?? lease?.dispose
                if (typeof dispose === 'function') await dispose.call(lease)
              } catch { /* a lease that will not close must not fail the read */ }
            }
            const declared = declaredServerNames(ctx)
            const servers = {}
            for (const schema of rows) {
              const server = serverOfTool(schema.name, declared)
              if (server === undefined) continue
              servers[server] = (servers[server] ?? 0) + 1
            }
            // What survives this preset's own switches and its forced servers:
            // the exact set the per-Agent deny controller applies, so the read
            // is the proof rather than a second opinion.
            const off = new Set(denyNamesForPreset(ctx, state, null, id))
            const visible = {}
            for (const schema of rows) {
              const server = serverOfTool(schema.name, declared)
              if (server === undefined || off.has(schema.name)) continue
              visible[server] = (visible[server] ?? 0) + 1
            }
            const pinned = state?.presets?.[id]?.toolsOn
            sendJson(res, 200, {
              ok: error === null,
              preset: id,
              tools: rows.length,
              servers,
              visible,
              denied: rows.filter((schema) => off.has(schema.name)).length,
              pinnedOn: Array.isArray(pinned) ? pinned.length : 0,
              pinnedMcp: pinnedServersFor(state, id),
              error,
            })
            return
          }

          // What the creation form offers beside the name and the prompt: the
          // tool modules its template mounts, the modules any shipped preset
          // proves resolvable, and the MCP servers this profile declares.
          // What the composition form offers: every tool module, and the MCP
          // servers this profile declares with the tools each one publishes.
          //
          // With `id`, the same payload describes an existing Agent instead of a
          // template, so the consultation view renders the very same component.
          if (view === 'composeOptions') {
            const service = serviceOf(ctx, 'agentPresets')
            if (service === undefined || typeof service.readDocument !== 'function') {
              sendJson(res, 501, { ok: false, error: 'the preset registry cannot be read' })
              return
            }
            const id = paramOf('id', 120)
            const kind = url.searchParams.get('kind') === 'subagent' ? 'subagent' : 'agent'
            try {
              const yaml = await import('js-yaml')
              const schema = dshYamlSchema(yaml)
              // Present modules: the declaration's own list when an Agent is
              // named, the template's list when a new one is being built.
              let plugins = []
              let template = null
              if (id !== null) {
                const found = await pluginsOf(service, id, yaml, schema)
                if (found === null) {
                  sendJson(res, 404, { ok: false, error: 'the declaration could not be read: ' + id })
                  return
                }
                plugins = found.plugins
              } else {
                const found = await templatePlugins(service, kind, yaml, schema)
                if (found === null) {
                  sendJson(res, 422, { ok: false, error: 'no template declaration could be read' })
                  return
                }
                plugins = found.plugins
                template = found.id
              }
              const present = new Set()
              const byPackage = new Map()
              // A module can be declared and still switched off by the shipped
              // declaration: `true` is a plain no, anything else is a platform
              // expression the Loader evaluates.
              const switches = new Map()
              walkEntries(plugins, (entry) => {
                if (!isToolModule(entry)) return
                present.add(entry.name)
                byPackage.set(entry.name, entry.id)
                if (entry.disabled === true) switches.set(entry.name, 'off')
                else if (entry.disabled !== undefined && entry.disabled !== false) switches.set(entry.name, 'conditional')
              }, 0)
              // The catalogue first, then whatever else the declaration mounts
              // so nothing is hidden from the reader.
              const tools = []
              const listed = new Set()
              for (const name of TOOL_CATALOGUE) {
                if (listed.has(name)) continue
                listed.add(name)
                tools.push({
                  key: name,
                  name,
                  label: toolModuleLabel(name),
                  desc: toolModuleDescription(name),
                  checked: present.has(name),
                  off: switches.get(name) ?? null,
                  known: true,
                })
              }
              for (const name of present) {
                if (listed.has(name)) continue
                listed.add(name)
                tools.push({
                  key: name,
                  name,
                  label: toolModuleLabel(name),
                  desc: toolModuleDescription(name),
                  checked: true,
                  off: switches.get(name) ?? null,
                  known: TOOL_MODULE_LABELS[name] !== undefined,
                })
              }
              const pins = new Map(pinnedFor(state, id ?? '').map((pin) => [pin.server, pin]))
              let servers = []
              try {
                servers = inventory(ctx, offSetFor(state, null), null, state).servers
                  .filter((row) => row.name !== RESOURCE_BRIDGE_NAME)
                  .map((row) => {
                    const pin = pins.get(row.name)
                    return {
                      name: row.name,
                      transport: row.transport ?? null,
                      enabled: row.enabled === true,
                      active: row.active === true,
                      toolCount: row.toolCount ?? 0,
                      tokens: row.tokens ?? 0,
                      cachedToolCount: row.cachedToolCount ?? null,
                      cachedTokens: row.cachedTokens ?? null,
                      // `null` when not forced, `['*']` for the whole server.
                      pinned: pin === undefined ? null : (pin.all ? ['*'] : pin.tools),
                      // How this server is reached: the only description an
                      // MCP declaration carries is its transport endpoint.
                      desc: typeof row.url === 'string' && row.url.length > 0
                        ? row.url
                        : [row.command, ...(Array.isArray(row.args) ? row.args : [])]
                          .filter((value) => typeof value === 'string' && value.length > 0)
                          .join(' '),
                    }
                  })
              } catch { servers = [] }
              sendJson(res, 200, {
                ok: true,
                kind,
                id,
                template,
                readOnly: id !== null,
                tools,
                mcp: servers,
              })
            } catch (error) {
              sendJson(res, 500, { ok: false, error: errorTextOf(error) })
            }
            return
          }

          // Every tool one MCP server publishes, so the form can offer them
          // one by one instead of forcing a whole server.
          if (view === 'serverTools') {
            const server = paramOf('server', 120)
            if (server === null) {
              sendJson(res, 400, { ok: false, error: 'missing server' })
              return
            }
            const tools = serverToolsOf(ctx, server)
            sendJson(res, 200, { ok: true, server, tools, loaded: tools.length > 0 })
            return
          }

          if (view === 'agents') {
            sendJson(res, 200, await agentsPayload(ctx, state))
            return
          }

          if (view === 'presets') {
            sendJson(res, 200, await presetsPayload(ctx, state))
            return
          }

          if (view === 'skills') {
            sendJson(res, 200, await skillsPayload(ctx))
            return
          }

          if (view === 'tools' || view === 'prompts') {
            if (method === 'HEAD') {
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
              res.end()
              return
            }
            sendJson(res, 200, view === 'tools' ? await toolsPayload(ctx, state, url.searchParams.get('applied') === '1') : await promptsPayload(ctx, state, url.searchParams.get('applied') === '1'))
            return
          }

          const sessionId = paramOf('session', 200)
          const toggle = method === 'GET' ? url.searchParams.get('toggle') : null
          if (toggle !== null) {
            const wanted = url.searchParams.get('enabled') === 'true'
            const before = inventory(ctx, offSetFor(state, sessionId), sessionId, state)
            const target = before.servers.find((row) => row.name === toggle && (row.toggleable === true || row.active === true))
            if (target === undefined) {
              sendJson(res, 400, { ok: false, error: 'unknown toggle target: ' + toggle })
              return
            }
            writeToggle(state, toggle, wanted, sessionId)
            try {
              await saveState(state)
            } catch (error) {
              try { ctx.logger?.warn?.('dsh-customizer: cannot persist the disabled list: %s', String(error?.message ?? error)) } catch { /* no logger */ }
            }
            if (sessionId !== null) controller?.syncOne(sessionId)
            else controller?.setChanged()
          }
          const payload = inventory(ctx, offSetFor(state, sessionId), sessionId, state)
          if (method === 'HEAD') {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
            res.end()
            return
          }
          sendJson(res, 200, payload)
        } catch (error) {
          sendJson(res, 200, {
            ok: false,
            error: String(error?.message ?? error).slice(0, 300),
            summary: { servers: 0, active: 0, tools: 0, plugin: 0, declared: 0 },
            servers: [],
            adapters: [],
            diagnostics: {},
          })
        }
      },
    })
  }

  let dispose
  try {
    dispose = typeof ctx.effect === 'function' ? ctx.effect(register) : register()
  } catch (error) {
    // Never take the Host down over a missing route seat.
    try { ctx.logger?.warn?.('dsh-customizer: inventory route unavailable: %s', String(error?.message ?? error)) } catch { /* no logger */ }
    return undefined
  }
  return () => {
    try {
      if (typeof dispose === 'function') dispose()
    } catch { /* already disposed */ }
    try { controller?.dispose() } catch { /* already disposed */ }
  }
}
