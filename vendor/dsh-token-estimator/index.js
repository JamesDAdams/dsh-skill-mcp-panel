import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * Host half of @local/token-estimator.
 *
 * One read-only JSON endpoint, queried by the Client half while a conversation
 * is being composed:
 *
 *   GET /local-token-estimator/estimate?text=<draft>&session=<optional id>
 *
 * Numbers come from the harness itself whenever the Session already has a
 * measured request: `ctx.sessionProjections.snapshot()` yields the very
 * `contextPressure` and `contextBreakdown` units the native composer meter
 * reads, so the three totals (system prompt, tool definitions, messages) match
 * the shipped UI exactly. Only when a Session has no measurement yet \u2014 the
 * first message of a brand-new conversation \u2014 the prompt is assembled and
 * priced with the token-meter heuristic, and the payload says so
 * (`source: "estimate"`). Per-item rows are always heuristic detail.
 *
 * Nothing here logs, mutates a Session, or calls a model, and every failure is
 * turned into a JSON payload instead of an exception.
 */

const ROUTE = '/local-token-estimator/estimate'
/** Fixed heuristic shared with dsh-token-meter: four characters per token. */
function price(text) {
  return typeof text === 'string' && text.length > 0 ? Math.ceil(text.length / 4) : 0
}

/**
 * Price one tool declaration the way the wire carries it: the complete JSON of
 * the schema, keys included. Dropping the `{"name":…,"description":…,
 * "parameters":…}` envelope underpriced every tool by ~10 tokens and made the
 * totals disagree with the harness counter.
 */
function priceSchema(schema) {
  try {
    return price(JSON.stringify(schema))
  } catch {
    return price(String(schema?.name ?? '')) + price(String(schema?.description ?? ''))
  }
}

/**
 * The Host mounts one MCP bridge under the server name `mcp-resource-servers`.
 * Its tools carry ordinary names (no `mcp__` prefix), so they must be listed
 * explicitly — otherwise they are counted as regular tools, that server never
 * appears in the MCP row, and switching it off changes nothing.
 */
const RESOURCE_SERVER = 'mcp-resource-servers'
const RESOURCE_TOOLS = new Set([
  'list_mcp_resources',
  'list_mcp_resource_templates',
  'read_mcp_resource',
])

function isMcpTool(name) {
  const text = String(name ?? '')
  if (RESOURCE_TOOLS.has(text)) return true
  return /^mcp([_:.-]|$)/i.test(text)
}

/** `mcp__wincu__snapshot` -> `wincu`; the resource bridge -> its server name. */
function mcpServerOf(name) {
  const text = String(name ?? '')
  if (RESOURCE_TOOLS.has(text)) return RESOURCE_SERVER
  if (!text.startsWith('mcp__')) return undefined
  const rest = text.slice('mcp__'.length)
  const cut = rest.indexOf('__')
  return cut === -1 ? rest : rest.slice(0, cut)
}

/**
 * MCP servers switched off for one Session. The registry keeps the definitions
 * of a disabled server, so an unscoped tool read would price tools that are
 * never sent. `dsh-mcp-companion` records the switches in its state file:
 *
 *   { "version": 2, "disabled": ["wincu"],
 *     "sessions": { "<sessionId>": { "on": [], "off": ["mcp-resource-servers"] } } }
 *
 * The profile list is the default; a Session's `off` adds to it and its `on`
 * re-enables a server just for that conversation.
 */
function disabledMcpServers(sessionId) {
  let state
  try {
    const home = process.env.DSH_HOME || join(homedir(), '.dsh')
    state = JSON.parse(readFileSync(join(home, 'dsh-customizer', 'state.json'), 'utf8'))
  } catch {
    return new Set()
  }
  const names = (value) => (Array.isArray(value) ? value.filter((name) => typeof name === 'string' && name.length > 0) : [])
  const disabled = new Set(names(state?.disabled))
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    const perSession = state?.sessions?.[sessionId]
    if (perSession !== null && typeof perSession === 'object') {
      for (const name of names(perSession.off)) disabled.add(name)
      for (const name of names(perSession.on)) disabled.delete(name)
    }
  }
  return disabled
}

function isSkillName(name) {
  return /skill/i.test(String(name ?? ''))
}

/**
 * A prompt section that carries tool declarations instead of instructions.
 *
 * The PTC executor does not send the capability catalogue as request schemas:
 * `describe()` puts one transport schema (`run_code`) in the envelope and
 * renders every visible tool as the `tools:sdk` section — the `declare const
 * tools` text the model programs against — plus `tools:ptc-only` beside it.
 * Pricing only the envelope is why a ~16K catalogue read ~800 tokens, so these
 * sections are priced as tool declarations and the prompt side loses them.
 *
 * The match is the plural `tools:` prefix only: `tool:<name>` sections are
 * per-tool usage guidance in native mode and stay with the system prompt.
 */
function isToolSectionName(name) {
  return /^tools:/i.test(String(name ?? ''))
}

function serviceOrUndefined(ctx, name) {
  // `ctx.get` reaches services this plugin does not inject (the preset registry,
  // for one) without declaring a hard dependency on them.
  try {
    const direct = typeof ctx.get === 'function' ? ctx.get(name) : undefined
    if (direct !== undefined && direct !== null) return direct
  } catch { /* absent service */ }
  try {
    const value = ctx[name]
    return value === undefined ? undefined : value
  } catch {
    return undefined
  }
}

function eventCountOf(agent) {
  const session = agent?.session
  if (session !== undefined && session !== null) {
    const seq = session.seq
    if (typeof seq === 'number' && Number.isFinite(seq)) return seq
    const events = session.events
    if (Array.isArray(events)) return events.length
  }
  return 0
}

function rootsOf(ctx) {
  const agents = serviceOrUndefined(ctx, 'agents')
  try {
    const roots = agents?.roots?.()
    if (Array.isArray(roots) && roots.length > 0) return roots
  } catch { /* fall back to every live agent */ }
  try {
    const all = agents?.list?.()
    return Array.isArray(all) ? all : []
  } catch {
    return []
  }
}

function agentById(ctx, sessionId) {
  try {
    const found = serviceOrUndefined(ctx, 'agents')?.get?.(sessionId)
    return found === undefined ? undefined : found
  } catch {
    return undefined
  }
}

/** The `contextPressure` the native composer meter shows, when it exists. */
function projectionsOf(ctx, session) {
  const projections = serviceOrUndefined(ctx, 'sessionProjections')
  if (projections === undefined || typeof projections.snapshot !== 'function') return undefined
  try {
    const snapshot = projections.snapshot(session, ['contextPressure', 'contextBreakdown'])
    return snapshot?.values
  } catch {
    return undefined
  }
}

/**
 * The Agent preset the Session runs, so another panel can match its own
 * per-preset row to this exact conversation instead of guessing.
 */
function presetOf(ctx, session) {
  if (session === undefined || session === null) return undefined
  const projections = serviceOrUndefined(ctx, 'sessionProjections')
  if (projections === undefined || typeof projections.snapshot !== 'function') return undefined
  try {
    const value = projections.snapshot(session, ['agentPreset'])?.values?.agentPreset
    return typeof value === 'string' && value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Pick the Session this estimate describes. A root Agent whose log is still
 * empty is the conversation that has been opened but not sent yet \u2014 exactly the
 * draft in front of the user. Failing that, the most recent measured root (the
 * conversation on screen, whose native meter already has numbers).
 */
function pickAgent(ctx, requestedSession) {
  if (typeof requestedSession === 'string' && requestedSession.length > 0) {
    const direct = agentById(ctx, requestedSession)
    if (direct !== undefined) return direct
  }
  const roots = rootsOf(ctx)
  if (roots.length === 0) return undefined
  const empty = roots.filter((agent) => eventCountOf(agent) === 0)
  if (empty.length > 0) return empty[empty.length - 1]
  const measured = roots
    .filter((agent) => {
      const values = projectionsOf(ctx, agent?.session)
      return values?.contextBreakdown !== undefined || values?.contextPressure !== undefined
    })
    .sort((a, b) => eventCountOf(b) - eventCountOf(a))
  if (measured.length > 0) return measured[0]
  return [...roots].sort((a, b) => eventCountOf(a) - eventCountOf(b))[0]
}

function modelSelectionOf(ctx, agent) {
  try {
    const current = agent?.model?.current?.()
    if (current !== undefined && current !== null) return current
  } catch { /* fall through */ }
  try {
    const selection = serviceOrUndefined(ctx, 'agentDefaultModel')?.currentSelection?.()
    if (selection !== undefined && selection !== null) return selection
  } catch { /* fall through */ }
  return undefined
}

function textOf(entry) {
  try {
    const value = entry?.text
    if (typeof value === 'string') return value
    if (typeof value === 'function') {
      const rendered = value({})
      return typeof rendered === 'string' ? rendered : ''
    }
  } catch { /* ignore unusable entries */ }
  return ''
}

function catalogItems(text) {
  const items = []
  if (typeof text !== 'string' || text.length === 0) return items
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*[-*]\s+`?([A-Za-z0-9][\w:.-]{1,80})`?\s*[:\u2014-]/.exec(line)
    if (match !== null) items.push({ name: match[1], tokens: price(line.trim()) })
  }
  return items
}

/** Assemble the exact prompt the next step would send, for a new conversation. */
async function assembleFor(ctx, agent) {
  const systemPrompt = serviceOrUndefined(ctx, 'systemPrompt')
  if (systemPrompt === undefined || typeof systemPrompt.assemble !== 'function') {
    return { assembly: {}, source: 'none' }
  }
  if (agent === undefined) {
    try {
      return { assembly: await systemPrompt.assemble({}), source: 'estimate' }
    } catch {
      return { assembly: {}, source: 'none' }
    }
  }
  try {
    const tools = serviceOrUndefined(ctx, 'tools')
    let toolSet
    if (tools !== undefined && typeof tools.resolve === 'function') {
      try {
        // The activation contract is mandatory: `resolve` starts with
        // `signal.throwIfAborted()`, so an omitted signal rejects the whole
        // call and the assembly would silently fall back to the wider visible
        // set — pricing tools the step never admits.
        toolSet = await tools.resolve({
          agent,
          modelSelection: modelSelectionOf(ctx, agent),
          signal: new AbortController().signal,
        })
      } catch { /* assemble without a tool set */ }
    }
    const context = toolSet === undefined
      ? { agent, scope: agent }
      : { agent, scope: agent, modelSelection: modelSelectionOf(ctx, agent), toolSet }
    return { assembly: await systemPrompt.assemble(context), source: 'estimate' }
  } catch {
    try {
      return { assembly: await systemPrompt.assemble({}), source: 'estimate' }
    } catch {
      return { assembly: {}, source: 'none' }
    }
  }
}

function groupOf(id, label) {
  return { id, label, tokens: 0, items: [] }
}

function pushItem(target, name, tokens, extra) {
  if (!(tokens > 0)) return
  target.items.push({ name: String(name ?? '').slice(0, 120), tokens, ...(extra ?? {}) })
}

function sum(items) {
  return items.reduce((total, item) => total + (Number(item?.tokens) || 0), 0)
}

/**
 * The harness reports one figure per family ("the prompt", "the tools"). Split
 * it in the proportion the per-item heuristics show, so a sub-row (skills,
 * MCP) is a genuine part of the measured number and every row still adds up to
 * it exactly.
 */
function splitCombined(combined, primaryTokens, secondaryTokens) {
  if (!(combined > 0)) return { primary: primaryTokens, secondary: secondaryTokens }
  const heuristics = primaryTokens + secondaryTokens
  if (!(heuristics > 0)) return { primary: combined, secondary: 0 }
  const secondary = Math.round((combined * secondaryTokens) / heuristics)
  return { primary: Math.max(0, combined - secondary), secondary }
}

/** The conversation that has been opened but not sent yet, if one is live. */
function pickEmptyRoot(ctx) {
  const empty = rootsOf(ctx).filter((agent) => eventCountOf(agent) === 0)
  return empty.length === 0 ? undefined : empty[empty.length - 1]
}

/** Exported for the offline estimate test; the plugin itself only routes to it. */
export async function buildEstimate(ctx, draft, requestedSession, fresh) {
  // An explicit Session must never be swapped for another one: a brand-new
  // conversation has no Agent yet, and borrowing a neighbour's measured numbers
  // would be a lie. In that case the prompt is assembled for this Session.
  const explicit = typeof requestedSession === 'string' && requestedSession.length > 0
  const agent = explicit
    ? agentById(ctx, requestedSession)
    : (fresh === true ? pickEmptyRoot(ctx) : pickAgent(ctx))
  const session = agent?.session
  const values = session === undefined ? undefined : projectionsOf(ctx, session)
  const breakdown = values?.contextBreakdown
  const pressure = values?.contextPressure

  const nativeSystem = positiveOrUndefined(breakdown?.systemTokens)
  const nativeTools = positiveOrUndefined(breakdown?.toolsTokens)
  const nativeMessages = positiveOrUndefined(breakdown?.messageTokens)
  const nativeTotal = positiveOrUndefined(pressure?.projectedTokens)
    ?? positiveOrUndefined(pressure?.pressureTokens)
  const capacity = numberOrUndefined(pressure?.contextWindow)
  const native = nativeSystem !== undefined || nativeTools !== undefined || nativeMessages !== undefined

  // The request: the prompt the Agent assembles for its next step. The native
  // `contextPressure` / `contextBreakdown` units are the authority once the
  // Session has sent something, so the rows match the composer meter exactly.
  const { assembly } = await assembleFor(ctx, agent)

  // --- detail rows, always heuristic -------------------------------------
  const systemItems = []
  const skillItems = []
  const toolSectionItems = []
  const contextItems = []
  for (const section of Array.isArray(assembly?.sections) ? assembly.sections : []) {
    const text = textOf(section)
    if (text.length === 0) continue
    const name = String(section?.name ?? 'section')
    if (isSkillName(name)) {
      const parsed = catalogItems(text)
      if (parsed.length === 0) skillItems.push({ name, tokens: price(text) })
      else for (const item of parsed) skillItems.push(item)
    } else if (isToolSectionName(name)) {
      // Declared catalogue. On the wire this text is part of the system
      // message, so it stays in the system prompt total — moving it would make
      // the rows disagree with the harness counter and with the session log.
      // It is flagged and reported apart because it is tool-declaration weight.
      const item = { name, tokens: price(text) }
      systemItems.push({ ...item, tag: 'CATALOGUE' })
      toolSectionItems.push(item)
    } else {
      systemItems.push({ name, tokens: price(text) })
    }
  }
  for (const context of Array.isArray(assembly?.contexts) ? assembly.contexts : []) {
    const text = textOf(context)
    if (text.length === 0) continue
    contextItems.push({ name: String(context?.name ?? 'context'), tokens: price(text) })
  }

  const toolItems = []
  const mcpItems = []
  const scopeSessionId = explicit
    ? requestedSession
    : (typeof session?.id === 'string' ? session.id : undefined)
  const disabled = disabledMcpServers(scopeSessionId)
  const usable = (name) => {
    const server = mcpServerOf(name)
    return server === undefined || !disabled.has(server)
  }
  const schemas = Array.isArray(assembly?.tools) ? assembly.tools : []
  for (const schema of schemas) {
    const name = String(schema?.name ?? 'tool')
    if (!usable(name)) continue
    const tokens = priceSchema(schema)
    if (isMcpTool(name)) mcpItems.push({ name, tokens })
    else toolItems.push({ name, tokens })
  }

  // The registry is read only when the Session resolved no tool set at all (no
  // Agent yet). Widening a resolved set would re-add the very tools a profile
  // plugin denied on the Agent scope, so a disable switch would never move this
  // panel.
  if (schemas.length === 0) {
    try {
      const all = serviceOrUndefined(ctx, 'tools')?.schemas?.()
      if (Array.isArray(all)) {
        for (const schema of all) {
          const name = String(schema?.name ?? 'tool')
          if (!usable(name)) continue
          if (toolItems.some((item) => item.name === name)) continue
          if (mcpItems.some((item) => item.name === name)) continue
          const tokens = priceSchema(schema)
          if (isMcpTool(name)) mcpItems.push({ name, tokens })
          else toolItems.push({ name, tokens })
        }
      }
    } catch { /* keep what the assembly provided */ }
  }

  // A skill catalog is only a row of its own when the preset renders one as a
  // prompt section. Listing the registry instead added weight the composer
  // meter never counts — the skills also appear inside the tools that expose
  // them — so the panel no longer invents that row.

  const draftTokens = price(draft)
  const systemHeuristic = sum(systemItems)
  const skillHeuristic = sum(skillItems)
  const estimateSystem = systemHeuristic + skillHeuristic
  const mcpHeuristic = sum(mcpItems)
  const toolsHeuristic = sum(toolItems)
  const estimateTools = toolsHeuristic + mcpHeuristic
  // Declared catalogue weight, reported apart for the Client note. It is not
  // added to the tool row: on the wire those tokens are prompt text.
  const toolSectionHeuristic = sum(toolSectionItems)
  const estimateMessages = sum(contextItems) + draftTokens

  const groups = [
    groupOf('system', 'System prompt'),
    groupOf('skills', 'Skills'),
    groupOf('tools', 'Tool definitions'),
    groupOf('mcp', 'MCP'),
    groupOf('messages', 'Messages'),
  ]

  // An unmeasured Session is priced from its own assembly, which already
  // reflects whatever the Agent scope restricts: hidden prompt sections are
  // empty, denied tools are absent. Borrowing a measured figure instead would
  // freeze those switches — a profile plugin that hides a section or denies a
  // tool would never move this panel.
  const systemAndSkills = nativeSystem ?? estimateSystem
  // A measured Session reports one combined "tools" figure, which already
  // contains MCP. An unmeasured one is priced from its own tool set: borrowing
  // the combined figure would make "Tool definitions" shrink when an MCP server
  // is enabled, which is exactly backwards.
  const toolsAndMcp = nativeTools ?? estimateTools
  const messagesTokens = nativeMessages ?? estimateMessages

  // The harness reports the prompt as one figure and the tools as one figure;
  // each is split in the proportion the per-item heuristics show, so the rows
  // still add up to the measured numbers.
  const systemSplit = splitCombined(systemAndSkills, systemHeuristic, skillHeuristic)
  const split = splitCombined(toolsAndMcp, toolsHeuristic, mcpHeuristic)

  groups[0].tokens = systemSplit.primary
  groups[1].tokens = systemSplit.secondary
  groups[2].tokens = split.primary
  groups[3].tokens = split.secondary
  groups[4].tokens = messagesTokens

  groups[0].items = [...systemItems].sort((a, b) => b.tokens - a.tokens)
  groups[1].items = [...skillItems].sort((a, b) => b.tokens - a.tokens)
  groups[2].items = [...toolItems].sort((a, b) => b.tokens - a.tokens)
  groups[3].items = [...mcpItems].sort((a, b) => b.tokens - a.tokens)
  groups[4].items = [...contextItems, ...(draftTokens > 0 ? [{ name: 'Draft text', tokens: draftTokens }] : [])]
    .sort((a, b) => b.tokens - a.tokens)

  const total = nativeTotal ?? groups.reduce((accumulator, group) => accumulator + group.tokens, 0)

  return {
    ok: true,
    source: native ? 'native' : 'estimate',
    session: explicit ? requestedSession : (typeof session?.id === 'string' ? session.id : (typeof agent?.id === 'string' ? agent.id : undefined)),
    model: typeof modelSelectionOf(ctx, agent)?.model === 'string' ? modelSelectionOf(ctx, agent).model : undefined,
    preset: presetOf(ctx, session),
    provider: typeof modelSelectionOf(ctx, agent)?.provider === 'string' ? modelSelectionOf(ctx, agent).provider : undefined,
    total,
    used: numberOrUndefined(pressure?.pressureTokens),
    capacity,
    draftChars: draft.length,
    groups,
    details: {
      // Only the tools actually resolved for this Agent's next step appear; an
      // MCP server that is not wired into the preset contributes nothing.
      mcp: {
        active: mcpItems.length > 0,
        tokens: split.mcp,
        items: [...mcpItems].sort((a, b) => b.tokens - a.tokens),
        tools: [...toolItems].sort((a, b) => b.tokens - a.tokens),
      },
      // PTC steps declare their catalogue as prompt text instead of request
      // schemas. The Client names the weight on the tool row and in the note.
      toolSections: {
        active: toolSectionItems.length > 0,
        tokens: toolSectionHeuristic,
        items: [...toolSectionItems].sort((a, b) => b.tokens - a.tokens),
      },
      skills: skillItems.sort((a, b) => b.tokens - a.tokens),
    },
  }
}

function numberOrUndefined(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * A projection that reports zero carries no measurement: a Session that has not
 * sent anything yet still exposes the unit with every counter at 0. Treating
 * that as "measured" is what made the panel show zeros before the first message.
 */
function positiveOrUndefined(value) {
  const number = numberOrUndefined(value)
  return number !== undefined && number > 0 ? number : undefined
}

function sendJson(res, status, payload) {  try {
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

export const inject = ['webServer', 'systemPrompt', 'tools', 'agents', 'sessionProjections', 'skills']

export function apply(ctx) {
  try {
    const register = () => ctx.webServer.register({
      kind: 'exact',
      path: ROUTE,
      handler: async (req, res) => {
        try {
          const url = new URL(req.url ?? ROUTE, 'http://localhost')
          const draft = (url.searchParams.get('text') ?? '').slice(0, 200000)
          const session = url.searchParams.get('session') ?? undefined
          const fresh = url.searchParams.get('fresh') === '1'
          sendJson(res, 200, await buildEstimate(ctx, draft, session, fresh))
        } catch (error) {
          sendJson(res, 200, {
            ok: false,
            source: 'error',
            total: 0,
            groups: [],
            error: String(error?.message ?? error).slice(0, 200),
          })
        }
      },
    })
    const dispose = typeof ctx.effect === 'function' ? ctx.effect(register) : register()
    return () => {
      try { if (typeof dispose === 'function') dispose() } catch { /* already gone */ }
    }
  } catch {
    // Never let this plugin take the Host down; the Client shows "n/a" instead.
    return undefined
  }
}
