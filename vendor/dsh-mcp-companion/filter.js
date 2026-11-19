/**
 * Host half support for the MCP toggles.
 *
 * A server another plugin mounts (wincu) and the Host's MCP resource bridge
 * have no `cordis.patch.yml` row, so the Skill/MCP panel cannot enable or
 * disable them the way it does for declared rows. This module gives those two
 * cards a real, reversible switch: while a card is off, its tools are denied in
 * the Agent scope, so they disappear from the model schema and cannot be called.
 *
 * The same mechanism carries the per-conversation switch added in 1.1:
 *
 *   - `disabled` is the profile-wide default (what the panel writes);
 *   - `sessions[<sessionId>]` holds that conversation's overrides: `off` names
 *     denied only there, `on` names explicitly re-enabled there even though the
 *     profile default denies them.
 *
 * The mechanism is the one the panel itself uses (and documents in
 * dsh-skill-mcp-panel/lib/tool-filter.js): `ctx.tools.restrict({ deny })` is
 * only accepted on a scoped context, so one small plugin per Agent registers
 * the restriction on `agent.ctx`, and a reentrancy guard keeps the synchronous
 * `tools/change` emission from looping.
 *
 * Version 3 adds the two Skill/MCP page tabs, which are profile-wide:
 *
 *   - `tools` holds individual public tool names the user switched off; the
 *     same `tools.restrict({ deny })` call carries them, so one tool can be
 *     denied without disabling its whole server;
 *   - `prompts` holds system-prompt section names the user switched off. A
 *     section is hidden by registering an empty section of the same name in the
 *     Agent scope: scoped sections shadow global ones, and an empty section is
 *     dropped when the prompt is rendered, so the owner's registration is never
 *     touched.
 *
 * State lives in `<dshHome>/dsh-customizer/state.json`:
 *   {
 *     "version": 3,
 *     "disabled": ["wincu"],
 *     "tools": ["mcp__wincu__screenshot"],
 *     "prompts": ["tool:bash"],
 *     "sessions": {
 *       "<sessionId>": { "on": [], "off": ["mcp-resource-servers"], "at": 1735000000000 }
 *     }
 *   }
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import os from 'node:os'

export const STATE_VERSION = 3

/** Keep the file bounded: only the most recently touched sessions survive. */
export const MAX_SESSIONS = 120
/** Preset override buckets kept in the state file. */
export const MAX_PRESETS = 48
/** Most MCP servers one Agent may keep. */
const MAX_MCP_PINS = 8
/** Most tool names one pinned server may list. */
const MAX_PIN_TOOLS = 240
/** MCP servers whose weight is remembered while they are off. */
export const MAX_TOOL_CACHE = 64
/** Presets whose colour the user picked. */
export const MAX_COLORS = 96
/** Presets kept out of the New-Session agent menu. */
export const MAX_HIDDEN = 96
/** Presets carrying an explicit scope or type choice. */
export const MAX_PRESET_META = 128
/** The palette the Agent colour picker offers. */
export const AGENT_COLORS = [
  '#5b8def', '#2ea8e5', '#22a7a0', '#2fb26a',
  '#8cc63f', '#e2b33c', '#ef8b3c', '#e4613c',
  '#d94f6a', '#c45bc0', '#9b6bd6', '#7a8899',
]

export function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
  return join(os.homedir(), '.dsh')
}

export function statePath() {
  return join(dshHome(), 'dsh-customizer', 'state.json')
}

function names(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const name of value) {
    if (typeof name === 'string' && name.length > 0 && !out.includes(name)) out.push(name)
  }
  return out
}

/** Read the whole persisted state; a missing or broken file means "all on". */
/**
 * Read the per-preset override buckets.
 *
 * A bucket only carries differences from the profile-wide lists, in both
 * directions, so an empty bucket is dropped instead of pinning a preset that
 * merely inherited everything.
 */
/** Last known weight of each MCP server, kept for the ones that are off. */
function readToolCache(raw) {
  const out = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const name of Object.keys(raw)) {
    if (typeof name !== 'string' || name.length === 0) continue
    const value = raw[name]
    if (value === null || typeof value !== 'object') continue
    const tokens = typeof value.tokens === 'number' && Number.isFinite(value.tokens) ? value.tokens : 0
    const toolCount = typeof value.toolCount === 'number' && Number.isFinite(value.toolCount) ? value.toolCount : 0
    if (tokens <= 0 && toolCount <= 0) continue
    out[name] = { tokens, toolCount, at: typeof value.at === 'number' ? value.at : 0 }
    if (Object.keys(out).length >= MAX_TOOL_CACHE) break
  }
  return out
}

/**
 * Read the per-Agent colour choices.
 *
 * A value is kept only when it parses as a plain `#rgb`/`#rrggbb` colour, so a
 * hand-edited file cannot inject CSS into every page. Anything longer than the
 * hex digits — a gradient, a `var(...)`, an `url(...)` — is refused here rather
 * than escaped further down.
 */
function readColors(raw) {
  const out = {}
  if (raw === null || typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    for (const id of Object.keys(raw)) {
      if (typeof id !== 'string' || id.length === 0) continue
      const value = raw[id]
      if (typeof value !== 'string') continue
      if (!/^#[0-9a-fA-F]{6}$/.test(value) && !/^#[0-9a-fA-F]{3}$/.test(value)) continue
      out[id] = value.toLowerCase()
      if (Object.keys(out).length >= MAX_COLORS) break
    }
  }
  return out
}

/**
 * Read the presets hidden from the main-agent menu.
 *
 * Sub-agent personas (the OpenFox workflow roles, for instance) are ordinary
 * presets with no flag of their own, so which ones to keep out of the *agent*
 * picker is a choice, not a derivation. It is stored as a plain id list.
 */
function readHiddenPresets(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const id of raw) {
    if (typeof id !== 'string' || id.length === 0) continue
    if (out.includes(id)) continue
    out.push(id)
    if (out.length >= MAX_HIDDEN) break
  }
  return out
}

/**
 * Read the per-Agent scope and type choices.
 *
 * Neither is derivable from DSH: a declaration carries no "this is a sub-agent"
 * flag, and presets belong to the profile rather than to a project. They are
 * therefore stored choices, kept small and validated so a hand-edited file
 * cannot invent a third scope.
 */
function readPresetMeta(raw) {
  const out = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const id of Object.keys(raw)) {
    if (typeof id !== 'string' || id.length === 0) continue
    const value = raw[id]
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
    const scope = value.scope === 'global' || value.scope === 'project' ? value.scope : undefined
    const kind = value.kind === 'agent' || value.kind === 'subagent' ? value.kind : undefined
    if (scope === undefined && kind === undefined) continue
    out[id] = { ...(scope === undefined ? {} : { scope }), ...(kind === undefined ? {} : { kind }) }
    if (Object.keys(out).length >= MAX_PRESET_META) break
  }
  return out
}

function readPresetBuckets(raw) {
  const out = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const id of Object.keys(raw)) {
    if (typeof id !== 'string' || id.length === 0) continue
    const value = raw[id]
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
    const bucket = {
      toolsOn: names(value.toolsOn),
      toolsOff: names(value.toolsOff),
      promptsOn: names(value.promptsOn),
      promptsOff: names(value.promptsOff),
    }
    if (bucket.toolsOn.length + bucket.toolsOff.length + bucket.promptsOn.length + bucket.promptsOff.length === 0) continue
    out[id] = bucket
    if (Object.keys(out).length >= MAX_PRESETS) break
  }
  return out
}

/**
 * MCP servers each preset keeps, and which of their tools.
 *
 * This is the "forced in this Agent" record: the deny controller subtracts
 * these servers from the profile deny set before it expands them, so an Agent
 * keeps a server after the profile switches it off, and it denies the tools of
 * that server the user did not pick, so a partial selection is a partial
 * selection and not a whole server.
 *
 * `'*'` means every tool the server publishes, including ones it adds later.
 */
function readMcpPins(raw) {
  const out = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const id of Object.keys(raw)) {
    if (typeof id !== 'string' || id.length === 0) continue
    const value = raw[id]
    const servers = {}
    if (Array.isArray(value)) {
      // First shape: a bare list of server names, every tool of each.
      for (const server of names(value).slice(0, MAX_MCP_PINS)) servers[server] = ['*']
    } else if (value !== null && typeof value === 'object') {
      for (const server of Object.keys(value).slice(0, MAX_MCP_PINS)) {
        const spec = value[server]
        if (spec === '*' || spec === true) { servers[server] = ['*']; continue }
        const list = names(spec).slice(0, MAX_PIN_TOOLS)
        if (list.length > 0) servers[server] = list
      }
    }
    if (Object.keys(servers).length === 0) continue
    out[id] = servers
    if (Object.keys(out).length >= MAX_PRESETS) break
  }
  return out
}

export function loadState() {
  const empty = {
    version: STATE_VERSION,
    disabled: [],
    tools: [],
    prompts: [],
    presets: {},
    mcpPins: {},
    mcpToolCache: {},
    colors: {},
    hiddenPresets: [],
    presetMeta: {},
    sessions: {},
    subagentForceModel: false,
    subagentBlockMainModel: false,
    forcedSubagentModel: null,
  }
  try {
    const parsed = JSON.parse(readFileSync(statePath(), 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return empty
    const disabled = names(parsed.disabled)
    const tools = names(parsed.tools)
    const prompts = names(parsed.prompts)
    const subagentForceModel = parsed.subagentForceModel === true
    const subagentBlockMainModel = parsed.subagentBlockMainModel === true
    const forcedSubagentModel = typeof parsed.forcedSubagentModel === 'string' && parsed.forcedSubagentModel.length > 0 ? parsed.forcedSubagentModel : null
    const presets = readPresetBuckets(parsed.presets)
    const mcpPins = readMcpPins(parsed.mcpPins)
    const mcpToolCache = readToolCache(parsed.mcpToolCache)
    const colors = readColors(parsed.colors)
    const hiddenPresets = readHiddenPresets(parsed.hiddenPresets)
    const presetMeta = readPresetMeta(parsed.presetMeta)
    const sessions = {}
    const raw = parsed.sessions
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const id of Object.keys(raw)) {
        if (typeof id !== 'string' || id.length === 0) continue
        const value = raw[id]
        const row = { on: [], off: [], at: 0 }
        if (Array.isArray(value)) {
          // Version 1 of the session shape stored a bare deny list.
          row.off = names(value)
        } else if (value !== null && typeof value === 'object') {
          row.on = names(value.on)
          row.off = names(value.off)
          if (typeof value.at === 'number' && Number.isFinite(value.at)) row.at = value.at
        }
        if (row.on.length === 0 && row.off.length === 0) continue
        sessions[id] = row
      }
    }
    return {
      version: STATE_VERSION,
      disabled,
      tools,
      prompts,
      presets,
      mcpPins,
      mcpToolCache,
      colors,
      hiddenPresets,
      presetMeta,
      sessions,
      subagentForceModel,
      subagentBlockMainModel,
      forcedSubagentModel,
    }
  } catch {
    // Missing or unreadable state: nothing is disabled.
    return empty
  }
}

/** Atomic write of the whole state, with the session map pruned. */
/** The exact document written to disk, shared by both writers. */
function stateBody(state) {
  const disabled = names(state?.disabled)
  const tools = names(state?.tools)
  const prompts = names(state?.prompts)
  const subagentForceModel = state?.subagentForceModel === true
  const subagentBlockMainModel = state?.subagentBlockMainModel === true
  const forcedSubagentModel = typeof state?.forcedSubagentModel === 'string' && state.forcedSubagentModel.length > 0 ? state.forcedSubagentModel : null
  const kept = Object.entries(state?.sessions ?? {})
    .filter(([, row]) => row !== null && typeof row === 'object' && (names(row.on).length > 0 || names(row.off).length > 0))
    .sort((a, b) => (Number(b[1]?.at) || 0) - (Number(a[1]?.at) || 0))
    .slice(0, MAX_SESSIONS)
  const presets = readPresetBuckets(state?.presets)
  const mcpPins = readMcpPins(state?.mcpPins)
  const mcpToolCache = readToolCache(state?.mcpToolCache)
  const colors = readColors(state?.colors)
  const hiddenPresets = readHiddenPresets(state?.hiddenPresets)
  const presetMeta = readPresetMeta(state?.presetMeta)
  const sessions = {}
  for (const [id, row] of kept) {
    sessions[id] = {
      on: names(row.on),
      off: names(row.off),
      at: Number(row.at) || Date.now(),
    }
  }
  return JSON.stringify({
    version: STATE_VERSION,
    disabled,
    tools,
    prompts,
    presets,
    mcpPins,
    mcpToolCache,
    colors,
    hiddenPresets,
    presetMeta,
    sessions,
    subagentForceModel,
    subagentBlockMainModel,
    forcedSubagentModel,
  }, null, 2) + '\n'
}

export async function saveState(state) {
  const path = statePath()
  const body = stateBody(state)
  await mkdir(dirname(path), { recursive: true })
  const temp = path + '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2, 8)
  await writeFile(temp, body, 'utf8')
  try {
    await rename(temp, path)
  } catch (error) {
    if (!['EPERM', 'EEXIST', 'EACCES'].includes(error?.code ?? '')) throw error
    await writeFile(path, body, 'utf8')
  }
}

/** Profile-wide deny list (what the Skill/MCP panel switches write). */
export function loadDisabled() {
  return loadState().disabled
}

/** Rewrite the profile-wide list, keeping the per-conversation overrides. */
export async function saveDisabled(list) {
  const state = loadState()
  state.disabled = names(list)
  await saveState(state)
}

function warnOf(ctx, message) {
  try {
    const logger = typeof ctx?.get === 'function' ? ctx.get('logger') : undefined
    if (logger !== null && logger !== undefined && typeof logger.warn === 'function') {
      logger.warn('[dsh-customizer] ' + message)
      return
    }
  } catch {
    // No logger service: fall through to the console.
  }
  try { if (typeof console !== 'undefined') console.warn('[dsh-customizer] ' + message) } catch { /* ignore */ }
}

function errorText(error) {
  return error !== null && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)
}

/**
 * Applies a dynamic deny list to every Agent scope.
 *
 * `namesOf(agentId)` is evaluated on each (re)application so tools that connect
 * after the switch was flipped are caught by the next `tools/change`, and so a
 * per-conversation override always reads the current state.
 */
export class DisableController {
  constructor(ctx, namesOf, sectionsOf) {
    this.ctx = ctx
    this.namesOf = namesOf
    this.sectionsOf = sectionsOf
    this.mounted = new Map()
    this.mounting = new Set()
    this.syncing = false
    this.disposed = false
  }

  /** One tiny plugin per Agent: it owns the restriction on that scope. */
  pluginFor(agentId) {
    const holder = { sync: () => {} }
    const namesFor = () => this.namesOf(agentId)
    const sectionsFor = () => {
      if (typeof this.sectionsOf !== 'function') return []
      try {
        const list = this.sectionsOf(agentId)
        return Array.isArray(list) ? list : []
      } catch {
        return []
      }
    }
    return {
      holder,
      plugin: {
        name: 'dsh-customizer:tool-deny',
        inject: ['tools'],
        apply(c) {
          let undo
          let applied = null
          let live = true
          let inside = false
          /** section name -> the effect that hides it in this Agent scope. */
          const hidden = new Map()
          let hiddenSignature = null
          const sync = () => {
            if (!live || inside) return
            inside = true
            try {
              run()
            } catch (error) {
              warnOf(c, 'deny sync failed: ' + errorText(error))
            } finally {
              inside = false
            }
            try {
              runSections()
            } catch (error) {
              warnOf(c, 'prompt section sync failed: ' + errorText(error))
            }
          }
          const run = () => {
            const wanted = [...new Set(namesFor().filter((name) => typeof name === 'string' && name.length > 0))].sort()
            const signature = wanted.join('\u0000')
            if (signature === applied) return
            if (undo !== undefined) {
              try { undo() } catch (error) { warnOf(c, 'undo failed: ' + errorText(error)) }
              undo = undefined
              applied = null
            }
            if (wanted.length === 0) {
              applied = ''
              return
            }
            // `restrict` hides only GLOBAL tools and rejects the whole filter
            // when one name belongs to this scope, so a failing batch is
            // retried name by name and whatever the scope can hide is kept.
            // Reading `tools.view()` first is not an option: this build has no
            // such method, and its absence used to abort every restriction
            // silently, leaving the switches without effect.
            const holders = []
            const kept = []
            try {
              holders.push(c.tools.restrict({ deny: wanted }))
              kept.push(...wanted)
            } catch {
              for (const name of wanted) {
                try {
                  holders.push(c.tools.restrict({ deny: [name] }))
                  kept.push(name)
                } catch { /* scope-local or unknown here: nothing to hide */ }
              }
            }
            undo = () => {
              for (const disposer of holders) {
                try { disposer() } catch (error) { warnOf(c, 'undo failed: ' + errorText(error)) }
              }
            }
            applied = signature
            const stuck = wanted.filter((name) => !kept.includes(name))
            if (stuck.length > 0) {
              warnOf(c, 'cannot hide these tools in this scope: ' + stuck.join(', '))
            }
          }
          /**
           * Hide switched-off prompt sections for this Agent only.
           *
           * A scoped section shadows the global one with the same name, and an
           * empty section is dropped when the prompt renders, so registering an
           * empty shadow is a reversible "off" that never touches the plugin
           * that owns the text. Sections already registered in this very scope
           * (an agent preset persona, for instance) cannot be shadowed: the
           * duplicate is reported once and left alone.
           */
          const runSections = () => {
            let prompt
            try {
              prompt = typeof c.get === 'function' ? c.get('systemPrompt') : undefined
            } catch {
              prompt = undefined
            }
            if (prompt === undefined || prompt === null) return
            if (typeof prompt.section !== 'function') return
            const wanted = [...new Set(sectionsFor().filter((name) => typeof name === 'string' && name.length > 0))].sort()
            const signature = wanted.join('\u0000')
            if (signature === hiddenSignature) return
            for (const [name, disposer] of [...hidden]) {
              if (wanted.includes(name)) continue
              hidden.delete(name)
              try { disposer() } catch (error) { warnOf(c, 'cannot restore prompt section ' + name + ': ' + errorText(error)) }
            }
            for (const name of wanted) {
              if (hidden.has(name)) continue
              try {
                hidden.set(name, prompt.section({ name, order: 0, text: '', interpolate: false }))
              } catch (error) {
                // Keep it in the map with a no-op so the failure is reported
                // once per change instead of on every tools/change pass.
                hidden.set(name, () => {})
                warnOf(c, 'cannot hide prompt section "' + name + '": ' + errorText(error))
              }
            }
            hiddenSignature = signature
          }
          holder.sync = sync
          try {
            c.effect(() => () => {
              live = false
              holder.sync = () => {}
            })
          } catch {
            // Minimal host without effect: at least stop being called by the controller.
          }
          sync()
        },
      },
    }
  }

  syncAll() {
    if (this.disposed || this.syncing) return
    this.syncing = true
    try {
      for (const entry of [...this.mounted.values()]) {
        try { entry.holder.sync() } catch (error) { warnOf(this.ctx, 'reapply failed: ' + errorText(error)) }
      }
    } finally {
      this.syncing = false
    }
  }

  /** Re-evaluate one Agent only: a per-conversation switch must not disturb the others. */
  syncOne(agentId) {
    if (this.disposed) return
    const entry = this.mounted.get(agentId)
    if (entry === undefined) return
    try { entry.holder.sync() } catch (error) { warnOf(this.ctx, 'reapply failed: ' + errorText(error)) }
  }

  applyTo(agent) {
    if (this.disposed) return
    const id = typeof agent?.id === 'string' ? agent.id : undefined
    if (id === undefined || this.mounted.has(id) || this.mounting.has(id)) return
    const scopeCtx = agent.ctx
    if (scopeCtx === undefined || typeof scopeCtx.plugin !== 'function') return
    this.mounting.add(id)
    try {
      const { plugin, holder } = this.pluginFor(id)
      const fiber = scopeCtx.plugin(plugin)
      this.mounted.set(id, { fiber, holder })
    } catch (error) {
      warnOf(this.ctx, 'cannot mount the deny plugin (agent ' + id + '): ' + errorText(error))
    } finally {
      this.mounting.delete(id)
    }
  }

  reapply() {
    if (this.disposed) return
    for (const agent of this.listAgents()) this.applyTo(agent)
  }

  release(id) {
    this.mounted.delete(id)
  }

  /** Re-evaluate after the profile-wide set changed: remount with the new names. */
  setChanged() {
    if (this.disposed) return
    this.unmountAll()
    this.reapply()
  }

  unmountAll() {
    for (const [id, entry] of [...this.mounted.entries()]) {
      this.mounted.delete(id)
      try { entry.fiber?.dispose?.() } catch (error) { warnOf(this.ctx, 'unmount failed (agent ' + id + '): ' + errorText(error)) }
    }
  }

  listAgents() {
    try {
      const agents = this.ctx.get('agents')
      const rows = agents?.list?.()
      return Array.isArray(rows) ? rows : []
    } catch {
      return []
    }
  }

  dispose() {
    this.disposed = true
    this.unmountAll()
  }
}

/** Subscribe the controller to Agent lifecycle and tool changes. */
export function attachDisableController(ctx, namesOf, sectionsOf) {
  const controller = new DisableController(ctx, namesOf, sectionsOf)
  const offCreated = ctx.on('agent/created', (payload) => controller.applyTo(payload?.agent))
  const offDisposed = ctx.on('agent/disposed', (payload) => {
    const id = payload?.agent?.id
    if (typeof id === 'string') controller.release(id)
  })
  const offTools = ctx.on('tools/change', () => controller.syncAll())
  controller.reapply()
  const originalDispose = controller.dispose.bind(controller)
  controller.dispose = () => {
    for (const off of [offCreated, offDisposed, offTools]) {
      if (typeof off !== 'function') continue
      try { off() } catch { /* scope already gone */ }
    }
    originalDispose()
  }
  return controller
}

/**
 * Write the state synchronously.
 *
 * Used on the way out of the process: a deferred write that has not fired yet
 * would otherwise be lost on quit, which is exactly how a remembered MCP weight
 * disappeared across a restart.
 */
export function saveStateSync(state) {
  try {
    const path = statePath()
    const body = stateBody(state)
    mkdirSync(dirname(path), { recursive: true })
    const temp = path + '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2, 8)
    writeFileSync(temp, body, 'utf8')
    try {
      renameSync(temp, path)
    } catch (error) {
      if (!['EPERM', 'EEXIST', 'EACCES'].includes(error?.code ?? '')) throw error
      writeFileSync(path, body, 'utf8')
    }
    return true
  } catch {
    return false
  }
}
