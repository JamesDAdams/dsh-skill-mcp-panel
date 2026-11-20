/**
 * Client half of dsh-mcp-companion.
 *
 * Two jobs, both additive and both inside another plugin's existing UI:
 *
 * 1. Skill/MCP panel decoration. A server another plugin mounts itself - the
 *    `wincu` Windows computer-use server is created with
 *    `ctx.plugin(bridge, bridgeConfig(...))` inside dsh-computer-use-win, so it
 *    has no `@deepseek-ai/dsh-mcp-client` row in cordis.patch.yml - cannot
 *    appear in the panel's list, which is built from that file. This module
 *    decorates the panel's Remote results at runtime:
 *
 *      - `list` and `reload` gain one read-only entry per live server the Host
 *        inventory route reports with source "plugin", so the panel's own cards
 *        render them (its Refresh button calls `reload`);
 *      - `test` answers from the live tool registry instead of a missing row;
 *      - `readRaw` explains why no YAML row exists;
 *      - save / setEnabled / removeServer / writeRaw are refused with a readable
 *        reason, because those servers belong to another plugin.
 *
 * 2. Conversation MCP chip. A pill in the New Session row (the additive
 *    `conversation.hero.options` slot, right of the workspace and mode preset
 *    controls) that opens a menu listing the MCP servers with a switch per
 *    server. Each switch writes an override for the current conversation, so
 *    the Host denies those tools for that Agent only - never for the others.
 *
 * This file stays pure ASCII on purpose: the Client bundle builder decodes
 * plugin sources as Latin-1, so non-ASCII literals must be escaped.
 */

window.__ModuleLoader__.load({
  id: 'dsh-mcp-companion',
  factory(require) {
    // The browser module table owns the React runtime; a build without it must
    // still keep the panel decoration working.
    let React
    try { React = require('react') } catch { React = undefined }

    const ENDPOINT = '/local-dsh-customizer/mcp-servers'
    const CLIENT_VERSION = '1.5.1'
    /** The Host's MCP resource bridge: never a user-chosen server. */
    const RESOURCE_BRIDGE_NAME = 'mcp-resource-servers'
    const CHIP_SLOT = 'conversation.hero.options'
    const CHIP_ID = 'mcp-companion.conversation'

    /** Methods the panel uses to change a row: refused for foreign servers. */
    const GUARDED = new Set(['save', 'removeServer', 'writeRaw'])
    /** Methods that answer with the panel's full list result. */
    const LIST_METHODS = new Set(['list', 'reload'])

    /** Objects already wrapped by this page's module instance. */
    const PATCHED_TARGETS = new WeakSet()
    /** Marks the wrapper function itself, so a reloaded bundle does not stack. */
    const PATCH_MARK = Symbol.for('dsh-customizer.patched-invoke')

    const inventory = { value: null, at: 0, pending: null }
    const foreign = new Map()
    const bridges = new Set()

    /** Fire-and-forget status report, visible in the route diagnostics. */
    function report(kind, text) {
      try {
        const url = ENDPOINT + '?diag=' + encodeURIComponent(String(kind))
          + '&text=' + encodeURIComponent(String(text ?? '').slice(0, 280))
          + '&client=' + CLIENT_VERSION
        fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } }).catch(() => {})
      } catch {
        // Reporting must never break the UI.
      }
    }

    function fetchJson(url) {
      return fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } })
        .then((response) => response.json())
    }

    /* ------------------------------------------------------------------ */
    /* 1. Skill/MCP panel decoration                                       */
    /* ------------------------------------------------------------------ */

    function refresh(force) {
      const now = Date.now()
      if (!force && inventory.value !== null && now - inventory.at < 5000) {
        return Promise.resolve(inventory.value)
      }
      if (inventory.pending !== null) return inventory.pending
      inventory.pending = fetch(ENDPOINT + '?client=' + CLIENT_VERSION, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      })
        .then((response) => response.json())
        .then((payload) => remember(payload))
        .catch(() => inventory.value)
        .finally(() => { inventory.pending = null })
      return inventory.pending
    }

    /** Cache one inventory payload and rebuild the plugin-owned lookups. */
    function remember(payload) {
      if (payload === null || typeof payload !== 'object' || payload.ok !== true) return inventory.value
      inventory.value = payload
      inventory.at = Date.now()
      foreign.clear()
      bridges.clear()
      for (const server of Array.isArray(payload.servers) ? payload.servers : []) {
        if (server === null || typeof server !== 'object') continue
        if (server.source !== 'plugin' && server.source !== 'bridge') continue
        foreign.set(String(server.name), server)
        if (server.source === 'bridge') bridges.add(String(server.name))
      }
      return inventory.value
    }

    const ownerOf = (name) => {
      const server = foreign.get(name)
      return server !== undefined && typeof server.provider === 'string' ? server.provider : 'another plugin'
    }

    const messageOf = (name) =>
      name + ' is provided by ' + ownerOf(name)
      + ': it has no @deepseek-ai/dsh-mcp-client row in cordis.patch.yml. '
      + 'The panel shows it read-only; configure it in the settings of that plugin.'

    const rawTextOf = (name) =>
      '# ' + name + ' \u2014 server provided by ' + ownerOf(name) + '\n'
      + '#\n'
      + '# That server is mounted by the plugin itself (ctx.plugin(@deepseek-ai/dsh-mcp-client)),\n'
      + '# so on purpose there is no @deepseek-ai/dsh-mcp-client row here.\n'
      + '# Adding one would start a second server. Use the settings of that plugin.\n'

    /** `serverName` from the args of a namespace method, whichever shape it uses. */
    function serverNameOf(args) {
      const first = Array.isArray(args) ? args[0] : undefined
      if (typeof first === 'string') return first
      if (first !== null && typeof first === 'object') {
        if (typeof first.serverName === 'string') return first.serverName
        if (typeof first.previousServerName === 'string') return first.previousServerName
        if (first.input !== null && typeof first.input === 'object' && typeof first.input.serverName === 'string') {
          return first.input.serverName
        }
      }
      return undefined
    }

    /** The view one live foreign server contributes to the panel list. */
    function viewOf(server) {
      return {
        serverName: String(server.name),
        transport: server.transport === 'http' ? 'streamable-http' : server.transport === 'stdio' ? 'stdio' : 'unknown',
        enabled: server.enabled !== false,
        // The switch is ours: it denies the server's tools while off.
        disabledExpr: false,
        envKeys: [],
        headerKeys: [],
        managed: true,
        orphan: true,
        toolCallTimeoutMs: 90000,
        failOnStartupError: false,
        reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 },
        fiberPhase: server.active === true ? 'active' : 'pending',
        toolCount: typeof server.toolCount === 'number' ? server.toolCount : 0,
      }
    }

    /** Only a result with both a servers array and a patch block is the panel's list. */
    function isMcpList(envelope) {
      if (envelope === null || typeof envelope !== 'object' || envelope.ok !== true) return false
      const data = envelope.value
      return data !== null && typeof data === 'object'
        && Array.isArray(data.servers)
        && data.patch !== null && typeof data.patch === 'object'
    }

    function augmentList(envelope) {
      const data = envelope.value
      const servers = Array.isArray(data.servers) ? data.servers : []
      return refresh(false).then((payload) => {
        if (payload === null) return envelope
        const rows = Array.isArray(payload.servers) ? payload.servers : []
        const fresh = new Map()
        for (const server of rows) {
          if (server === null || typeof server !== 'object') continue
          if (server.source !== 'plugin' && server.source !== 'bridge') continue
          fresh.set(String(server.name), viewOf(server))
        }
        if (fresh.size === 0) return envelope
        // Replace our own stale entries (a previous bundle may have written
        // them), then append servers the list does not know yet.
        const merged = servers.map((server) => {
          const name = String(server?.serverName ?? '')
          const replacement = fresh.get(name)
          return replacement !== undefined && server?.orphan === true ? replacement : server
        })
        const present = new Set(merged.map((server) => String(server?.serverName ?? '')))
        const additions = [...fresh.values()].filter((view) => !present.has(view.serverName))
        if (additions.length === 0 && merged.every((server, index) => server === servers[index])) return envelope
        return { ...envelope, value: { ...data, servers: [...merged, ...additions] } }
      })
    }

    /** Tool list of the MCP resource bridge: its tools carry no mcp__ prefix. */
    function bridgeToolsOf(name) {
      return refresh(false).then((payload) => {
        const server = payload !== null && Array.isArray(payload.servers)
          ? payload.servers.find((row) => row !== null && row.name === name)
          : undefined
        const tools = (Array.isArray(server?.tools) ? server.tools : []).map((tool) => ({
          name: String(tool?.name ?? ''),
          description: typeof tool?.description === 'string' ? tool.description : '',
        }))
        return {
          ok: true,
          value: { serverName: name, tools, disabled: [], connected: tools.length > 0 },
        }
      })
    }

    function testOf(name) {
      return refresh(false).then((payload) => {
        const server = payload !== null && Array.isArray(payload.servers)
          ? payload.servers.find((row) => row !== null && row.name === name)
          : undefined
        const prefix = 'mcp__' + name + '__'
        const tools = (Array.isArray(server?.tools) ? server.tools : []).map((tool) => ({
          name: typeof tool?.name === 'string' && tool.name.startsWith(prefix) ? tool.name.slice(prefix.length) : String(tool?.name ?? ''),
          description: typeof tool?.description === 'string' ? tool.description : '',
        }))
        return tools.length === 0
          ? { ok: false, error: { code: 'plugin-managed', message: messageOf(name) } }
          : { ok: true, value: { ok: true, tools } }
      })
    }

    /** Requested state from either call shape: `(name, enabled)` or `({ serverName, enabled })`. */
    function enabledOf(args) {
      const first = Array.isArray(args) ? args[0] : undefined
      if (first !== null && typeof first === 'object' && typeof first.enabled === 'boolean') return first.enabled
      return args[1] === true
    }

    /** Flip one plugin-owned server; the Host persists it and denies its tools. */
    function toggleOf(name, wanted) {
      const url = ENDPOINT + '?toggle=' + encodeURIComponent(name) + '&enabled=' + (wanted ? 'true' : 'false')
      return fetchJson(url)
        .then((payload) => {
          const fresh = remember(payload)
          const server = fresh !== null && Array.isArray(fresh.servers)
            ? fresh.servers.find((row) => row !== null && row.name === name)
            : undefined
          if (server === undefined) {
            return { ok: false, error: { code: 'toggle-failed', message: 'server not found after the switch: ' + name } }
          }
          return { ok: true, value: viewOf(server) }
        })
        .catch((error) => ({
          ok: false,
          error: { code: 'toggle-failed', message: String(error?.message ?? error) },
        }))
    }

    /** Rewrite the answer of one call; everything else passes through. */
    function decorate(method, args, pending) {
      const name = serverNameOf(args)
      if (typeof method !== 'string' || name === undefined || !foreign.has(name)) return pending
      if (method === 'setEnabled') return toggleOf(name, enabledOf(args))
      if (GUARDED.has(method)) {
        return Promise.resolve({ ok: false, error: { code: 'plugin-managed', message: messageOf(name) } })
      }
      if (method === 'readRaw') {
        return Promise.resolve({ ok: true, value: { text: rawTextOf(name) } })
      }
      if (method === 'test') return testOf(name)
      return pending
    }

    /** The patched `invoke` body: rewrite list/reload results and guards only. */
    function afterInvoke(descriptor, values, pending) {
      let method
      try { method = descriptor?.method } catch { return pending }
      if (typeof method !== 'string') return pending
      if (LIST_METHODS.has(method)) {
        return pending.then((envelope) => isMcpList(envelope) ? augmentList(envelope) : envelope)
      }
      if (method === 'listTools') {
        const name = values?.[0]?.serverName
        if (typeof name === 'string' && bridges.has(name)) return bridgeToolsOf(name)
      }
      return decorate(method, values, pending)
    }

    /** `invoke(descriptor, projection, token, callerCtx, values, boundIdentity)` */
    function invokeHook(args, pending) {
      return afterInvoke(args[0], args[4], pending)
    }

    /** `invokeRemote(direct, scoped, callerCtx, values)` */
    function namespaceHook(args, pending) {
      const descriptor = (args[0] ?? args[1])?.descriptor
      return afterInvoke(descriptor, args[3], pending)
    }

    /** Replace `target[key]` with a wrapper that post-processes the returned promise. */
    function tryPatch(target, key, hook) {
      if (PATCHED_TARGETS.has(target)) return true
      let current
      try { current = target[key] } catch { return false }
      if (typeof current === 'function' && current[PATCH_MARK] === true) {
        PATCHED_TARGETS.add(target)
        return true
      }
      let descriptor
      try { descriptor = Object.getOwnPropertyDescriptor(target, key) } catch { return false }
      if (descriptor === undefined || typeof descriptor.value !== 'function' || descriptor.writable !== true) return false
      const original = descriptor.value
      let wrapper
      try {
        wrapper = function patched() {
          return hook(arguments, original.apply(this, arguments))
        }
        wrapper[PATCH_MARK] = true
        target[key] = wrapper
      } catch {
        return false
      }
      let ok = false
      try { ok = target[key] === wrapper } catch { ok = false }
      if (!ok) return false
      PATCHED_TARGETS.add(target)
      return true
    }

    /**
     * Patch the Remote service once. The class method `invoke` is the funnel of
     * every generated namespace method, so a namespace rename, a panel update
     * or a re-mount does not drop the decoration.
     */
    function install(ctx) {
      let remote
      try {
        remote = typeof ctx.get === 'function' ? ctx.get('remote') : undefined
      } catch {
        return false
      }
      if (remote === undefined || remote === null) return false
      if (PATCHED_TARGETS.has(remote)) return true

      let done = false
      // The service instance, when its own `invoke` is writable.
      done = tryPatch(remote, 'invoke', invokeHook) || done

      // Every prototype in the chain that owns `invoke` (the class method).
      let proto = remote
      for (let depth = 0; depth < 6 && proto !== null && proto !== undefined; depth += 1) {
        try { proto = Object.getPrototypeOf(proto) } catch { break }
        if (proto === null || proto === undefined) break
        let own
        try { own = Object.getOwnPropertyDescriptor(proto, 'invoke') } catch { own = undefined }
        if (own !== undefined && typeof own.value === 'function') {
          done = tryPatch(proto, 'invoke', invokeHook) || done
        }
      }

      // Each mounted MCP namespace's own `invokeRemote` hook, as a fallback.
      try {
        const map = remote.namespaces
        if (map !== undefined && map !== null && typeof map.forEach === 'function') {
          map.forEach((handle) => {
            const service = handle?.service
            if (service === undefined || service === null || PATCHED_TARGETS.has(service)) return
            if (typeof service.invokeRemote !== 'function') return
            const methods = service.methods
            if (methods === undefined || typeof methods.has !== 'function') return
            if (!methods.has('list') && !methods.has('reload')) return
            if (!methods.has('test') || !methods.has('setEnabled')) return
            try {
              const original = service.invokeRemote.bind(service)
              service.invokeRemote = function patchedInvokeRemote(direct, scoped, callerCtx, args) {
                return namespaceHook(arguments, original(direct, scoped, callerCtx, args))
              }
              PATCHED_TARGETS.add(service)
              done = true
            } catch {
              // Not writable in this build; the prototype patch already covers it.
            }
          })
        }
      } catch {
        // Namespace map is private in this build.
      }

      return done
    }

    /* ------------------------------------------------------------------ */
    /* 2. Conversation MCP chip                                            */
    /* ------------------------------------------------------------------ */

    const CHIP_CSS = [
      '.dsh-mcp-chip-host{display:inline-flex;align-items:center;min-width:0}',
      '.dsh-mcp-chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;',
      'border-radius:9px;border:1px solid transparent;background:transparent;',
      'color:var(--dsw-alias-label-primary);',
      'font:inherit;font-size:13px;font-weight:600;line-height:1;cursor:pointer;white-space:nowrap;',
      'transition:background .12s ease,border-color .12s ease}',
      '.dsh-mcp-chip:hover,.dsh-mcp-chip[aria-expanded="true"]{background:var(--dsw-alias-bg-layer-2, #2c2c2e)}',
      '.dsh-mcp-chip .dsh-mcp-chev{transition:transform .15s ease}',
      '.dsh-mcp-chip[aria-expanded="true"] .dsh-mcp-chev{transform:rotate(180deg)}',
      '.dsh-mcp-menu{position:fixed;z-index:2147483000;box-sizing:border-box;width:320px;max-height:60vh;',
      'display:flex;flex-direction:column;padding:6px;border-radius:12px;',
      'border:1px solid var(--dsw-alias-border-l2, #3a3a3e);background:var(--dsw-alias-bg-layer-2, #2c2c2e);',
      'box-shadow:0 16px 40px rgba(0,0,0,.45);color:var(--dsw-alias-label-primary);font-size:13px}',
      '.dsh-mcp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;',
      'padding:6px 8px 8px;font-size:11px;font-weight:600;letter-spacing:.04em;',
      'text-transform:uppercase;color:var(--dsw-alias-label-secondary)}',
      '.dsh-mcp-head-total{font-weight:600;letter-spacing:0;text-transform:none;',
      'font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}',
      '.dsh-mcp-head-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-mcp-tokens{font-size:11px;color:var(--dsw-alias-label-secondary);',
      'font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}',
      '.dsh-mcp-list{overflow:auto;min-height:0;display:flex;flex-direction:column;gap:2px}',
      '.dsh-mcp-row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;',
      'cursor:pointer;user-select:none;outline:none}',
      '.dsh-mcp-row:hover,.dsh-mcp-row:focus-visible{background:rgba(255,255,255,.06)}',
      '.dsh-mcp-row[data-locked="true"]{cursor:default;opacity:.55}',
      '.dsh-mcp-row[data-locked="true"]:hover{background:transparent}',
      '.dsh-mcp-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}',
      '.dsh-mcp-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-mcp-sub{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;',
      'text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-mcp-switch{position:relative;width:30px;height:17px;border-radius:99px;flex:none;box-sizing:border-box;',
      'background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.10);',
      'transition:background .15s ease,border-color .15s ease}',
      '.dsh-mcp-switch::after{content:"";position:absolute;top:2px;left:2px;width:11px;height:11px;',
      'border-radius:50%;background:var(--dsw-alias-label-secondary, #9aa0a6);',
      'transition:transform .15s ease,background .15s ease}',
      '.dsh-mcp-switch[data-on="true"]{background:var(--dsw-alias-label-primary, #f2f2f2);border-color:transparent}',
      '.dsh-mcp-switch[data-on="true"]::after{transform:translateX(13px);',
      'background:var(--dsw-alias-bg-base, #151517)}',
      '.dsh-mcp-switch[data-busy="true"]{opacity:.55}',
      '.dsh-mcp-busy{animation:dsh-mcp-pulse 1s ease-in-out infinite}',
      '@keyframes dsh-mcp-pulse{0%,100%{opacity:.45}50%{opacity:1}}',
      '.dsh-mcp-note{padding:10px 8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.45}',
      '.dsh-mcp-foot{padding:8px 8px 2px;font-size:11px;line-height:1.45;color:var(--dsw-alias-label-secondary);',
      'border-top:1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08));margin-top:4px}',
    ].join('')

    const PLUG_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v4"/></svg>'
    const CHEVRON = '<svg class="dsh-mcp-chev" width="12" height="12" viewBox="0 0 24 24" fill="none"'
      + ' stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"'
      + ' aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'

    function ensureStyles() {
      try {
        const existing = document.getElementById('dsh-mcp-companion-styles')
        if (existing !== null) {
          // A reloaded bundle keeps the previous sheet in the head; refresh its
          // content so new rules apply without a page reload.
          if (existing.textContent !== CHIP_CSS) existing.textContent = CHIP_CSS
          return
        }
        const style = document.createElement('style')
        style.id = 'dsh-mcp-companion-styles'
        style.textContent = CHIP_CSS
        document.head.appendChild(style)
      } catch {
        // A page without a head still gets the chip, just unstyled.
      }
    }

    const labelOf = (server) => String(server?.name ?? '')

    /** Compact token count: 812, 3.4k, 12k. */
    function formatTokens(value) {
      const number = typeof value === 'number' && Number.isFinite(value) ? value : 0
      if (number <= 0) return ''
      if (number >= 10000) return Math.round(number / 1000) + 'k tok'
      if (number >= 1000) {
        const short = (Math.round(number / 100) / 10).toFixed(1)
        return (short.endsWith('.0') ? short.slice(0, -2) : short) + 'k tok'
      }
      return String(number) + ' tok'
    }

    /**
     * The weight to print for one server.
     *
     * A server whose tools are mostly switched off costs a fraction of its full
     * schema weight, so the active figure wins whenever the two differ, and the
     * untouched total moves to the tooltip.
     */
    function weightOf(server) {
      const total = typeof server?.tokens === 'number' ? server.tokens : 0
      const active = typeof server?.activeTokens === 'number' ? server.activeTokens : null
      if (active === null || active === total) {
        return { value: total, title: 'Weight of the schemas of this server in the context' }
      }
      return {
        value: active,
        title: 'Weight of the schemas this server actually sends now: ' + formatTokens(active)
          + ' of ' + formatTokens(total) + ' when every tool is on',
      }
    }

    function subtitleOf(server) {
      const parts = []
      const count = typeof server?.toolCount === 'number' ? server.toolCount : 0
      // The live count sits right beside the total, because a card reading
      // "69 tools" while 68 are switched off misleads about what the model
      // actually receives.
      const active = typeof server?.activeToolCount === 'number' ? server.activeToolCount : null
      const live = active !== null && active !== count ? ' (' + String(active) + ' active)' : ''
      parts.push(count + (count === 1 ? ' tool' : ' tools') + live)
      if (server?.source === 'bridge') parts.push('MCP resources')
      else if (typeof server?.provider === 'string' && server.provider.length > 0) parts.push(server.provider)
      // The disabled wording is added by the caller, once, with the reason.
      if (server?.disabled === true) { /* handled by the caller */ }
      else if (server?.override === 'on') parts.push('enabled here')
      else if (server?.override === 'off') parts.push('disabled here')
      else if (server?.globalEnabled === false) parts.push('disabled everywhere')
      return parts.join(' \u00b7 ')
    }

    /**
     * Build the chip button inside `node` and return its disposer. The button
     * lives in the slot's flow; the menu is appended to <body> so no ancestor
     * can clip it, and is positioned from the button's rect.
     */
    function mountChip(node, sessionId) {
      if (node === null || node === undefined || typeof node.appendChild !== 'function') return undefined
      ensureStyles()
      // Read by the preset-menu badge below: it needs the Session whose cost
      // the token estimator already prices.
      try {
        if (typeof sessionId === 'string' && sessionId.length > 0) node.setAttribute('data-mcpc-session', sessionId)
        else node.removeAttribute('data-mcpc-session')
      } catch { /* a node that refuses attributes must not block the chip */ }

      // Which servers have a write in flight. Kept outside the DOM because the
      // list is rebuilt on every poll: a row-local flag vanished on the next
      // render, which is why the indicator never showed up.
      const busyServers = new Set()
      /** Servers whose start-up we are waiting for: key -> deadline (ms). */
      const booting = new Map()
      /**
       * Servers switched on before they had published any tool name. The write
       * needs names, so it could not happen yet; it runs as soon as the poll
       * reveals them. Without this the row went on, then fell back to off once
       * the spinner cleared — the switch never stuck.
       */
      const pendingOn = new Set()
      /** When each key started writing, so the indicator can hold a minimum. */
      const busySince = new Map()
      const MIN_BUSY_MS = 600

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'dsh-mcp-chip'
      button.title = 'MCP for this conversation'
      button.setAttribute('aria-haspopup', 'dialog')
      button.setAttribute('aria-expanded', 'false')
      button.innerHTML = PLUG_ICON + '<span>MCP</span>' + CHEVRON
      node.appendChild(button)

      // The row's option group is right-aligned, so a chip registered there
      // lands at the far right. `position: relative` plus a negative `left`
      // moves only the painted box: no layout change, so no feedback loop and
      // nothing else in the row moves. The anchor is the element that precedes
      // this chip's group (the workspace and preset controls), found by walking
      // up until a preceding sibling exists - never by matching its text, so a
      // locale or label change cannot break it.
      let shift = 0

      /**
       * The control the chip should follow: the last compact element before
       * this chip's group in the row. Wide layout spacers are skipped, so a
       * `justify-content: space-between` row and a row of plain siblings both
       * resolve to the workspace/preset cluster.
       */
      /**
       * The first painted box at or inside `el`. Slot renderers may wrap an
       * occupant in a `display: contents` element, whose own rect is empty:
       * looking only at the wrapper's rect makes the real control invisible to
       * the anchor search.
       */
      function boxOf(el, depth) {
        let rect
        try { rect = el.getBoundingClientRect() } catch { return null }
        if (rect !== null && rect !== undefined && (rect.width > 0 || rect.height > 0)) return rect
        if (depth <= 0) return null
        let children
        try { children = el.children } catch { return null }
        if (children === null || children === undefined || typeof children.length !== 'number') return null
        for (const child of children) {
          const inner = boxOf(child, depth - 1)
          if (inner !== null) return inner
        }
        return null
      }

      function anchorOf() {
        const own = button.getBoundingClientRect()
        // Use the flow position, not the painted one: the applied offset must
        // never make the real anchor look too far away, or the search falls
        // back to an earlier control and the two steal the chip from each other.
        const flowLeft = own.left - shift
        const centre = (own.top + own.bottom) / 2
        let cursor = node
        for (let depth = 0; depth < 4 && cursor !== null && cursor !== undefined; depth += 1) {
          const parent = cursor.parentElement
          if (parent === null) break
          let sibling = cursor.previousElementSibling
          while (sibling !== null) {
            const rect = boxOf(sibling, 3)
            if (rect !== null) {
              const sameLine = Math.abs(((rect.top + rect.bottom) / 2) - centre) <= 40
              const controlLike = rect.width > 12 && rect.width < 760 && rect.height >= 18 && rect.height <= 72
              // A real gap means this is the row's free space, not a tight
              // neighbour: only such a control is worth following.
              if (sameLine && controlLike && (flowLeft - rect.right) >= 60) return rect
            }
            sibling = sibling.previousElementSibling
          }
          cursor = parent
        }
        return null
      }

      function align() {
        try {
          const anchor = anchorOf()
          const own = button.getBoundingClientRect()
          if (own.width === 0) return
          if (anchor === null) {
            if (shift !== 0) {
              shift = 0
              node.style.left = ''
            }
            return
          }
          const a = anchor
          if (a.width < 12) return
          // The flow position is the measured left minus whatever offset this
          // function already applied, so repeated calls converge on the same
          // target instead of accumulating.
          const base = own.left - shift
          const target = a.right + 2
          let next = target - base
          if (Math.abs(next) < 2) next = 0
          // Never push the chip rightwards over a neighbour, never off the row.
          if (next > 6 || base + next < 4) return
          if (Math.abs(next - shift) < 0.5) return
          shift = next
          node.style.position = 'relative'
          node.style.zIndex = '2'
          node.style.left = shift + 'px'
          // Diagnostics only: proves which control the chip was seated after.
          report('align', Math.round(shift) + '|' + Math.round(a.width) + '|' + Math.round(a.right))
        } catch {
          // Layout unavailable: leave the chip where the slot put it.
        }
      }

      align()
      // The mode preset mounts its own control asynchronously, so the row is
      // still incomplete on the first frame. A throttled animation loop keeps
      // re-measuring while the hero is on screen: it snaps into place as soon
      // as the preset exists, with no timers to tune and no observers on
      // another plugin's subtree.
      let frame = 0
      let ticks = 0
      let stopped = false
      const step = () => {
        if (stopped) return
        frame = requestAnimationFrame(step)
        ticks += 1
        if (ticks % 5 !== 0) return
        try { align() } catch { /* align already guards itself */ }
      }
      if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(step)
      window.addEventListener('resize', align)

      let menu = null
      let timer = null
      let payload = null

      const hasSession = typeof sessionId === 'string' && sessionId.length > 0

      function urlFor(extra) {
        const params = []
        if (hasSession) params.push('session=' + encodeURIComponent(sessionId))
        params.push('client=' + CLIENT_VERSION)
        if (typeof extra === 'string' && extra.length > 0) params.push(extra)
        return ENDPOINT + '?' + params.join('&')
      }

      function place() {
        if (menu === null) return
        const rect = button.getBoundingClientRect()
        const width = 320
        const height = menu.offsetHeight || 260
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
        let top = rect.bottom + 8
        if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8)
        menu.style.left = left + 'px'
        menu.style.top = top + 'px'
      }

      function note(text) {
        const element = document.createElement('div')
        element.className = 'dsh-mcp-note'
        element.textContent = text
        return element
      }

      /**
       * Collapse servers whose names differ only in case or punctuation.
       *
       * Two rows for one server is what a panel-added declaration beside a
       * pre-existing one looks like: `Gitlab` and `gitlab`. They are the same
       * server to the reader, so they get one row and one switch.
       */
      function groupServers(list) {
        const byKey = new Map()
        for (const server of list) {
          const name = labelOf(server)
          const key = String(name).toLowerCase().replace(/[^a-z0-9]/g, '')
          const group = byKey.get(key)
          if (group === undefined) byKey.set(key, { key, members: [server] })
          else group.members.push(server)
        }
        const groups = []
        for (const group of byKey.values()) {
          // The healthiest declaration names the row: a disabled duplicate must
          // not hide a working one.
          const score = (server) => (server?.disabled === true ? 0 : 4)
            + (server?.active === true ? 2 : 0)
            + (server?.enabled === false ? 0 : 1)
          const primary = group.members.slice().sort((a, b) => score(b) - score(a))[0]
          groups.push({
            key: group.key,
            primary,
            members: group.members,
            names: group.members.map((server) => labelOf(server)),
          })
        }
        groups.sort((a, b) => String(labelOf(a.primary)).localeCompare(String(labelOf(b.primary))))
        return groups
      }

      /**
       * Confine freshly loaded servers to this conversation.
       *
       * A server that has just been loaded needs a moment before its tools
       * exist; the attempt is retried a few times rather than declaring a
       * failure that is only a slow start.
       */
      function confineToSession(names, attempt) {
        if (!hasSession) { flipAll(names, true); return }
        const scopeOne = (index) => {
          if (index >= names.length) {
            render()
            return
          }
          fetchJson(urlFor('scopeServer=' + encodeURIComponent(names[index])))
            .then((result) => {
              if (result?.ok === true) { scopeOne(index + 1); return }
              if (result?.retry === true && attempt < 8) {
                window.setTimeout(() => { confineToSession(names, attempt + 1) }, 500)
                return
              }
              render()
            })
            .catch(() => { render() })
        }
        scopeOne(0)
      }

      /**
       * Deny a freshly loaded server everywhere, then allow it here.
       *
       * The tools only exist once the plugin is loaded, so the confinement is
       * what turns a profile-wide load into a conversation-scoped activation.
       * Retried while the server finishes registering its tools.
       */
      function confineToSession(names, attempt) {
        if (!hasSession) { render(); return }
        const tries = typeof attempt === 'number' ? attempt : 0
        const scopeOne = (index) => {
          if (index >= names.length) { render(); void load(); return }
          fetchJson(urlFor('scopeServer=' + encodeURIComponent(names[index])))
            .then((result) => {
              if (result?.ok === true) { scopeOne(index + 1); return }
              if (result?.retry === true && tries < 10) {
                window.setTimeout(() => { confineToSession(names, tries + 1) }, 600)
                return
              }
              report('chip-scope', String(result?.error ?? 'failed'))
              render()
              void load()
            })
            .catch((error) => { report('chip-scope', String(error?.message ?? error)); render() })
        }
        scopeOne(0)
      }

      /**
       * Turn every declaration of one server on or off for this conversation.
       *
       * Written per tool name: that is the unit the deny list and
       * `tools.restrict` work with, so a server name would change nothing.
       */
      function flipAll(names, wanted, attempt, onDone) {
        const tries = typeof attempt === 'number' ? attempt : 0
        // On the New Session screen there is no conversation yet, so a
        // per-conversation override has nowhere to live. The profile switch is
        // the only meaningful target there, and the next conversation inherits
        // it.
        const steps = names.map((name) => fetchJson(urlFor(
          (hasSession ? 'toggleServer=' : 'toggle=') + encodeURIComponent(name)
            + '&enabled=' + (wanted ? 'true' : 'false'),
        )))
        Promise.all(steps)
          .then((results) => {
            const failed = results.find((next) => next !== null && typeof next === 'object' && next.ok !== true)
            if (failed !== undefined) {
              // A server that has not registered its tools yet cannot be
              // switched: the write is retried while it starts up, instead of
              // failing where the reader cannot see it.
              if (failed.retry === true && tries < 40) {
                // A server that is merely *stopped* (not disabled) publishes
                // nothing either, and retrying alone never fixes that: ask the
                // host to load it once, then keep retrying while it comes up.
                if (tries === 0) {
                  for (const name of names) {
                    void fetchJson(urlFor('enableServer=' + encodeURIComponent(name))).catch(() => {})
                  }
                }
                window.setTimeout(() => { flipAll(names, wanted, tries + 1, onDone) }, 700)
                return
              }
              report('chip-toggle', String(failed.error ?? 'failed'))
              if (typeof onDone === 'function') onDone(false)
              void load()
              return
            }
            if (typeof onDone === 'function') onDone(true)
            render()
            void load()
          })
          .catch((error) => {
            report('chip-toggle', String(error?.message ?? error))
            if (typeof onDone === 'function') onDone(false)
            render()
          })
      }

      function rowElement(group) {
        const server = group.primary
        const row = document.createElement('div')
        row.className = 'dsh-mcp-row'
        row.setAttribute('role', 'menuitemcheckbox')
        // The switch reports what this conversation can actually use, not
        // whether the plugin is loaded: a server loaded once and confined to
        // another conversation has zero live tools here, and must read as off.
        // A server that reports no tool at all has simply not connected yet, so
        // its profile state speaks; only a loaded server with everything denied
        // here counts as off.
        const liveTools = (member) => {
          const active = member?.activeToolCount
          const total = member?.toolCount
          if (typeof active === 'number' && typeof total === 'number' && total > 0) return active
          return member?.enabled === false ? 0 : 1
        }
        const on = group.members.some((member) => liveTools(member) > 0)
        // Declared before its first use: reading it earlier in this function
        // threw a temporal-dead-zone error and emptied the whole list.
        const profileOff = group.members.some((member) => member?.disabled === true)
        row.setAttribute('aria-checked', String(on))

        const text = document.createElement('div')
        text.className = 'dsh-mcp-text'
        const name = document.createElement('div')
        name.className = 'dsh-mcp-name'
        name.textContent = labelOf(server)
        const sub = document.createElement('div')
        sub.className = 'dsh-mcp-sub'
        sub.textContent = subtitleOf(server)
        if (profileOff) {
          // Switching it on loads the plugin in the profile first: without that
          // there is no schema for the conversation to enable.
          row.title = 'Switching this on loads the MCP server in the profile once, '
            + 'then keeps it on for this conversation. It was never loaded, so it '
            + 'had no tools to switch.'
        }
        text.appendChild(name)
        text.appendChild(sub)

        const weight = weightOf(server)
        const tokens = formatTokens(weight.value)
        const badge = document.createElement('div')
        badge.className = 'dsh-mcp-tokens'
        badge.textContent = tokens
        badge.title = weight.title

        // One switch everywhere: a server DSH has not loaded simply cannot be
        // reached by a conversation override, so switching it on first loads it
        // in the profile. Same gesture, honest outcome.
        const toggle = document.createElement('div')
        toggle.className = 'dsh-mcp-switch'
        toggle.dataset.on = String(on && profileOff !== true)

        row.appendChild(text)
        if (tokens !== '') row.appendChild(badge)

        // Sits immediately left of the switch, so a slow toggle explains
        // itself instead of looking dead.
        const status = document.createElement('span')
        status.className = 'dsh-mcp-busy'
        Object.assign(status.style, {
          fontSize: '11px',
          color: '#9a9aa2',
          marginRight: '8px',
          whiteSpace: 'nowrap',
          display: 'none',
        })
        status.textContent = 'Loading\u2026'
        row.appendChild(status)
        row.appendChild(toggle)

        const busyKey = group.names.slice().sort().join('|')
        const paintBusy = (wanted) => {
          status.style.display = wanted ? 'inline' : 'none'
          if (wanted) toggle.dataset.busy = 'true'
          else delete toggle.dataset.busy
        }
        // A write that settles in 30 ms flashed the indicator for one frame, so
        // it read as "nothing happens". Keep it up for a beat.
        const setBusy = (state) => {
          if (state === true) {
            busyServers.add(busyKey)
            busySince.set(busyKey, Date.now())
            paintBusy(true)
            return
          }
          const started = busySince.get(busyKey) ?? 0
          const left = Math.max(0, MIN_BUSY_MS - (Date.now() - started))
          const finish = () => {
            busyServers.delete(busyKey)
            busySince.delete(busyKey)
            paintBusy(false)
          }
          if (left === 0) finish()
          else window.setTimeout(finish, left)
        }
        // A row rebuilt while its write is running, or while the server it just
        // switched on is still loading, must come back busy.
        if (busyServers.has(busyKey) || booting.has(busyKey)) paintBusy(true)

        // The switch only ever writes this conversation's override. It never
        // loads, enables or edits the profile: a server DSH has not loaded has
        // nothing to offer here, and pretending otherwise changed global state.
        const apply = () => {
          // Nothing to switch yet: no tool name is known for this server, so the
          // per-tool override cannot be written. Load it, then finish the job
          // when the next poll brings the names.
          if (!on && group.names.length === 0) {
            setBusy(true)
            markBooting(busyKey)
            pendingOn.add(busyKey)
            Promise.all(group.members
              .filter((member) => member?.disabled === true)
              .map((member) => fetchJson(urlFor('enableServer=' + encodeURIComponent(labelOf(member))))))
              .then(() => { setBusy(false); render(); void load() })
              .catch(() => { pendingOn.delete(busyKey); setBusy(false); render() })
            return
          }
          if (profileOff && !on) {
            setBusy(true)
            // DSH never loaded this server, so it has no tools to switch. It is
            // loaded once and immediately confined to this conversation, which
            // is the only reachable meaning of "on here only".
            toggle.dataset.busy = 'true'
            Promise.all(group.members
              .filter((member) => member?.disabled === true)
              .map((member) => fetchJson(urlFor('enableServer=' + encodeURIComponent(labelOf(member))))))
              .then(() => { markBooting(busyKey); setBusy(false); render() })
              .catch(() => { setBusy(false); render() })
            return
          }
          setBusy(true)
          // The indicator stays until the write settles; a retry keeps it up.
          flipAll(group.names, !on, 0, (ok) => {
            // Switching on means waiting for the server itself, not just the write.
            if (ok === true && !on) markBooting(busyKey)
            if (ok !== undefined) setBusy(false)
          })
        }
        row.tabIndex = 0
        row.addEventListener('click', apply)
        row.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            apply()
          }
        })
        return row
      }

      /**
       * A server that was just switched on spends seconds loading before it
       * publishes anything. The write settles long before that, so the spinner
       * used to vanish while the server was still coming up.
       */
      function markBooting(key) {
        booting.set(key, Date.now() + 45000)
      }

      function serverReady(group) {
        // Only a running server (or a failed one) ends the wait. `enabled:false`
        // is the *stale* pre-write state the next poll still carries, and
        // treating it as ready ended the spinner ~1s after the click.
        return group.members.some((member) => member?.active === true || member?.phase === 'failed')
      }

      function sweepBooting(group) {
        const key = group.names.slice().sort().join('|')
        const deadline = booting.get(key)
        if (deadline === undefined) return
        if (serverReady(group) || Date.now() > deadline) booting.delete(key)
      }

      function render() {
        if (menu === null) return
        const servers = Array.isArray(payload?.servers) ? payload.servers : []
        const rows = servers.filter((server) => server !== null && typeof server === 'object'
          && (server.toggleable === true || server.active === true)
          // `mcp-resource-servers` is the Host's resource bridge, not a server the
          // user picked: it is always on, has nothing to toggle, and only adds a
          // line nobody acts on.
          && server.name !== RESOURCE_BRIDGE_NAME)

        const head = document.createElement('div')
        head.className = 'dsh-mcp-head'
        const headLabel = document.createElement('span')
        headLabel.className = 'dsh-mcp-head-label'
        headLabel.textContent = 'MCP for this conversation'
        head.appendChild(headLabel)
        const activeTokens = rows.reduce((total, server) => total
          + (server?.enabled === false ? 0 : weightOf(server).value), 0)
        if (activeTokens > 0) {
          const headTotal = document.createElement('span')
          headTotal.className = 'dsh-mcp-head-total'
          headTotal.textContent = formatTokens(activeTokens)
          headTotal.title = 'Total weight of the MCP tools active in this conversation'
          head.appendChild(headTotal)
        }

        const list = document.createElement('div')
        list.className = 'dsh-mcp-list'
        if (payload === null) list.appendChild(note('Loading\u2026'))
        else if (rows.length === 0) list.appendChild(note('No active MCP server.'))
        else {
          // One malformed row must never blank the whole picker: the failure of
          // a single entry is contained and named instead.
          for (const group of groupServers(rows)) {
            sweepBooting(group)
            {
              const key = group.names.slice().sort().join('|')
              if (pendingOn.has(key) && group.names.length > 0) {
                pendingOn.delete(key)
                flipAll(group.names, true, 0, () => { render(); void load() })
              }
            }
            try {
              list.appendChild(rowElement(group))
            } catch (error) {
              const broken = document.createElement('div')
              broken.className = 'dsh-mcp-note'
              broken.textContent = String(labelOf(group?.primary)) + ': ' + String(error?.message ?? error)
              list.appendChild(broken)
            }
          }
        }

        const foot = document.createElement('div')
        foot.className = 'dsh-mcp-foot'
        foot.textContent = hasSession
          ? 'This setting only applies to this conversation.'
          : 'No conversation yet: these switches change the profile default.'

        while (menu.firstChild !== null) menu.removeChild(menu.firstChild)
        menu.appendChild(head)
        menu.appendChild(list)
        menu.appendChild(foot)
        place()
      }

      function load() {
        return fetchJson(urlFor())
          .then((next) => {
            if (next !== null && typeof next === 'object' && next.ok === true) payload = next
            render()
          })
          .catch((error) => {
            payload = { ok: false, servers: [] }
            render()
            report('chip-load-error', String(error?.message ?? error))
          })
      }

      function flip(name, wanted) {
        if (!hasSession) return
        const extra = 'toggle=' + encodeURIComponent(name) + '&enabled=' + (wanted ? 'true' : 'false')
        fetchJson(urlFor(extra))
          .then((next) => {
            if (next !== null && typeof next === 'object' && next.ok === true) {
              payload = next
              render()
              report('chip-toggle', name + '=' + String(wanted))
            } else {
              report('chip-toggle-error', String(next?.error ?? 'inconnu'))
            }
          })
          .catch((error) => { report('chip-toggle-error', String(error?.message ?? error)) })
      }

      function onOutside(event) {
        if (menu === null) return
        if (menu.contains(event.target) || button.contains(event.target)) return
        close()
      }

      function onKey(event) {
        if (event.key === 'Escape') close()
      }

      function close() {
        if (timer !== null) {
          clearInterval(timer)
          timer = null
        }
        document.removeEventListener('mousedown', onOutside, true)
        document.removeEventListener('keydown', onKey, true)
        window.removeEventListener('resize', place)
        if (menu !== null) {
          menu.remove()
          menu = null
        }
        button.setAttribute('aria-expanded', 'false')
      }

      function open() {
        if (menu !== null) return
        align()
        menu = document.createElement('div')
        menu.className = 'dsh-mcp-menu'
        menu.setAttribute('role', 'dialog')
        menu.setAttribute('aria-label', 'MCP for this conversation')
        document.body.appendChild(menu)
        button.setAttribute('aria-expanded', 'true')
        render()
        load()
        timer = setInterval(load, 4000)
        document.addEventListener('mousedown', onOutside, true)
        document.addEventListener('keydown', onKey, true)
        window.addEventListener('resize', place)
      }

      button.addEventListener('click', () => { if (menu === null) open(); else close() })

      return function disposeChip() {
        close()
        stopped = true
        try { if (frame !== 0) cancelAnimationFrame(frame) } catch { /* already gone */ }
        window.removeEventListener('resize', align)
        try { button.remove() } catch { if (button.parentNode !== null) button.parentNode.removeChild(button) }
      }
    }

    /** The slot component: a React shell whose children are the plain-DOM chip. */
    function ConversationMcpChip(props) {
      const sessionId = props !== null && typeof props === 'object' && typeof props.sessionId === 'string'
        ? props.sessionId
        : undefined
      const holder = React.useRef(null)
      React.useEffect(() => {
        const node = holder.current
        if (node === null || node === undefined) return undefined
        const dispose = mountChip(node, sessionId)
        report('chip-mount', sessionId ?? 'no-session')
        return () => { if (typeof dispose === 'function') dispose() }
      }, [sessionId])
      return React.createElement('span', { className: 'dsh-mcp-chip-host', ref: holder })
    }

    /* ------------------------------------------------------------------ */
    /* 2a. Draft images survive leaving and returning to a Session           */
    /* ------------------------------------------------------------------ */
    /*
     * The composer persists its text draft per Session, but not its images.
     * Restoring the `DraftAttachmentId` cannot work: leaving a Session disposes
     * its input shell, and `hub.ts` then calls `releaseDraftAttachment(id)`,
     * which deletes the browser object and revokes its preview URL. The id
     * survives; the picture does not.
     *
     * So the bytes are mirrored instead. `ConversationController.createDrafts`
     * is the one intake that mints attachments, so wrapping it captures every
     * image exactly once, and the same call rebuilds them on return.
     */

    /** IndexedDB database holding the mirrored image bytes. */
    const DRAFT_STORE_DB = 'dsh-mcp-companion'
    const DRAFT_STORE_TABLE = 'draft-images'
    /**
     * Sessions whose draft was sent or emptied on purpose.
     *
     * IndexedDB is asynchronous, so a remount right after a send can read the
     * mirror before its deletion lands and put the picture back into a draft
     * that was just emptied. This tombstone is synchronous with the decision.
     */
    const DRAFT_CONSUMED = new Set()
    /** Images beyond this are not mirrored; a draft that large is unusual. */
    const DRAFT_KEEP_LIMIT = 8
    /** Refuse to mirror a single image above this many bytes. */
    const DRAFT_KEEP_MAX_BYTES = 24 * 1024 * 1024

    function draftStoreOpen() {
      if (typeof indexedDB === 'undefined') return Promise.resolve(undefined)
      return new Promise((resolve) => {
        let request
        try {
          request = indexedDB.open(DRAFT_STORE_DB, 1)
        } catch {
          resolve(undefined)
          return
        }
        request.onupgradeneeded = () => {
          try {
            if (!request.result.objectStoreNames.contains(DRAFT_STORE_TABLE)) {
              request.result.createObjectStore(DRAFT_STORE_TABLE)
            }
          } catch { /* an existing schema wins */ }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(undefined)
      })
    }

    function draftStoreRun(mode, work) {
      return draftStoreOpen().then((db) => {
        if (db === undefined) return undefined
        return new Promise((resolve) => {
          let tx
          try {
            tx = db.transaction(DRAFT_STORE_TABLE, mode)
          } catch {
            resolve(undefined)
            return
          }
          let result
          try {
            result = work(tx.objectStore(DRAFT_STORE_TABLE))
          } catch {
            resolve(undefined)
            return
          }
          tx.oncomplete = () => resolve(result)
          tx.onerror = () => resolve(undefined)
          tx.onabort = () => resolve(undefined)
        })
      })
    }

    /** Content identity of one mirrored image: same picture, same key. */
    function contentKeyOf(name, type, bytes) {
      const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(0)
      let hash = 2166136261
      const step = Math.max(1, Math.floor(view.length / 2048))
      for (let index = 0; index < view.length; index += step) {
        hash ^= view[index]
        hash = Math.imul(hash, 16777619)
      }
      return String(name) + '|' + String(type) + '|' + String(view.length) + '|' + (hash >>> 0).toString(36)
    }

    /**
     * Mirrored images of one Session.
     *
     * Rows are keyed by content, never by attachment id: leaving and returning
     * mints a fresh id for the same picture, and keying by id made every round
     * trip add another copy.
     * @param sessionId - owning Session.
     * @returns one entry per distinct picture, oldest first.
     */
    function draftStoreRead(sessionId) {
      return draftStoreRun('readonly', (store) => {
        const request = store.get(String(sessionId))
        const box = { value: undefined }
        request.onsuccess = () => { box.value = request.result }
        return box
      }).then((box) => {
        const value = box !== null && typeof box === 'object' ? box.value : undefined
        if (value === null || value === undefined) return []
        // The first release stored a bare array; read it so a pending mirror
        // from that version is not lost.
        const rows = []
        if (Array.isArray(value)) {
          for (const row of value) {
            if (row === null || typeof row !== 'object' || row.bytes === undefined) continue
            rows.push({
              key: contentKeyOf(row.name, row.type, row.bytes),
              name: String(row.name ?? 'image'),
              type: String(row.type ?? 'image/png'),
              bytes: row.bytes,
              id: typeof row.id === 'string' ? row.id : undefined,
              at: typeof row.at === 'number' ? row.at : 0,
            })
          }
        } else if (typeof value === 'object') {
          for (const key of Object.keys(value)) {
            const row = value[key]
            if (row === null || typeof row !== 'object' || row.bytes === undefined) continue
            rows.push({
              key,
              name: String(row.name ?? 'image'),
              type: String(row.type ?? 'image/png'),
              bytes: row.bytes,
              id: typeof row.id === 'string' ? row.id : undefined,
              at: typeof row.at === 'number' ? row.at : 0,
            })
          }
        }
        // Two legacy rows for one picture collapse here.
        const unique = new Map()
        for (const row of rows) unique.set(row.key, row)
        return [...unique.values()].sort((a, b) => a.at - b.at)
      })
    }

    /** Replace one Session's mirror with the given content-keyed rows. */
    function draftStoreWrite(sessionId, rows) {
      return draftStoreRun('readwrite', (store) => {
        if (rows.length === 0) {
          store.delete(String(sessionId))
          return []
        }
        const value = {}
        for (const row of rows.slice(-DRAFT_KEEP_LIMIT)) value[row.key] = row
        store.put(value, String(sessionId))
        return rows
      })
    }

    /** Bytes of one image attachment, or undefined when it cannot be mirrored. */
    function readAttachmentBytes(attachment) {
      const file = attachment?.file
      if (file === undefined || file === null) return Promise.resolve(undefined)
      if (typeof file.size === 'number' && file.size > DRAFT_KEEP_MAX_BYTES) return Promise.resolve(undefined)
      return file.arrayBuffer()
        .then((buffer) => ({ name: String(file.name ?? 'image'), type: String(file.type ?? 'image/png'), bytes: buffer }))
        .catch(() => undefined)
    }

    /**
     * Wrap the one intake that mints draft attachments so every image is
     * mirrored as bytes, keyed by the Session that owns it.
     * @param service - the conversation service, when reachable.
     */
    function installDraftCapture(service) {
      if (service === undefined || service === null || typeof service.createDrafts !== 'function') return false
      const MARK = Symbol.for('dsh-customizer.draft-capture')
      if (service[MARK] === true) return true
      const original = service.createDrafts.bind(service)
      service.createDrafts = (sessionId, files, uploadImages) => {
        const attachments = original(sessionId, files, uploadImages)
        try {
          let images = 0
          for (const attachment of attachments) {
            if (attachment?.kind !== 'image') continue
            images += 1
            const id = String(attachment.id)
            void readAttachmentBytes(attachment).then((bytes) => {
              if (bytes === undefined) return undefined
              const key = contentKeyOf(bytes.name, bytes.type, bytes.bytes)
              return draftStoreRead(sessionId).then((existing) => {
                // Same picture, same key: the older row is replaced, so repeated
                // round trips can never accumulate copies.
                const rows = existing.filter((row) => row.key !== key)
                rows.push({ key, name: bytes.name, type: bytes.type, bytes: bytes.bytes, id, at: Date.now() })
                return draftStoreWrite(sessionId, rows)
              })
            }).catch(() => {})
          }
          if (images > 0) {
            DRAFT_CONSUMED.delete(String(sessionId))
            report('draft-keep-capture', String(sessionId) + ':' + String(images))
            reportDraftState({ captures: (draftStatus.captures ?? 0) + images, last: 'capture ' + String(images) })
          }
        } catch { /* mirroring must never break the intake */ }
        return attachments
      }
      try { service[MARK] = true } catch { /* frozen service: wrap anyway */ }
      return true
    }

    /**
     * Invisible composer occupant that restores mirrored images on return.
     * @param props - standard composer slot props.
     * @returns nothing; it exists only for its effects.
     */
    function DraftAttachmentKeeper(props) {
      const { sessionId, useInput, inputActions } = props
      const ids = useInput ? useInput((state) => state.attachmentIds) : undefined
      const phase = useInput ? useInput((state) => state.phase) : undefined
      const key = sessionId === undefined ? '' : String(sessionId)
      const settled = React.useRef(false)
      const previous = React.useRef([])
      // Deferred "draft emptied" decision, cancelled when this instance goes
      // away: leaving a Session also empties the draft it owned.
      const pendingConsume = React.useRef(null)
      // Current ids at the moment an async step runs, not the ones this render
      // saw: another path can restore the draft while the mirror read is open.
      const latestIds = React.useRef([])
      latestIds.current = Array.isArray(ids) ? ids : []

      // Restore mirrored images once per mount, when the draft is still empty.
      React.useEffect(() => {
        settled.current = false
        previous.current = []
        if (key === '' || inputActions === undefined || typeof inputActions.addAttachments !== 'function') return undefined
        const timer = window.setTimeout(() => {
          if (latestIds.current.length > 0) {
            settled.current = true
            previous.current = latestIds.current
            return
          }
          // Sent or emptied already: bringing the picture back would undo it.
          if (DRAFT_CONSUMED.has(key)) {
            void draftStoreWrite(sessionId, [])
            settled.current = true
            previous.current = []
            return
          }
          draftStoreRead(sessionId).then((rows) => {
            if (rows.length === 0) { settled.current = true; previous.current = []; return }
            const service = draftServiceOf()
            if (service === undefined || typeof service.createDrafts !== 'function') {
              settled.current = true
              report('draft-keep-noservice', 'conversation service unavailable')
              reportDraftState({ service: false, last: 'restore-no-service' })
              return
            }
            ensureDraftCapture()
            const files = []
            for (const row of rows.slice(-DRAFT_KEEP_LIMIT)) {
              try {
                const parts = [new Uint8Array(row.bytes)]
                files.push(new File(parts, String(row.name ?? 'image'), { type: String(row.type ?? 'image/png') }))
              } catch { /* one unreadable row must not stop the rest */ }
            }
            if (files.length === 0) { settled.current = true; return }
            let made = []
            try {
              made = service.createDrafts(sessionId, files, true)
            } catch {
              made = []
            }
            if (made.length === 0) { settled.current = true; return }
            // The draft filled up while the mirror was being read: undo what we
            // just minted instead of adding a second copy.
            if (latestIds.current.length > 0) {
              for (const attachment of made) {
                try { service.releaseDraftAttachment?.(attachment.id) } catch { /* nothing to undo */ }
              }
              settled.current = true
              previous.current = latestIds.current
              return
            }
            const fresh = made.map((attachment) => attachment.id)
            try { inputActions.addAttachments(fresh) } catch { /* busy: try next mount */ }
            report('draft-keep-restored', key + ':' + String(made.length))
            reportDraftState({ restores: (draftStatus.restores ?? 0) + 1, last: 'restored ' + String(made.length) })
            settled.current = true
            previous.current = fresh
          }).catch(() => { settled.current = true })
        }, 0)
        return () => window.clearTimeout(timer)
      }, [key])

      React.useEffect(() => () => {
        if (pendingConsume.current !== null) {
          window.clearTimeout(pendingConsume.current)
          pendingConsume.current = null
        }
      }, [])

      // A manual removal or a send consumes the mirror for those ids only.
      const signature = Array.isArray(ids) ? ids.join('\u0000') : ''
      React.useEffect(() => {
        if (!settled.current) return
        const current = Array.isArray(ids) ? ids : []
        const before = previous.current
        previous.current = current
        // A send empties the draft: mark it at once so the remount that follows
        // cannot re-add what was just delivered. `phase` is authoritative here.
        if (phase === 'sending') {
          DRAFT_CONSUMED.add(key)
          void draftStoreWrite(sessionId, [])
          return
        }
        if (current.length === 0 && before.length > 0) {
          // Same outcome, but this also fires while a Session is being left,
          // where the picture must survive. Decide one tick later, and let the
          // unmount cleanup cancel it.
          if (pendingConsume.current !== null) window.clearTimeout(pendingConsume.current)
          pendingConsume.current = window.setTimeout(() => {
            pendingConsume.current = null
            DRAFT_CONSUMED.add(key)
            void draftStoreWrite(sessionId, [])
          }, 400)
          return
        }
        const removed = before.filter((id) => !current.includes(id))
        if (removed.length === 0) return
        draftStoreRead(sessionId).then((rows) => {
          const kept = rows.filter((row) => !removed.includes(row.id))
          return kept.length === rows.length ? undefined : draftStoreWrite(sessionId, kept)
        }).catch(() => {})
      }, [key, signature, phase])

      return null
    }

    /** Context captured at install, for the service lookup above. */
    let draftCtx
    /** Whether `createDrafts` has been wrapped, so retries stay idempotent. */
    let draftCaptureReady = false
    /** Self-reported state, returned even when the diagnostic ring moved on. */
    let draftStatus = { v: CLIENT_VERSION, slot: false, service: false, capture: false, captures: 0, restores: 0, last: 'init' }

    /** Publish the keeper's state for the Host's diagnostics. */
    function reportDraftState(patch) {
      draftStatus = { ...draftStatus, ...patch }
      try {
        fetch(ENDPOINT + '?draftState=' + encodeURIComponent(JSON.stringify(draftStatus)), { credentials: 'same-origin' }).catch(() => {})
      } catch { /* reporting must never break the composer */ }
    }

    /** The conversation service, when the registry exposes it. */
    function draftServiceOf() {
      try {
        if (draftCtx === undefined) return undefined
        const service = typeof draftCtx.get === 'function' ? draftCtx.get('conversation') : undefined
        if (service !== undefined && service !== null) return service
        return draftCtx.conversation
      } catch {
        return undefined
      }
    }

    /**
     * Wrap the intake as soon as the conversation service exists.
     *
     * Activation order is not guaranteed: this Client half may load before the
     * conversation plugin publishes the service, and reading it eagerly at
     * install then found nothing and silently disabled the whole feature. Every
     * caller retries, so a late-registered service is picked up.
     * @returns whether the capture wrapper is in place.
     */
    function ensureDraftCapture() {
      if (draftCaptureReady) return true
      const service = draftServiceOf()
      if (service === undefined || service === null) {
        reportDraftState({ service: false, last: 'no-service' })
        return false
      }
      const ok = installDraftCapture(service)
      draftCaptureReady = ok
      reportDraftState({ service: true, capture: ok, last: ok ? 'capture-ready' : 'capture-failed' })
      return ok
    }

    /** Register the silent image keeper in the composer tool row. */
    function installDraftAttachmentKeeper(ctx) {
      if (React === undefined || React === null || typeof React.createElement !== 'function') return false
      draftCtx = ctx
      // Ordering is not guaranteed, so try now and again when the service
      // announces itself; a failure here is not final.
      ensureDraftCapture()
      try {
        if (typeof ctx.inject === 'function') {
          ctx.inject(['conversation'], () => {
            draftCtx = ctx
            ensureDraftCapture()
            return () => { /* the service unloading leaves the wrapper inert */ }
          })
        }
      } catch { /* a host without ctx.inject still retries from the keeper */ }
      let slots
      try {
        slots = typeof ctx.get === 'function' ? ctx.get('slots') : undefined
        if (slots === undefined || slots === null) slots = ctx.slots
      } catch {
        slots = undefined
      }
      if (slots === undefined || slots === null || typeof slots.register !== 'function' || typeof slots.inject !== 'function') return false
      const SLOT = 'conversation.input.left'
      try {
        const register = () => slots.register({
          name: SLOT,
          id: 'mcp-companion.draft-keeper',
          order: 900,
          label: 'Draft images',
        }, DraftAttachmentKeeper)
        slots.inject(SLOT, register)
        report('draft-keep-slot', SLOT)
        reportDraftState({ slot: true, last: 'slot-registered' })
        return true
      } catch (error) {
        report('draft-keep-error', String(error?.message ?? error))
        return false
      }
    }

    /* ------------------------------------------------------------------ */
    /* 2c. Total tool weight on every MCP server card                       */
    /* ------------------------------------------------------------------ */
    /*
     * The panel prints "N tools" from the tools a server currently registers,
     * so a switched-off server reads "0 tools" and its cost becomes invisible.
     * The Host remembers each server's last weight (they register no schema
     * while off), and this appends that total to the card's meta line.
     */

    let MCP_TOKEN_QUEUED = false

    /** Server name -> weight, from the last inventory read. */
    function mcpTokenWeights() {
      const payload = inventory.value
      const rows = Array.isArray(payload?.servers) ? payload.servers : []
      const weights = new Map()
      for (const server of rows) {
        if (server === null || typeof server !== 'object' || typeof server.name !== 'string') continue
        const live = typeof server.tokens === 'number' && server.tokens > 0 ? server.tokens : 0
        const cached = typeof server.cachedTokens === 'number' ? server.cachedTokens : 0
        // Kept even at zero: an empty badge is indistinguishable from a
        // decoration that never ran, and "0 tools" already says why.
        weights.set(server.name, live > 0 ? live : cached)
      }
      return weights
    }

    /** Last scan outcome, reported once per distinct state. */
    let MCP_TOKEN_LAST = ''

    /**
     * Append the weight to every MCP card that has one.
     *
     * Class names come from a CSS-module build, so every lookup also accepts a
     * hashed suffix: a renamed `.MCP_card` must not silently disable this.
     */
    function decorateMcpCards() {
      MCP_TOKEN_QUEUED = false
      const container = document.querySelector('.MCP_cards, [class*="MCP_cards"]')
      if (container === null) return
      const weights = mcpTokenWeights()
      const cards = document.querySelectorAll('.MCP_card, [class*="MCP_card"]:not([class*="MCP_cards"])')
      const meta = cards.length > 0
        ? (cards[0].querySelector('.MCP_meta, [class*="MCP_meta"]') !== null ? 'meta' : 'no-meta')
        : 'no-cards'
      const shapes = cards.length + '/' + meta + '/' + weights.size
      if (shapes !== MCP_TOKEN_LAST) {
        MCP_TOKEN_LAST = shapes
        // One line that says whether the DOM matched and whether any weight is
        // known at all: without a connected server there is nothing to print.
        report('mcp-token-scan', shapes)
      }
      if (weights.size === 0) return
      for (const card of cards) {
        const nameElement = card.querySelector('.MCP_name, [class*="MCP_name"]')
        const meta = card.querySelector('.MCP_meta, [class*="MCP_meta"]')
        if (nameElement === null || meta === null) continue
        const name = String(nameElement.textContent ?? '').trim()
        let total = weights.get(name)
        if (total === undefined) {
          // The panel may suffix the name with a transport badge; accept the
          // single known server name the card actually contains.
          const haystack = String(card.textContent ?? '')
          const hits = [...weights.entries()].filter(([key]) => key.length >= 3 && haystack.includes(key))
          if (hits.length === 1) total = hits[0][1]
        }
        if (total === undefined) continue
        let badge = meta.querySelector('[data-mcpc-mcp-tok]')
        if (badge === null) {
          badge = document.createElement('span')
          badge.setAttribute('data-mcpc-mcp-tok', 'true')
          badge.className = 'dsh-mcpc-mcptok'
          meta.appendChild(badge)
        }
        const text = '(' + (total > 0 ? formatTokens(total) : '0 tok') + ')'
        if (badge.textContent !== text) badge.textContent = text
        badge.title = total > 0
          ? 'Total weight of this server\'s tool schemas: about ' + String(total) + ' tokens'
          : 'This server registers no tool schema right now; the weight appears once it connects'
      }
    }

    /** Ask for one decoration pass on the next frame. */
    function scheduleMcpCards() {
      if (MCP_TOKEN_QUEUED) return
      MCP_TOKEN_QUEUED = true
      window.requestAnimationFrame(decorateMcpCards)
    }

    /** Keep the weights on the cards as the page re-renders. */
    function installMcpTokenBadges() {
      if (typeof MutationObserver !== 'function') return false
      const observer = new MutationObserver(() => {
        if (document.querySelector('.MCP_cards, [class*="MCP_cards"]') !== null) scheduleMcpCards()
      })
      observer.observe(document.body, { childList: true, subtree: true })
      scheduleMcpCards()
      report('mcp-token-badges', 'observing')
      return true
    }

    /* ------------------------------------------------------------------ */
    /* 2b. Token weights inside the New Session agent-preset menu           */
    /* ------------------------------------------------------------------ */
    /*
     * The preset chip and its menu belong to the shipped agent-preset plugin
     * and live in a `single` slot whose occupant also owns the staged
     * selection, the application to a blank Session and the refusal toast.
     * Shadowing it would mean re-implementing all of that, so this decorates
     * the rendered menu instead: the choice still reaches the Host exactly as
     * before, and each card gains the two weights the user asked for.
     */

    /** Last per-preset weights read from the Host, keyed by preset id. */
    let PRESET_STATS = null
    let PRESET_STATS_PENDING = null
    /** Menu elements already inspected, so a re-render is the only repair. */
    const SEAT_MENUS = new WeakSet()

    /** Compact token text: `30.4k` above a thousand, plain below. */
    function compactTokens(value) {
      const number = typeof value === 'number' && Number.isFinite(value) ? value : 0
      if (number <= 0) return '0'
      if (number >= 1000) {
        const short = (Math.round(number / 100) / 10).toFixed(1)
        return (short.endsWith('.0') ? short.slice(0, -2) : short) + 'k'
      }
      return String(number)
    }

    /**
     * Match one menu card to its preset.
     *
     * The old test required the card text to START with an alias, which fails
     * three ways the shipped menu actually renders it: a leading icon or a
     * description changes the first characters, the French locale prints names
     * the English alias table does not carry, and several built-ins arrive with
     * no `name` at all. A card is therefore resolved by its first line against
     * a normalised label set — accents and case folded, so "Mode PTC" also
     * matches a card reading "mode ptc".
     *
     * Returns the preset entry, or undefined when the card is not a preset.
     */
    function foldLabel(value) {
      return String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim()
    }

    /** Every label this card must answer to, including the bare id. */
    function presetLabels(entry) {
      const out = new Set()
      if (typeof entry.id === 'string') out.add(foldLabel(entry.id))
      if (typeof entry.name === 'string' && entry.name.length > 0) out.add(foldLabel(entry.name))
      const builtin = BUILTIN_PRESET_NAMES[entry.id]
      if (builtin !== undefined) for (const label of builtin) out.add(foldLabel(label))
      return out
    }

    /** The visible title of one card: its first non-empty line, trimmed. */
    function cardLabel(item) {
      const text = String(item.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (text.length === 0) return ''
      // Cards append a description and the token badge; only the leading title
      // identifies the preset, so take everything before the first long gap of
      // what looks like a second sentence or a trailing number.
      const head = text.slice(0, 80)
      const parts = head.split(/(?=\s\d|,|\.|\u00b7|-)/)
      return (parts[0] ?? head).trim()
    }

    function presetForCard(item, stats) {
      const label = foldLabel(cardLabel(item))
      if (label.length === 0) return undefined
      for (const entry of stats.values()) {
        for (const alias of presetLabels(entry)) {
          if (alias.length === 0) continue
          if (label === alias || label.startsWith(alias) || label.includes(alias)) return entry
        }
      }
      return undefined
    }

    /** Every name the shipped menu may print for one preset. */
    function presetAliases(entry) {
      const out = new Set()
      if (typeof entry.id === 'string') out.add(entry.id)
      if (typeof entry.name === 'string' && entry.name.length > 0) out.add(entry.name)
      const builtin = BUILTIN_PRESET_NAMES[entry.id]
      if (builtin !== undefined) {
        out.add(builtin[0])
        out.add(builtin[1])
      }
      return [...out]
    }

    /** Read the weights once; the Host assembles every preset, so never twice. */
    function loadPresetStats() {
      if (PRESET_STATS !== null) return Promise.resolve(PRESET_STATS)
      if (PRESET_STATS_PENDING !== null) return PRESET_STATS_PENDING
      PRESET_STATS_PENDING = fetchJson(ENDPOINT + '?view=presets&client=' + CLIENT_VERSION)
        .then((payload) => {
          const map = new Map()
          for (const entry of Array.isArray(payload?.presets) ? payload.presets : []) {
            if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string') continue
            map.set(entry.id, entry)
          }
          PRESET_STATS = map
          PRESET_STATS_PENDING = null
          return map
        })
        .catch(() => {
          PRESET_STATS_PENDING = null
          return new Map()
        })
      return PRESET_STATS_PENDING
    }

    /**
     * The single weight chip appended to one menu card.
     *
     * One number only: prompt and tools were two chips and read as two separate
     * budgets. The split stays in the tooltip for whoever needs it.
     */
    /**
     * Exact cost of the open conversation, from the token estimator.
     *
     * The badges below are preset ceilings: they add the assembled prompt and
     * the declarations, which for PTC counts the catalogue twice (it is sent
     * as prompt text). The estimator prices the request that will actually be
     * sent, so for the mode in use its figure is the honest one. Anything that
     * goes wrong leaves the ceiling in place.
     */
    let CONVERSATION_COST = null
    let CONVERSATION_COST_AT = 0
    let CONVERSATION_COST_PENDING = null

    function composerDraftText() {
      try {
        const root = document.querySelector('[data-lexical-editor="true"]')
          || document.querySelector('[contenteditable="true"]')
        if (root === null) return ''
        const text = typeof root.innerText === 'string' ? root.innerText : (root.textContent || '')
        return text.replace(/\u200b/g, '').trim()
      } catch {
        return ''
      }
    }

    function loadConversationCost() {
      if (CONVERSATION_COST_PENDING !== null) return CONVERSATION_COST_PENDING
      if (CONVERSATION_COST !== null && Date.now() - CONVERSATION_COST_AT < 4000) {
        return Promise.resolve(CONVERSATION_COST)
      }
      let sessionId = null
      try {
        const holder = document.querySelector('[data-mcpc-session]')
        sessionId = holder === null ? null : holder.getAttribute('data-mcpc-session')
      } catch {
        sessionId = null
      }
      if (typeof sessionId !== 'string' || sessionId.length === 0) return Promise.resolve(CONVERSATION_COST)
      CONVERSATION_COST_PENDING = fetchJson(
        '/local-token-estimator/estimate?text=' + encodeURIComponent(composerDraftText())
          + '&session=' + encodeURIComponent(sessionId),
      )
        .then((payload) => {
          CONVERSATION_COST_PENDING = null
          CONVERSATION_COST_AT = Date.now()
          if (payload === null || typeof payload !== 'object') return CONVERSATION_COST
          if (typeof payload.total !== 'number' || typeof payload.preset !== 'string') return CONVERSATION_COST
          const before = CONVERSATION_COST
          CONVERSATION_COST = { preset: payload.preset, total: payload.total }
          const changed = before === null
            || before.total !== CONVERSATION_COST.total
            || before.preset !== CONVERSATION_COST.preset
          // Dropping the painted badges makes the menu observer repaint them
          // with the figure that just arrived.
          if (changed) {
            for (const old of document.querySelectorAll('[data-mcpc-preset-badge="true"]')) {
              try { old.remove() } catch { /* already detached */ }
            }
          }
          return CONVERSATION_COST
        })
        .catch(() => {
          CONVERSATION_COST_PENDING = null
          return CONVERSATION_COST
        })
      return CONVERSATION_COST_PENDING
    }

    function seatStatsBadge(entry) {
      if (CONVERSATION_COST === null) {
        try { void loadConversationCost() } catch { /* keep the ceiling */ }
      }
      if (CONVERSATION_COST !== null && CONVERSATION_COST.preset === entry?.id) {
        const exact = document.createElement('span')
        exact.className = 'dsh-mcpc-seatstats'
        exact.setAttribute('data-mcpc-preset-badge', 'true')
        const chipExact = document.createElement('span')
        chipExact.className = 'dsh-mcpc-seatstat'
        chipExact.title = 'Requête de cette conversation : ' + formatTokens(CONVERSATION_COST.total)
          + ' tok \u00b7 chiffre du token estimator, mesuré sur ce mode et cette conversation'
        const strongExact = document.createElement('b')
        strongExact.textContent = compactTokens(CONVERSATION_COST.total) + ' tok'
        chipExact.appendChild(strongExact)
        exact.appendChild(chipExact)
        return exact
      }
      const promptTokens = typeof entry.promptTokens === 'number' ? entry.promptTokens : 0
      const toolTokens = typeof entry.toolTokens === 'number' ? entry.toolTokens : 0
      const badge = document.createElement('span')
      badge.className = 'dsh-mcpc-seatstats'
      badge.setAttribute('data-mcpc-preset-badge', 'true')
      const chip = document.createElement('span')
      chip.className = 'dsh-mcpc-seatstat'
      // The two families this menu totals: the assembled prompt (catalogue
      // included for PTC) and the tool declarations of the mode.
      chip.title = 'System prompt ' + formatTokens(promptTokens)
        + ' \u00b7 tools ' + formatTokens(toolTokens)
      const strong = document.createElement('b')
      strong.textContent = compactTokens(promptTokens + toolTokens) + ' tok'
      chip.appendChild(strong)
      badge.appendChild(chip)
      return badge
    }

    /** Decorate one open preset menu, if this menu is that menu. */
    function decorateSeatMenu(menu, stats) {
      if (menu === null || menu === undefined) return
      const items = menu.querySelectorAll('[role="menuitem"]')
      if (items.length < 2) return
      // Only a menu whose cards are preset names qualifies: another menu is
      // left untouched even when one label happens to collide.
      const matches = []
      for (const item of items) {
        if (item.querySelector('[data-mcpc-preset-badge="true"]') !== null) continue
        const text = String(item.textContent ?? '').trim()
        if (text.length === 0) continue
        let found
        for (const entry of stats.values()) {
          for (const alias of presetAliases(entry)) {
            if (alias.length > 0 && text.startsWith(alias)) {
              found = entry
              break
            }
          }
          if (found !== undefined) break
        }
        // A hidden sub-agent row gets no badge: the row is collapsed anyway,
        // and skipping it avoids the badge flashing before the row goes.
        if (found !== undefined && !HIDDEN_PRESETS.has(found.id)) matches.push({ item, entry: found })
      }
      if (matches.length === 0) return
      const visible = [...items].filter((item) => item.style.display !== 'none').length
      if (matches.length * 2 < visible) return
      for (const { item, entry } of matches) item.appendChild(seatStatsBadge(entry))
      SEAT_MENUS.add(menu)
    }

    /* ------------------------------------------------------------------ */
    /* 2c. Per-Agent colour: a dot before the name, chosen from a palette  */
    /* ------------------------------------------------------------------ */
    /*
     * The New Session preset menu is portaled and re-rendered by React, so the
     * dot is injected into the rendered card — the same decorate-not-shadow
     * approach the token badge above uses. The choice itself travels to the
     * Host, which stores it in the plugin state file: two views of the same
     * Agent (the chip, the tab rows) then agree, and the choice survives a
     * reload.
     *
     * The dot is inserted as the FIRST child of the card's label so it really
     * is to the left of the name, which is what the mock-ups show.
     */


    /** Every document-like root: iframes and shadow roots included. */
    function deepRoots() {
      const roots = [document]
      const walk = (root, depth) => {
        if (depth > 4) return
        try {
          for (const node of root.querySelectorAll('*')) {
            if (typeof node.shadowRoot === 'object' && node.shadowRoot !== null) {
              roots.push(node.shadowRoot)
              walk(node.shadowRoot, depth + 1)
            }
            if (node.tagName === 'IFRAME') {
              try {
                const inner = node.contentDocument
                if (inner !== null && inner !== undefined) {
                  roots.push(inner)
                  walk(inner, depth + 1)
                }
              } catch { /* cross-origin iframe */ }
            }
          }
        } catch { /* unreadable tree */ }
      }
      walk(document, 0)
      return roots
    }

    /** Search every root, not just the top document. */
    function deepQuery(selector) {
      for (const root of deepRoots()) {
        try {
          const hit = root.querySelector(selector)
          if (hit !== null) return hit
        } catch { /* next root */ }
      }
      return null
    }

    /** Every match across every root. */
    function deepQueryAll(selector) {
      const out = []
      for (const root of deepRoots()) {
        try {
          for (const node of root.querySelectorAll(selector)) out.push(node)
        } catch { /* next root */ }
      }
      return out
    }

    /** Fallback palette, used until the Host sends its own. */
    const AGENT_PALETTE_FALLBACK = [
      '#5b8def', '#2ea8e5', '#22a7a0', '#2fb26a',
      '#8cc63f', '#e2b33c', '#ef8b3c', '#e4613c',
      '#d94f6a', '#c45bc0', '#9b6bd6', '#7a8899',
    ]
    /** Colours read from the Host, keyed by preset id; null until loaded. */
    let AGENT_COLORS = null
    /** Presets kept out of the agent menu (sub-agent personas). */
    let HIDDEN_PRESETS = new Set()
    let AGENT_PALETTE = AGENT_PALETTE_FALLBACK
    /** Menus whose cards already carry a dot or an explicit "no dot". */
    const COLORED_MENUS = new WeakSet()
    /** Open colour popover, so only one exists at a time. */
    let COLOR_POPOVER = null

    const AGENT_COLOR_RE = /^#[0-9a-fA-F]{6}$/

    /** True for the values the Host accepts, so nothing else reaches the CSS. */
    function safeColor(value) {
      return AGENT_COLOR_RE.test(value ?? '') ? value : null
    }

    function readAgentColors() {
      return fetchJson(ENDPOINT + '?view=colorState&client=' + CLIENT_VERSION)
        .then((payload) => {
          const map = new Map()
          const raw = payload?.colors
          if (raw !== null && typeof raw === 'object') {
            for (const id of Object.keys(raw)) {
              const color = safeColor(raw[id])
              if (color !== null) map.set(id, color)
            }
          }
          if (Array.isArray(payload?.palette) && payload.palette.length > 0) {
            const palette = payload.palette.filter((item) => AGENT_COLOR_RE.test(item ?? ''))
            if (palette.length > 0) AGENT_PALETTE = palette
          }
          if (Array.isArray(payload?.hiddenPresets)) {
            HIDDEN_PRESETS = new Set(payload.hiddenPresets.filter((id) => typeof id === 'string'))
          }
          AGENT_COLORS = map
          return map
        })
        .catch(() => {
          AGENT_COLORS = new Map()
          return AGENT_COLORS
        })
    }

    function writeAgentColor(agent, color) {
      const query = ENDPOINT + '?setAgentColor=1&client=' + CLIENT_VERSION
        + '&agent=' + encodeURIComponent(agent)
        + '&color=' + encodeURIComponent(color ?? '')
      return fetchJson(query).then((payload) => {
        const map = AGENT_COLORS ?? new Map()
        if (color === null || color === '') map.delete(agent)
        else map.set(agent, color)
        AGENT_COLORS = map
        return payload
      })
    }

    function closeColorPopover() {
      if (COLOR_POPOVER === null) return
      try { COLOR_POPOVER.remove() } catch { /* already detached */ }
      COLOR_POPOVER = null
    }

    /**
     * The swatch grid used to pick a colour.
     *
     * Clicking a swatch writes through to the Host and repaints every existing
     * dot, so the menu and the chip never disagree. "Aucune" clears the choice
     * and removes the dot.
     */
    /* -- Colour maths for the custom picker ---------------------------- */

    /** `#rrggbb` to 0-255 channels; null when the text is not a colour. */
    function hexToRgb(hex) {
      const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim())
      if (match === null) return null
      const value = parseInt(match[1], 16)
      return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
    }

    function rgbToHex(r, g, b) {
      const part = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
      return '#' + part(r) + part(g) + part(b)
    }

    /** RGB to HSV with hue in degrees and saturation/value in 0-1. */
    function rgbToHsv(r, g, b) {
      const rn = r / 255
      const gn = g / 255
      const bn = b / 255
      const max = Math.max(rn, gn, bn)
      const min = Math.min(rn, gn, bn)
      const delta = max - min
      let hue = 0
      if (delta > 0) {
        if (max === rn) hue = ((gn - bn) / delta) % 6
        else if (max === gn) hue = (bn - rn) / delta + 2
        else hue = (rn - gn) / delta + 4
        hue *= 60
        if (hue < 0) hue += 360
      }
      return { h: hue, s: max === 0 ? 0 : delta / max, v: max }
    }

    function hsvToHex(h, s, v) {
      const c = v * s
      const hp = ((h % 360) + 360) % 360 / 60
      const x = c * (1 - Math.abs((hp % 2) - 1))
      let rgb
      if (hp < 1) rgb = [c, x, 0]
      else if (hp < 2) rgb = [x, c, 0]
      else if (hp < 3) rgb = [0, c, x]
      else if (hp < 4) rgb = [0, x, c]
      else if (hp < 5) rgb = [x, 0, c]
      else rgb = [c, 0, x]
      const m = v - c
      return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255)
    }

    /**
     * The full picker: a saturation/value square over a hue strip.
     *
     * Everything is inline-styled for the same reason the dot is — the plugin
     * stylesheet never reaches this page. Dragging previews on the live dot and
     * only writes to the Host on release, so one gesture is one request.
     */
    function customColorPanel(startHex, handlers) {
      const start = hexToRgb(startHex) ?? { r: 91, g: 141, b: 239 }
      let hsv = rgbToHsv(start.r, start.g, start.b)

      const panel = document.createElement('div')
      Object.assign(panel.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      })

      // --- saturation / value square -----------------------------------
      const square = document.createElement('div')
      Object.assign(square.style, {
        position: 'relative',
        width: '200px',
        height: '130px',
        borderRadius: '8px',
        cursor: 'crosshair',
        touchAction: 'none',
        background: '',
      })
      const knob = document.createElement('div')
      Object.assign(knob.style, {
        position: 'absolute',
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        border: '2px solid #fff',
        boxShadow: '0 0 0 1px rgba(0,0,0,.45)',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      })
      square.appendChild(knob)

      // --- hue strip ----------------------------------------------------
      const hue = document.createElement('div')
      Object.assign(hue.style, {
        position: 'relative',
        width: '200px',
        height: '12px',
        borderRadius: '6px',
        cursor: 'pointer',
        touchAction: 'none',
        background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
      })
      const hueKnob = document.createElement('div')
      Object.assign(hueKnob.style, {
        position: 'absolute',
        top: '50%',
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        border: '2px solid #fff',
        boxShadow: '0 0 0 1px rgba(0,0,0,.45)',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      })
      hue.appendChild(hueKnob)

      // --- hex field ----------------------------------------------------
      const field = document.createElement('input')
      field.type = 'text'
      field.spellcheck = false
      Object.assign(field.style, {
        width: '100%',
        boxSizing: 'border-box',
        font: 'inherit',
        fontSize: '11.5px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        color: '#e5e5ea',
        background: 'rgba(255,255,255,.07)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '6px',
        padding: '4px 7px',
        outline: 'none',
      })

      const current = () => hsvToHex(hsv.h, hsv.s, hsv.v)

      /** Repaint the panels and tell the caller the colour changed. */
      const paint = (notify) => {
        const hex = current()
        square.style.background =
          'linear-gradient(to top,#000,rgba(0,0,0,0)),'
          + 'linear-gradient(to right,#fff,hsl(' + hsv.h.toFixed(1) + ' 100% 50%))'
        knob.style.left = (hsv.s * 100) + '%'
        knob.style.top = ((1 - hsv.v) * 100) + '%'
        hueKnob.style.left = (hsv.h / 360 * 100) + '%'
        if (document.activeElement !== field) field.value = hex
        if (notify === true) handlers.preview(hex)
      }

      /** Map a pointer position inside `element` to 0-1 coordinates. */
      const ratio = (element, event) => {
        const rect = element.getBoundingClientRect()
        return {
          x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
          y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
        }
      }

      const bind = (element, onMove) => {
        element.addEventListener('pointerdown', (event) => {
          event.preventDefault()
          event.stopPropagation()
          try { element.setPointerCapture(event.pointerId) } catch { /* not capturable */ }
          onMove(event)
        })
        element.addEventListener('pointermove', (event) => {
          if (event.buttons !== 1 && event.pointerType === 'mouse') return
          if (element.hasPointerCapture?.(event.pointerId) !== true) return
          event.preventDefault()
          onMove(event)
        })
        element.addEventListener('pointerup', (event) => {
          event.preventDefault()
          event.stopPropagation()
          handlers.commit(current())
        })
      }

      bind(square, (event) => {
        const { x, y } = ratio(square, event)
        hsv = { h: hsv.h, s: x, v: 1 - y }
        paint(true)
      })
      bind(hue, (event) => {
        const { x } = ratio(hue, event)
        hsv = { h: x * 360, s: hsv.s, v: hsv.v }
        paint(true)
      })

      field.addEventListener('input', () => {
        const rgb = hexToRgb(field.value)
        if (rgb === null) return
        hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
        square.style.background =
          'linear-gradient(to top,#000,rgba(0,0,0,0)),'
          + 'linear-gradient(to right,#fff,hsl(' + hsv.h.toFixed(1) + ' 100% 50%))'
        knob.style.left = (hsv.s * 100) + '%'
        knob.style.top = ((1 - hsv.v) * 100) + '%'
        hueKnob.style.left = (hsv.h / 360 * 100) + '%'
        handlers.preview(current())
      })
      field.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        event.stopPropagation()
        handlers.commit(current())
      })
      field.addEventListener('blur', () => {
        field.value = current()
        handlers.commit(current())
      })

      panel.append(square, hue, field)
      paint(false)
      return panel
    }

    function colorPopover(agent, anchor, onPick, explicitHex, customApply) {
      closeColorPopover()
      const pop = document.createElement('div')
      pop.className = 'dsh-mcpc-colorpop'
      pop.setAttribute('data-mcpc-colorpop', 'true')
      pop.setAttribute('role', 'dialog')
      // Inline, because the plugin stylesheet is not loaded on this page.
      Object.assign(pop.style, {
        position: 'absolute',
        zIndex: '2147483000',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '10px',
        borderRadius: '10px',
        background: '#1c1c1e',
        border: '1px solid rgba(255,255,255,.14)',
        boxShadow: '0 10px 30px rgba(0,0,0,.45)',
      })
      // An Agent that does not exist yet has no stored colour: the caller
      // passes the value it is about to write so the swatch stays highlighted.
      const current = explicitHex !== undefined ? explicitHex : (AGENT_COLORS?.get(agent) ?? null)

      const grid = document.createElement('div')
      grid.className = 'dsh-mcpc-colorswatches'
      Object.assign(grid.style, {
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 20px)',
        gap: '6px',
      })
      for (const hex of AGENT_PALETTE) {
        const swatch = document.createElement('button')
        swatch.type = 'button'
        swatch.className = 'dsh-mcpc-colorswatch'
        Object.assign(swatch.style, {
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          border: '1px solid rgba(0,0,0,.35)',
          cursor: 'pointer',
          padding: '0',
          background: hex,
        })
        swatch.title = hex
        swatch.setAttribute('data-color', hex)
        if (hex === current) swatch.setAttribute('aria-pressed', 'true')
        swatch.textContent = ''
        swatch.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          onPick(hex)
          closeColorPopover()
        })
        grid.appendChild(swatch)
      }
      pop.appendChild(grid)

      const none = document.createElement('button')
      none.type = 'button'
      none.className = 'dsh-mcpc-colornone'
      Object.assign(none.style, {
        font: 'inherit',
        fontSize: '11.5px',
        color: '#e5e5ea',
        background: 'rgba(255,255,255,.08)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '6px',
        padding: '4px 8px',
        cursor: 'pointer',
      })
      none.textContent = 'Aucune'
      none.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        onPick(null)
        closeColorPopover()
      })
      pop.appendChild(none)

      // A "Personnalisée" button swaps the swatch grid for the full picker.
      // The panel previews on the live dot and only persists on release.
      const custom = document.createElement('button')
      custom.type = 'button'
      custom.className = 'dsh-mcpc-colorcustom'
      Object.assign(custom.style, {
        font: 'inherit',
        fontSize: '11.5px',
        color: '#e5e5ea',
        background: 'rgba(255,255,255,.08)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '6px',
        padding: '4px 8px',
        cursor: 'pointer',
      })
      custom.textContent = 'Personnalisée\u2026'
      custom.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        grid.style.display = 'none'
        custom.style.display = 'none'
        // An Agent that does not exist yet must not write a colour under a
        // provisional id, so the caller can take both callbacks over.
        const panel = customColorPanel(current ?? '#5b8def', customApply === undefined
          ? {
            preview: (hex) => {
              AGENT_COLORS.set(agent, hex)
              repaintAgentDots()
            },
            commit: (hex) => {
              void writeAgentColor(agent, hex).then(() => repaintAgentDots())
            },
          }
          : {
            preview: (hex) => { customApply(hex, false) },
            commit: (hex) => { customApply(hex, true) },
          })
        pop.insertBefore(panel, none)
        place()
      })
      pop.appendChild(custom)

      document.body.appendChild(pop)
      const box = anchor.getBoundingClientRect()
      /** Place the popover under the anchor, above it when there is no room. */
      const place = () => {
        const width = pop.offsetWidth || 150
        const height = pop.offsetHeight || 120
        const viewWidth = document.documentElement.clientWidth
        const viewHeight = window.innerHeight
        const left = Math.min(
          Math.max(8, box.left + window.scrollX),
          window.scrollX + viewWidth - width - 8,
        )
        let top = box.bottom + window.scrollY + 6
        if (box.bottom + 6 + height > viewHeight) {
          top = Math.max(window.scrollY + 8, box.top + window.scrollY - height - 6)
        }
        pop.style.top = top + 'px'
        pop.style.left = left + 'px'
      }
      place()
      COLOR_POPOVER = pop

      // Dismiss on the next outside click or on Escape, without letting the
      // menu's own handlers close it first.
      const dismiss = (event) => {
        if (event.type === 'keydown' && event.key !== 'Escape') return
        if (event.type !== 'keydown' && pop.contains(event.target)) return
        closeColorPopover()
        window.removeEventListener('mousedown', dismiss, true)
        window.removeEventListener('keydown', dismiss, true)
      }
      window.addEventListener('mousedown', dismiss, true)
      window.addEventListener('keydown', dismiss, true)
      return pop
    }

    /**
     * The colour row: a dot, the value, and the same popover everywhere.
     *
     * Used by the Agent list (the dot is the control), by the creation form
     * (where the id does not exist yet and the choice is written once the
     * declaration is created) and by the editor (where it is written at once).
     * A read-only view shows the colour without offering to change it.
     */
    function colorControl(id, options) {
      const settings = options ?? {}
      const readOnly = settings.readOnly === true
      const currentOf = typeof settings.current === 'function'
        ? settings.current
        : () => (settings.current ?? null)
      const wrap = document.createElement('div')
      wrap.style.cssText = 'display:flex;align-items:center;gap:8px'
      const dot = document.createElement('button')
      dot.type = 'button'
      dot.style.cssText = 'width:16px;height:16px;min-width:16px;border-radius:50%;padding:0;box-sizing:border-box;flex:none;'
        + (readOnly ? 'cursor:default;' : 'cursor:pointer;')
      const value = document.createElement('span')
      value.style.cssText = 'font-size:11.5px;color:#9a9aa2'
      const paint = (hex) => {
        const chosen = typeof hex === 'string' && hex.length > 0 ? hex : null
        if (chosen === null) {
          dot.style.background = 'transparent'
          dot.style.border = '1.5px dashed rgba(255,255,255,.35)'
        } else {
          dot.style.background = chosen
          dot.style.border = '1px solid rgba(0,0,0,.35)'
        }
        dot.title = chosen === null ? 'Aucune couleur' : 'Couleur ' + chosen
        value.textContent = chosen ?? 'Aucune'
      }
      paint(currentOf())
      wrap.append(dot, value)
      if (readOnly !== true) {
        const hint = document.createElement('span')
        hint.style.cssText = 'font-size:10.5px;color:#6f6f78'
        hint.textContent = 'cliquez sur la pastille'
        wrap.appendChild(hint)
        dot.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          colorPopover(id, dot, (picked) => {
            const chosen = picked ?? null
            paint(chosen)
            settings.onPick?.(chosen)
          }, currentOf(), typeof settings.customApply === 'function' ? settings.customApply : undefined)
        })
      }
      return {
        element: wrap,
        set(hex) { paint(hex) },
      }
    }

    /**
     * The dot itself.
     *
     * Every visual property is inline on purpose: the plugin stylesheet is only
     * injected for the Skill/MCP page and the subagent card, so a class-based
     * dot on the preset list would be an empty span of zero size — invisible.
     * Inline styles make the dot work wherever it is inserted.
     */
    function agentDot(agent) {
      const dot = document.createElement('span')
      dot.className = 'dsh-mcpc-agentdot'
      dot.setAttribute('data-mcpc-dot', agent)
      dot.setAttribute('aria-hidden', 'true')
      const base = {
        display: 'inline-block',
        width: '9px',
        height: '9px',
        minWidth: '9px',
        borderRadius: '50%',
        marginRight: '6px',
        verticalAlign: 'middle',
        flex: '0 0 auto',
        boxSizing: 'border-box',
        cursor: 'pointer',
      }
      const color = AGENT_COLORS?.get(agent) ?? null
      for (const [key, value] of Object.entries(base)) dot.style[key] = value
      if (color === null) {
        dot.style.border = '1.5px dashed currentColor'
        dot.style.opacity = '0.55'
        dot.title = 'Couleur de l\u2019Agent : aucune \u00b7 cliquez pour choisir'
      } else {
        dot.style.background = color
        dot.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.25)'
        dot.title = 'Couleur de l\u2019Agent : ' + color + ' \u00b7 cliquez pour changer'
      }
      dot.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const id = agent
        colorPopover(id, dot, (picked) => {
          void writeAgentColor(id, picked).then(() => {
            repaintAgentDots()
          })
        })
      })
      return dot
    }

    /** Recolour every dot already painted, after a choice changed. */
    function repaintAgentDots() {
      for (const dot of document.querySelectorAll('[data-mcpc-dot]')) {
        const agent = dot.getAttribute('data-mcpc-dot')
        const color = AGENT_COLORS?.get(agent) ?? null
        if (color === null) {
          dot.classList.add('dsh-mcpc-agentdot-none')
          dot.style.removeProperty('background')
          dot.style.removeProperty('box-shadow')
          dot.style.border = '1.5px dashed currentColor'
          dot.style.opacity = '0.55'
          dot.title = 'Couleur de l\u2019Agent : aucune \u00b7 cliquez pour choisir'
        } else {
          dot.classList.remove('dsh-mcpc-agentdot-none')
          dot.style.removeProperty('border')
          dot.style.opacity = '1'
          dot.style.background = color
          dot.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.25)'
          dot.title = 'Couleur de l\u2019Agent : ' + color + ' \u00b7 cliquez pour changer'
        }
      }
    }

    /**
     * Every preset row rendered on the page.
     *
     * The shipped Agent-preset view is NOT an ARIA menu: it is a list of
     * `<li data-agent-preset-id="…">` cards, and the whole bundle contains no
     * `role="menu"` at all. Earlier code looked for `[role="menu"]` and so could
     * never match a single row however the labels were fixed. The identifier is
     * this data attribute, which is exact and needs no name matching.
     */
    function presetRows() {
      return deepQueryAll('[data-agent-preset-id]')
    }

    /** The name node inside one row, into which the dot is inserted. */
    function rowNameNode(row) {
      // The card prints the name in its own span; falling back to the row keeps
      // the dot visible even if that inner span goes away.
      const named = row.querySelector('[class*="cardName"]')
      if (named !== null) return named
      return row.querySelector('[class*="cardIdentity"]') ?? row
    }

    /**
     * Every container that may hold the preset list, including the portal.
     *
     * The settings view is a list of `<li data-agent-preset-id>`, but the
     * New-Session menu is portaled, mounted only while open, and carries NO
     * such attribute — the whole bundle has no `role="menu"` either. So every
     * plausible container is scanned, and inside it any node that looks like a
     * preset entry, by attribute first and by its printed name as a fallback.
     */
    function presetContainers() {
      const found = []
      const push = (list) => {
        for (const node of list) if (!found.includes(node)) found.push(node)
      }
      push(document.querySelectorAll('[role="menu"]'))
      push(document.querySelectorAll('[role="listbox"]'))
      // The portal root: React appends it outside the app tree.
      if (document.body !== null) for (const child of document.body.children) push([child])
      return found
    }

    /**
     * Put one dot before the name of every preset row that lacks one.
     *
     * No structural hook survives: the settings cards carry
     * `data-agent-preset-id` but the portaled list carries no role, no class
     * alias and no id attribute, and its text is the only stable signal. Rows
     * are therefore found from the printed names: the deepest element whose own
     * text is exactly one known label. "Deepest" matters, otherwise the whole
     * card is matched and the dot lands once per card at the wrong place.
     */
    function decoratePresetRows() {
      if (AGENT_COLORS === null) return 0
      let painted = 0

      // Labels resolved from the Host roster plus the built-in table, so a
      // custom Agent is matched by the name it actually prints.
      const wanted = new Map()
      const addEntry = (entry) => {
        if (entry === undefined || entry === null) return
        const id = typeof entry.id === 'string' ? entry.id : null
        if (id === null) return
        for (const label of presetLabels(entry)) {
          if (label.length > 0 && !wanted.has(label)) wanted.set(label, id)
        }
      }
      for (const entry of (PRESET_STATS ?? new Map()).values()) addEntry(entry)
      for (const id of Object.keys(BUILTIN_PRESET_NAMES)) {
        for (const label of BUILTIN_PRESET_NAMES[id]) addEntry({ id, name: label })
      }
      if (wanted.size === 0) return 0

      /** Resolve the Agent id printed by one name node. */
      const idOfText = (text) => {
        const own = foldLabel(String(text ?? '').replace(/\s+/g, ' ').trim())
        if (own.length === 0 || own.length > 48) return null
        const direct = wanted.get(own)
        if (direct !== undefined) return direct
        for (const [label, candidate] of wanted) {
          if (own.length > label.length && own.length - label.length <= 6 && own.startsWith(label)) return candidate
        }
        return null
      }

      /** Paint one name node, once. */
      const paint = (node, id) => {
        if (node === null || node === undefined) return
        if (node.querySelector('[data-mcpc-dot]') !== null) return
        node.insertBefore(agentDot(id), node.firstChild)
        painted += 1
      }

      // 1. The settings cards: an exact attribute carries the id.
      for (const row of deepQueryAll('[data-agent-preset-id]')) {
        const id = row.getAttribute('data-agent-preset-id')
        if (typeof id !== 'string' || id.length === 0) continue
        // cardIdentity is the flex row that already holds the name and its
        // badges, so the dot is laid out beside them. cardName alone is
        // `overflow:hidden` + ellipsis and would clip it.
        const named = row.querySelector('[class*="cardIdentity"]')
          ?? row.querySelector('[class*="cardName"]')
          ?? row
        paint(named, id)
      }

      // 2. The New-Session menu: the shipped Menu primitive prints each entry
      // as a *itemName span beside its *itemDesc. That class suffix is the only
      // stable hook, so nothing else is considered.
      for (const node of deepQueryAll('[class*="itemName"]')) {
        const id = idOfText(node.textContent)
        if (id === null) continue
        // A sub-agent persona stays in the roster but is not offered as the
        // agent for a new conversation, so its row is collapsed. The row is the
        // nearest ancestor whose class is exactly `*_item`.
        if (HIDDEN_PRESETS.has(id)) {
          const row = menuRowOf(node)
          if (row !== null) {
            row.style.setProperty('display', 'none', 'important')
            HIDDEN_ROWS.add(row)
          }
          continue
        }
        // A row hidden by an earlier pass must come back when it is unhidden.
        const row = menuRowOf(node)
        if (row !== null && HIDDEN_ROWS.has(row)) {
          row.style.removeProperty('display')
          HIDDEN_ROWS.delete(row)
        }
        paint(node, id)
      }

      return painted
    }

    /** Rows collapsed because their preset is a sub-agent persona. */
    const HIDDEN_ROWS = new Set()

    /** The menu row that owns one name node: the ancestor classed `*_item`. */
    function menuRowOf(node) {
      // The menu row is the `menuitem`: it owns both the name/description block
      // AND the token badge this plugin appends, so hiding the inner `_item`
      // block alone left an empty row with a floating badge. Collapsing the
      // menuitem removes the whole entry.
      const item = typeof node.closest === 'function' ? node.closest('[role="menuitem"]') : null
      if (item !== null && item !== undefined) return item
      let current = node
      for (let depth = 0; depth < 6 && current !== null && current !== undefined; depth += 1) {
        const className = typeof current.className === 'string' ? current.className : ''
        if (/(^|\s)[A-Za-z0-9_-]+_item(\s|$)/.test(className)) return current
        current = current.parentElement
      }
      return null
    }

    /** Depth in the tree, used to prefer the innermost name node. */
    function depthOf(node) {
      let depth = 0
      let current = node
      while (current !== null && current !== undefined && depth < 40) {
        current = current.parentElement ?? current.parentNode
        depth += 1
      }
      return depth
    }

    /** Watch the page for preset rows and give each one its dot. */
    function installAgentColors() {
      if (typeof MutationObserver !== 'function') return false
      let queued = false
      let lastReport = ''
      const scan = () => {
        queued = false
        if (AGENT_COLORS === null) return
        const painted = decoratePresetRows()
        // One line per distinct outcome: enough to diagnose a regression,
        // quiet enough to leave the rest of the log readable.
        const text = painted + ' dot(s)'
        if (text !== lastReport) {
          lastReport = text
          report('agent-colors', text + ', ' + HIDDEN_PRESETS.size + ' hidden')
        }
      }
      const schedule = () => {
        if (queued) return
        queued = true
        window.requestAnimationFrame(scan)
      }
      // The settings cards only need the colours. The portaled menu resolves
      // its rows by printed name, so it also needs the id list, but that fetch
      // must not gate the cards — it is started alongside, never awaited.
      void readAgentColors().then(schedule)
      void loadPresetStats().then(schedule)
      const observer = new MutationObserver(schedule)
      // The menu is portaled and lives only while it is open, so added nodes
      // are not enough: React also flips attributes and moves the container.
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      })
      // A mutation-based watch alone missed the settings view more than once:
      // the rows can arrive in one commit that the observer coalesces, or the
      // whole subtree can be swapped. A slow sweep guarantees the dots appear
      // without depending on catching that single event.
      // Stale dots left by an earlier build sit on nodes whose text merely
      // contained a name; they are removed once so the strict targeting below
      // starts from a clean tree.
      try {
        for (const stale of document.querySelectorAll('[data-mcpc-dot]')) {
          if (!stale.closest('[class*="itemName"],[data-agent-preset-id]')) stale.remove()
        }
      } catch { /* ignore */ }
      const sweep = setInterval(schedule, 250)
      if (typeof sweep?.unref === 'function') sweep.unref()
      report('agent-colors', 'observing')
      return true
    }

    /** Watch the document for the preset menu opening, then decorate it once. */
    function installPresetSeatStats() {
      if (typeof MutationObserver !== 'function') return false
      let queued = false
      const scan = () => {
        queued = false
        if (PRESET_STATS === null) return
        for (const menu of document.querySelectorAll('[role="menu"]')) {
          decorateSeatMenu(menu, PRESET_STATS)
        }
      }
      const schedule = () => {
        if (queued) return
        queued = true
        // Menus are portaled and re-rendered by React: scan on the next frame
        // so a fresh card list is complete when it is read.
        window.requestAnimationFrame(scan)
      }
      const observer = new MutationObserver(schedule)
      observer.observe(document.body, { childList: true, subtree: true })
      // Fetch lazily, on the first menu that looks like the preset menu.
      const warm = new MutationObserver(() => {
        if (PRESET_STATS !== null || PRESET_STATS_PENDING !== null) return
        const menus = document.querySelectorAll('[role="menu"]')
        if (menus.length === 0) return
        void loadPresetStats().then(schedule)
      })
      warm.observe(document.body, { childList: true, subtree: true })
      report('preset-stats', 'observing')
      return true
    }

    /* ------------------------------------------------------------------ */
    /* 2d. Agent manager: one modal listing every Agent and its cost        */
    /* ------------------------------------------------------------------ */
    /*
     * Opened from a "Manage agents" button pinned under the Agent list. The
     * panel is plain DOM with inline styles, for the same reason the dot is:
     * the plugin stylesheet is not loaded on these pages.
     */

    let AGENT_MANAGER = null
    let AGENTS_CACHE = null

    /** Colours and sizing shared by every control in the manager. */
    const UI = {
      panel: {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,.55)',
        padding: '24px',
      },
      card: {
        display: 'flex',
        flexDirection: 'column',
        width: 'min(760px, 100%)',
        maxHeight: 'min(84vh, 900px)',
        borderRadius: '14px',
        background: '#1b1b1f',
        border: '1px solid rgba(255,255,255,.12)',
        boxShadow: '0 24px 70px rgba(0,0,0,.55)',
        overflow: 'hidden',
        fontFamily: 'inherit',
      },
      head: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '16px 18px 12px',
        borderBottom: '1px solid rgba(255,255,255,.08)',
      },
      body: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '12px 18px 18px',
        overflowY: 'auto',
      },
      scopeHead: {
        fontSize: '12px',
        letterSpacing: '.10em',
        textTransform: 'uppercase',
        fontWeight: '700',
        color: '#d0d0d8',
        margin: '18px 0 6px',
        paddingBottom: '6px',
        borderBottom: '1px solid rgba(255,255,255,.10)',
      },
      groupHead: {
        fontSize: '11px',
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        fontWeight: '600',
        color: '#8a8a92',
        margin: '10px 0 2px',
      },
      row: {
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-start',
        padding: '10px 12px',
        borderRadius: '10px',
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.08)',
      },
      name: { fontSize: '13px', fontWeight: '600', color: '#f2f2f7' },
      desc: { fontSize: '12px', lineHeight: '1.45', color: '#b0b0b8' },
      chip: {
        fontSize: '10.5px',
        lineHeight: '16px',
        padding: '1px 7px',
        borderRadius: '5px',
        background: 'rgba(255,255,255,.07)',
        border: '1px solid rgba(255,255,255,.10)',
        color: '#b0b0b8',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        whiteSpace: 'nowrap',
      },
      btn: {
        font: 'inherit',
        fontSize: '11.5px',
        color: '#e5e5ea',
        background: 'rgba(255,255,255,.08)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '7px',
        padding: '5px 10px',
        cursor: 'pointer',
      },
      iconBtn: {
        font: 'inherit',
        fontSize: '13px',
        lineHeight: '1',
        color: '#b0b0b8',
        background: 'transparent',
        border: '0',
        borderRadius: '6px',
        padding: '4px 6px',
        cursor: 'pointer',
      },
    }

    /** Stroke icons, drawn so they inherit the button's colour. */
    const EYE_PATH = 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'
    const PENCIL_PATH = 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'
    const COPY_PATH = 'M9 9h10v10H9Z M5 15V5h10'

    function iconButton(path, title, onClick) {
      const button = document.createElement('button')
      button.type = 'button'
      button.title = title
      button.setAttribute('aria-label', title)
      Object.assign(button.style, UI.iconBtn, { padding: '5px', display: 'inline-flex' })
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('width', '15')
      svg.setAttribute('height', '15')
      svg.setAttribute('fill', 'none')
      svg.setAttribute('stroke', 'currentColor')
      svg.setAttribute('stroke-width', '1.7')
      svg.setAttribute('stroke-linecap', 'round')
      svg.setAttribute('stroke-linejoin', 'round')
      for (const d of path.split(' M')) {
        const node = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        node.setAttribute('d', d.startsWith('M') ? d : 'M' + d)
        svg.appendChild(node)
      }
      button.appendChild(svg)
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick(event)
      })
      return button
    }

    function uiButton(label, style, onClick) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      Object.assign(button.style, style ?? UI.btn)
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick(event)
      })
      return button
    }

    /** The colour dot reused from the preset list, without the click handler. */
    function managerDot(id) {
      // The same dot as everywhere else, so clicking it opens the palette: the
      // list is where an Agent's colour is most often set.
      const dot = agentDot(id)
      dot.style.marginRight = '0'
      dot.style.marginTop = '4px'
      return dot
    }

    /** Read the roster once per opening. */
    function loadAgents() {
      if (AGENTS_CACHE !== null) return Promise.resolve(AGENTS_CACHE)
      return fetchJson(ENDPOINT + '?view=agents&client=' + CLIENT_VERSION)
        .then((payload) => {
          AGENTS_CACHE = payload
          return payload
        })
        .catch(() => null)
    }

    /** Classification line shown instead of the choosers in consult mode. */
    function renderReadOnlySummary(body, entry) {
      const line = document.createElement('div')
      Object.assign(line.style, { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' })
      const chip = (text) => {
        const span = document.createElement('span')
        Object.assign(span.style, UI.chip)
        span.textContent = text
        return span
      }
      line.appendChild(chip(entry.scope === 'project' ? 'Projet' : 'Global'))
      line.appendChild(chip(entry.kind === 'subagent' ? 'Sous-agent' : 'Agent'))
      line.appendChild(chip(entry.builtIn ? 'déclaré par DSH' : 'déclaré par un bundle'))
      body.appendChild(line)
    }

    /**
     * The composition editor, shared by creation and consultation.
     *
     * A preset is a plugin list: its "tools" are the tool modules it mounts and
     * its MCP servers are modules too. The same component therefore edits and
     * displays both, and the consultation view is the read-only form of it —
     * every module is listed, checked when the Agent mounts it.
     *
     * MCP servers are offered whole or tool by tool: checking a server reveals
     * the tools it publishes, and the pin stores exactly the ones kept.
     */
    function renderCompose(body, options) {
      const settings = options ?? {}
      const readOnly = settings.readOnly === true
      const id = typeof settings.id === 'string' && settings.id.length > 0 ? settings.id : null
      const kindOf = typeof settings.kindOf === 'function'
        ? settings.kindOf
        : () => (settings.kind === 'subagent' ? 'subagent' : 'agent')
      const tools = new Map()
      const servers = new Map()
      const cache = new Map()
      let loaded = false
      let warn = () => {}

      const field = (label) => {
        const wrap = document.createElement('div')
        Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' })
        const caption = document.createElement('div')
        caption.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:11px;color:#8a8a92;font-weight:500'
        const text = document.createElement('span')
        text.textContent = label
        const count = document.createElement('span')
        count.style.cssText = 'font-size:10.5px;color:#6f6f78;font-weight:400'
        caption.append(text, count)
        wrap.appendChild(caption)
        wrap.count = count
        return wrap
      }

      const rowFor = (label, meta, checked, onChange, extra) => {
        const options = extra ?? {}
        const row = document.createElement('label')
        Object.assign(row.style, {
          display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '4px 7px',
          borderRadius: '6px', cursor: readOnly ? 'default' : 'pointer',
          background: 'rgba(255,255,255,.025)',
        })
        const box = document.createElement('input')
        box.type = 'checkbox'
        box.checked = checked === true
        box.disabled = readOnly
        box.style.cssText = 'margin:2px 0 0 0;width:13px;height:13px;accent-color:#0a84ff;flex:none;'
          + (readOnly ? 'cursor:default;opacity:.9' : 'cursor:pointer')
        const text = document.createElement('div')
        text.style.cssText = 'display:flex;flex-direction:column;min-width:0;gap:1px;flex:1 1 auto'
        const name = document.createElement('span')
        name.style.cssText = 'font-size:12px;color:#f2f2f7;line-height:1.3'
        name.textContent = label
        text.appendChild(name)
        // The description is what tells one module or one MCP tool from another:
        // two lines at most, so a list of thirty stays readable.
        if (typeof options.desc === 'string' && options.desc.length > 0) {
          const about = document.createElement('span')
          about.style.cssText = 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;'
            + 'font-size:10.5px;color:#9a9aa2;line-height:1.35'
          about.textContent = options.desc
          about.title = options.desc
          text.appendChild(about)
        }
        if (typeof meta === 'string' && meta.length > 0) {
          const note = document.createElement('span')
          note.style.cssText = 'font-size:10px;color:#6f6f78;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
          note.textContent = meta
          text.appendChild(note)
        }
        row.append(box, text)
        // A weight on the right edge: the number a reader compares down a
        // column, kept off the text so no description is pushed away.
        if (typeof options.right === 'string' && options.right.length > 0) {
          const weight = document.createElement('span')
          weight.style.cssText = 'margin-left:auto;flex:none;font-size:10px;color:#7e7e87;white-space:nowrap;padding-top:1px'
          weight.textContent = options.right
          row.appendChild(weight)
        }
        if (typeof options.title === 'string' && options.title.length > 0) row.title = options.title
        if (readOnly !== true) box.addEventListener('change', () => { onChange?.(box.checked) })
        return row
      }

      const tok = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value.toLocaleString('fr-FR') + ' tok'
        : '')

      const note = (text) => {
        const line = document.createElement('div')
        line.style.cssText = 'font-size:10.5px;color:#7e7e87;line-height:1.45;padding:0 2px'
        line.textContent = text
        return line
      }

      // ---- Tools -------------------------------------------------------
      const toolsField = field('Tools')
      const toolsList = document.createElement('div')
      toolsList.style.cssText = 'display:flex;flex-direction:column;gap:2px'
      toolsField.appendChild(toolsList)
      body.appendChild(toolsField)

      const paintTools = () => {
        toolsList.textContent = ''
        let on = 0
        for (const [pack, row] of tools.entries()) {
          if (row.checked) on += 1
          const note = row.off === 'off'
            ? 'désactivé dans la déclaration'
            : (row.off === 'conditional' ? 'activé selon la plateforme' : null)
          const line = rowFor(row.label, note, row.checked, (checked) => {
            row.checked = checked
            paintTools()
          }, { desc: row.desc, title: pack })
          if (!row.checked) line.style.opacity = readOnly ? '.55' : '.72'
          toolsList.appendChild(line)
        }
        toolsField.count.textContent = loaded ? on + ' / ' + tools.size : 'lecture…'
      }

      // ---- MCP ---------------------------------------------------------
      const mcpField = field('MCP')
      const mcpList = document.createElement('div')
      mcpList.style.cssText = 'display:flex;flex-direction:column;gap:2px'
      mcpField.appendChild(mcpList)
      mcpField.appendChild(note(readOnly
        ? 'Serveurs forcés dans cet agent : ils restent actifs même si le profil les coupe.'
        : 'L’agent garde ces serveurs même si le profil les coupe. Un serveur désactivé est démarré et réservé à cet agent.'))
      body.appendChild(mcpField)

      const toolsOfServer = (server, options) => new Promise((resolve) => {
        const discover = options !== undefined && options.discover === true
        if (!discover && cache.has(server)) { resolve(cache.get(server)); return }
        const suffix = discover ? '&discover=1' : ''
        fetchJson(ENDPOINT + '?view=serverTools&server=' + encodeURIComponent(server) + '&client=' + CLIENT_VERSION + suffix)
          .then((payload) => {
            const rows = Array.isArray(payload?.tools) ? payload.tools : []
            if (rows.length > 0) cache.set(server, rows)
            resolve(rows)
          })
          .catch(() => resolve([]))
      })

      // Explicit probe: keeps the reason so the form can say why it failed.
      const discoverServerTools = (server) => fetchJson(
        ENDPOINT + '?view=serverTools&server=' + encodeURIComponent(server) + '&client=' + CLIENT_VERSION + '&discover=1'
      ).then((payload) => {
        const rows = Array.isArray(payload?.tools) ? payload.tools : []
        if (rows.length > 0) cache.set(server, rows)
        return { rows, error: typeof payload?.error === 'string' ? payload.error : null }
      }).catch((error) => ({ rows: [], error: String(error?.message ?? error) }))

      const paintServerTools = async (state) => {
        const before = state.holder
        if (before === null || before === undefined) return
        before.textContent = ''
        if (state.on !== true) { before.style.display = 'none'; return }
        before.style.display = 'flex'
        const rows = await toolsOfServer(state.name)
        if (state.on !== true) return
        // A repaint may have replaced the holder while the tools were loading.
        const holder = state.holder ?? before
        holder.style.display = 'flex'
        holder.textContent = ''
        // `*` means the whole server: every tool it publishes is kept.
        if (state.tools.has('*') && rows.length > 0) {
          state.tools = new Set(rows.map((row) => row.name))
        }
        if (rows.length === 0) {
          // The server is off in the profile (or has not answered yet), so the
          // registry knows none of its tools. Offer an explicit probe instead of
          // a dead end: it opens one short-lived connection and caches the list.
          const off = state.enabled !== true
          const failed = typeof state.probeError === 'string' && state.probeError.length > 0
          holder.appendChild(note(failed
            ? 'Impossible de lister les outils : ' + state.probeError
            : off
              ? 'Serveur désactivé dans le profil : ses outils ne sont pas encore connus.'
              : 'Aucun outil publié pour l’instant : le serveur n’a pas encore répondu.'))
          if (readOnly !== true) {
            const probeButton = document.createElement('button')
            probeButton.type = 'button'
            probeButton.textContent = 'Découvrir les outils'
            probeButton.style.cssText = 'font:inherit;font-size:10.5px;padding:2px 9px;border-radius:5px;align-self:flex-start;'
              + 'border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#c9c9d1;cursor:pointer'
            probeButton.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              probeButton.disabled = true
              probeButton.textContent = 'connexion…'
              state.probeError = null
              void discoverServerTools(state.name).then((result) => {
                if (result.rows.length === 0) state.probeError = result.error ?? 'aucun outil renvoyé'
                void paintServerTools(state)
              })
            })
            holder.appendChild(probeButton)
          }
          return
        }
        const head = document.createElement('div')
        head.style.cssText = 'display:flex;align-items:center;gap:8px;padding:0 2px 2px'
        const count = document.createElement('span')
        count.style.cssText = 'font-size:10.5px;color:#7e7e87'
        const tally = () => {
          const on = rows.filter((row) => state.tools.has(row.name)).length
          count.textContent = on + ' / ' + rows.length + (rows.length === 1 ? ' outil actif' : ' outils actifs')
        }
        head.appendChild(count)
        if (readOnly !== true) {
          for (const preset of [{ label: 'Tous', all: true }, { label: 'Aucun', all: false }]) {
            const button = document.createElement('button')
            button.type = 'button'
            button.textContent = preset.label
            button.style.cssText = 'font:inherit;font-size:10.5px;padding:1px 7px;border-radius:5px;border:1px solid rgba(255,255,255,.14);'
              + 'background:rgba(255,255,255,.05);color:#c9c9d1;cursor:pointer'
            button.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              state.tools.clear()
              if (preset.all) for (const row of rows) state.tools.add(row.name)
              void paintServerTools(state)
            })
            head.appendChild(button)
          }
        }
        holder.appendChild(head)
        tally()
        for (const row of rows) {
          const line = rowFor(row.label ?? row.name, null, state.tools.has(row.name), (checked) => {
            if (checked) state.tools.add(row.name)
            else state.tools.delete(row.name)
            tally()
          }, {
            desc: row.description,
            title: row.name,
            right: tok(row.tokens),
          })
          line.style.background = 'transparent'
          line.style.paddingLeft = '4px'
          holder.appendChild(line)
        }
      }

      const paintServers = () => {
        mcpList.textContent = ''
        let on = 0
        for (const state of servers.values()) {
          if (state.on) on += 1
          const count = state.toolCount > 0 ? state.toolCount : (state.cachedToolCount ?? 0)
          const weight = state.tokens > 0 ? state.tokens : (state.cachedTokens ?? 0)
          // The row states what the server costs: how many tools it brings and
          // what they weigh in the prompt. Everything else is in the tooltip.
          const meta = []
          if (count > 0) meta.push(count + (count === 1 ? ' outil' : ' outils'))
          if (weight > 0) meta.push(tok(weight))
          const parts = []
          if (typeof state.transport === 'string' && state.transport.length > 0) parts.push(state.transport)
          if (typeof state.desc === 'string' && state.desc.length > 0) parts.push(state.desc)
          parts.push(state.enabled === true && state.active === true ? 'actif dans le profil'
            : state.enabled === true ? 'démarré, sans outil' : 'désactivé dans le profil')
          const block = document.createElement('div')
          block.style.cssText = 'display:flex;flex-direction:column;gap:2px'
          // Name and description only: the transport, the tool count and the
          // profile state stay in the tooltip, where they are one hover away
          // without crowding a list the reader scans for names.
          // The count and the weight sit on the name line, right-aligned: one
          // line per server, and the numbers still line up in a column.
          const line = rowFor(state.name, null, state.on, (checked) => {
            state.on = checked
            if (checked && state.tools.size === 0) state.tools.add('*')
            void paintServerTools(state)
            paintServers()
          }, { right: meta.join(' · '), title: parts.join(' · ') })
          block.appendChild(line)
          const holder = document.createElement('div')
          holder.style.cssText = 'display:none;flex-direction:column;gap:1px;margin:0 0 4px 24px'
          state.holder = holder
          block.appendChild(holder)
          mcpList.appendChild(block)
          if (state.on) void paintServerTools(state)
        }
        mcpField.count.textContent = loaded ? on + ' / ' + servers.size : 'lecture…'
      }

      const paint = (data) => {
        loaded = true
        tools.clear()
        for (const row of Array.isArray(data?.tools) ? data.tools : []) {
          tools.set(row.name, {
            label: row.label,
            desc: typeof row.desc === 'string' ? row.desc : '',
            off: row.off ?? null,
            checked: row.checked === true,
          })
        }
        servers.clear()
        for (const row of Array.isArray(data?.mcp) ? data.mcp : []) {
          const pinned = Array.isArray(row.pinned) ? row.pinned : null
          const state = {
            name: row.name,
            transport: row.transport,
            enabled: row.enabled === true,
            active: row.active === true,
            toolCount: row.toolCount ?? 0,
            tokens: row.tokens ?? 0,
            cachedToolCount: row.cachedToolCount ?? null,
            cachedTokens: row.cachedTokens ?? null,
            desc: typeof row.desc === 'string' ? row.desc : '',
            on: pinned !== null,
            tools: new Set(pinned ?? []),
            holder: null,
          }
          servers.set(row.name, state)
        }
        paintTools()
        paintServers()
      }

      const reload = () => {
        loaded = false
        toolsField.count.textContent = 'lecture…'
        mcpField.count.textContent = 'lecture…'
        const query = id === null
          ? ENDPOINT + '?view=composeOptions&kind=' + kindOf() + '&client=' + CLIENT_VERSION
          : ENDPOINT + '?view=composeOptions&id=' + encodeURIComponent(id) + '&client=' + CLIENT_VERSION
        fetchJson(query)
          .then((data) => {
            if (data?.ok !== true) {
              toolsField.count.textContent = ''
              mcpField.count.textContent = ''
              toolsList.appendChild(note('Composition illisible : ' + String(data?.error ?? 'inconnue')))
              return
            }
            paint(data)
          })
          .catch(() => {
            loaded = false
            toolsField.count.textContent = ''
            mcpField.count.textContent = ''
            toolsList.appendChild(note('Composition indisponible.'))
          })
      }
      reload()

      return {
        reload,
        onWarning(handler) { warn = typeof handler === 'function' ? handler : () => {} },
        /** The tool packages this Agent should mount. */
        collectTools() {
          return [...tools.entries()].filter(([, row]) => row.checked).map(([name]) => name)
        },
        /** `server:spec;…` where spec is `*` or the kept tool names. */
        collectMcp() {
          const out = []
          for (const state of servers.values()) {
            if (state.on !== true) continue
            if (state.tools.has('*')) { out.push(state.name + ':*'); continue }
            const names = [...state.tools]
            if (names.length === 0) {
              warn(state.name + ' : aucun outil sélectionné, le serveur ne sera pas forcé')
              continue
            }
            out.push(state.name + ':' + names.join('|'))
          }
          return out.join(';')
        },
      }
    }

    /** The "new Agent" form. */
    function openAgentCreator() {
      closeAgentManager()
      const overlay = document.createElement('div')
      Object.assign(overlay.style, UI.panel)
      overlay.addEventListener('click', (event) => { if (event.target === overlay) closeAgentManager() })
      const card = document.createElement('div')
      Object.assign(card.style, UI.card)
      overlay.appendChild(card)

      const head = document.createElement('div')
      Object.assign(head.style, UI.head)
      const headText = document.createElement('div')
      const title = document.createElement('div')
      title.style.cssText = 'font-size:15px;font-weight:600;color:#f2f2f7'
      title.textContent = 'Nouvel agent'
      const sub = document.createElement('div')
      sub.style.cssText = 'font-size:12px;color:#8a8a92;margin-top:3px'
      sub.textContent = 'Un nom, un prompt, puis les outils et les MCP que cet agent monte.'
      headText.append(title, sub)
      head.appendChild(headText)
      head.appendChild(uiButton('\u2715', UI.iconBtn, closeAgentManager))
      card.appendChild(head)

      const body = document.createElement('div')
      Object.assign(body.style, UI.body)
      card.appendChild(body)

      const field = (label) => {
        const wrap = document.createElement('div')
        Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' })
        const caption = document.createElement('div')
        caption.style.cssText = 'font-size:11px;color:#8a8a92;font-weight:500'
        caption.textContent = label
        wrap.appendChild(caption)
        return wrap
      }
      const inputStyle = {
        font: 'inherit', fontSize: '12.5px', color: '#f2f2f7',
        background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '7px', padding: '7px 9px', outline: 'none', width: '100%', boxSizing: 'border-box',
      }

      const nameInput = document.createElement('input')
      Object.assign(nameInput.style, inputStyle)
      nameInput.placeholder = 'Mon agent'
      const nameField = field('Nom')
      nameField.appendChild(nameInput)
      body.appendChild(nameField)

      const descInput = document.createElement('textarea')
      Object.assign(descInput.style, { ...inputStyle, minHeight: '52px', resize: 'vertical' })
      descInput.placeholder = 'Ce que fait cet agent'
      const descField = field('Description')
      descField.appendChild(descInput)
      body.appendChild(descField)

      // Colour: chosen now, written on the declaration once it exists.
      const pendingColor = { hex: null }
      const colorRow = colorControl('@nouveau', {
        current: () => pendingColor.hex,
        onPick: (hex) => { pendingColor.hex = hex },
        // The full picker previews and commits on the pending value only: there
        // is no id to store anything against yet.
        customApply: (hex) => {
          pendingColor.hex = hex
          colorRow.set(hex)
        },
      })
      const colorField = field('Couleur')
      colorField.appendChild(colorRow.element)
      body.appendChild(colorField)

      // Type: the template the plugin list is taken from.
      let compose = null
      const typeField = field('Type')
      const types = document.createElement('div')
      Object.assign(types.style, { display: 'inline-flex', gap: '2px', padding: '2px', borderRadius: '7px', background: 'rgba(255,255,255,.05)' })
      let kind = 'agent'
      const typeButtons = []
      for (const option of [{ key: 'agent', label: 'Agent' }, { key: 'subagent', label: 'Sous-agent' }]) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = option.label
        Object.assign(button.style, {
          font: 'inherit', fontSize: '11.5px', padding: '3px 9px', borderRadius: '5px', border: '0', cursor: 'pointer',
          background: option.key === kind ? 'rgba(255,255,255,.16)' : 'transparent',
          color: option.key === kind ? '#f2f2f7' : '#9a9aa2',
        })
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          kind = option.key
          for (const entry of typeButtons) {
            const active = entry.key === option.key
            entry.button.style.background = active ? 'rgba(255,255,255,.16)' : 'transparent'
            entry.button.style.color = active ? '#f2f2f7' : '#9a9aa2'
          }
          // The two types are modelled on different shipped presets, so the
          // tool modules have to be read again.
          compose?.reload()
        })
        typeButtons.push({ key: option.key, button })
        types.appendChild(button)
      }
      typeField.appendChild(types)
      body.appendChild(typeField)

      // Tools and MCP: the composition this Agent gets. The same component is
      // rendered by the consultation view, so what is edited here is exactly
      // what is displayed there.
      compose = renderCompose(body, { kindOf: () => kind })
      compose.onWarning((text) => showToast(text))

      const promptInput = document.createElement('textarea')
      Object.assign(promptInput.style, { ...inputStyle, minHeight: '120px', resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px' })
      promptInput.placeholder = 'Tu es un agent qui…'
      const promptField = field('Prompt')
      promptField.appendChild(promptInput)
      body.appendChild(promptField)

      const actions = document.createElement('div')
      Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' })
      actions.appendChild(uiButton('Annuler', UI.btn, () => openAgentManager()))
      const save = uiButton('Créer', UI.btn, () => {
        const name = nameInput.value.trim()
        if (name.length === 0) {
          showToast('Le nom est obligatoire')
          nameInput.focus()
          return
        }
        save.disabled = true
        save.textContent = 'Création\u2026'
        const wantedTools = compose === null ? [] : compose.collectTools()
        const wantedMcp = compose === null ? '' : compose.collectMcp()
        const query = ENDPOINT + '?createAgent=1&client=' + CLIENT_VERSION
          + '&name=' + encodeURIComponent(name)
          + '&kind=' + kind
          + '&description=' + encodeURIComponent(descInput.value.trim())
          + '&prompt=' + encodeURIComponent(promptInput.value)
          + '&tools=' + encodeURIComponent(wantedTools.join(','))
          + '&mcp=' + encodeURIComponent(wantedMcp)
        fetchJson(query)
          .then((result) => {
            if (result?.ok === true) {
              AGENTS_CACHE = null
              // The dot chosen before the Agent existed is applied to the id the
              // Host just declared.
              if (pendingColor.hex !== null && typeof result.id === 'string') {
                void writeAgentColor(result.id, pendingColor.hex).then(() => repaintAgentDots())
              }
              const pinned = Array.isArray(result.pinned) ? result.pinned : []
              const warnings = Array.isArray(result.warnings) ? result.warnings : []
              const tail = warnings.length > 0
                ? ' · ' + warnings[0]
                : (pinned.length > 0 ? ' · MCP : ' + pinned.map((row) => row.server).join(', ') : '')
              showToast('« ' + (result.name ?? result.id) + ' » créé' + tail)
              window.setTimeout(() => { openAgentManager() }, 700)
              return
            }
            save.disabled = false
            save.textContent = 'Créer'
            showToast('Échec : ' + String(result?.error ?? 'inconnu'))
          })
          .catch((error) => {
            save.disabled = false
            save.textContent = 'Créer'
            showToast('Échec : ' + String(error?.message ?? error))
          })
      })
      actions.appendChild(save)
      body.appendChild(actions)

      document.body.appendChild(overlay)
      AGENT_MANAGER = overlay
      nameInput.focus()
      return overlay
    }

    /** Read-only view of one Agent: the eye button. */
    function openAgentConsult(entry) {
      openAgentManager(entry.id, true)
    }

    /** Persist the scope or the type of one Agent. */
    function savePresetMeta(id, patch) {
      const query = ENDPOINT + '?setPresetMeta=1&id=' + encodeURIComponent(id) + '&client=' + CLIENT_VERSION
        + (patch.scope === undefined ? '' : '&scope=' + encodeURIComponent(patch.scope))
        + (patch.kind === undefined ? '' : '&kind=' + encodeURIComponent(patch.kind))
      return fetchJson(query)
        .then((payload) => {
          AGENTS_CACHE = null
          report('agent-meta', id + ' ' + JSON.stringify(patch) + ' ok=' + (payload?.ok === true))
          return payload
        })
        .catch(() => null)
    }

    function closeAgentManager() {
      if (AGENT_MANAGER === null) return
      try { AGENT_MANAGER.remove() } catch { /* detached */ }
      AGENT_MANAGER = null
    }

    /** One Agent row: dot, name, description, cost, tools, actions. */
    function agentRow(entry, onEdit, onConsult) {
      const row = document.createElement('div')
      Object.assign(row.style, UI.row)

      const dot = managerDot(entry.id)
      row.appendChild(dot)

      const text = document.createElement('div')
      Object.assign(text.style, { display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 auto', minWidth: '0' })

      const title = document.createElement('div')
      Object.assign(title.style, { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' })
      const name = document.createElement('span')
      name.style.cssText = 'font-size:13px;font-weight:600;color:#f2f2f7'
      name.textContent = entry.name ?? presetLabel(entry.id, {})
      title.appendChild(name)

      // The cost sits on the name line, right of the name: it is the number the
      // reader compares first, so it belongs beside the label.
      const cost = document.createElement('span')
      Object.assign(cost.style, UI.chip, { color: '#e5e5ea' })
      cost.textContent = compactTokens(entry.totalTokens) + ' tok'
      cost.title = 'System prompt ' + formatTokens(entry.promptTokens) + ' · tools ' + formatTokens(entry.toolTokens)
      title.appendChild(cost)

      // One count on the same line, not a wall of chips underneath: the full
      // list stays in the tooltip and the row keeps a single text line.
      if (entry.tools.length > 0) {
        const toolChip = document.createElement('span')
        Object.assign(toolChip.style, UI.chip, { color: '#8a8a92' })
        toolChip.textContent = entry.tools.length + (entry.tools.length === 1 ? ' outil' : ' outils')
        toolChip.title = entry.tools.join('\n')
        title.appendChild(toolChip)
      }

      // Servers this Agent keeps whatever the profile does.
      if (Array.isArray(entry.pinnedMcp) && entry.pinnedMcp.length > 0) {
        const pinChip = document.createElement('span')
        Object.assign(pinChip.style, UI.chip, { background: 'rgba(52,211,153,.16)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,.32)' })
        pinChip.textContent = 'MCP ' + entry.pinnedMcp.join(', ')
        pinChip.title = 'Serveurs MCP forcés dans cet agent'
        title.appendChild(pinChip)
      }

      if (entry.isDefault) {
        const badge = document.createElement('span')
        Object.assign(badge.style, UI.chip, { background: 'rgba(96,165,250,.18)', color: '#93c5fd', border: '1px solid rgba(96,165,250,.35)' })
        badge.textContent = 'par défaut'
        title.appendChild(badge)
      }
      text.appendChild(title)

      if (typeof entry.description === 'string' && entry.description.length > 0) {
        const desc = document.createElement('div')
        Object.assign(desc.style, UI.desc)
        desc.textContent = entry.description
        text.appendChild(desc)
      }

      row.appendChild(text)

      const actions = document.createElement('div')
      Object.assign(actions.style, { display: 'flex', gap: '2px', flex: '0 0 auto', alignItems: 'center' })
      // Consultation is always available: it only reads a declaration.
      const eye = iconButton(EYE_PATH, 'Consulter la définition de cet agent', () => onConsult(entry))
      actions.appendChild(eye)
      // Editing stays limited to Agents this panel owns; duplicating any Agent
      // is a new declaration, which never rewrites the original.
      if (entry.editable === true) {
        actions.appendChild(iconButton(PENCIL_PATH, 'Modifier cet agent', () => onEdit(entry)))
      }
      actions.appendChild(iconButton(COPY_PATH, 'Dupliquer cet agent', () => { void duplicateAgent(entry.id) }))
      row.appendChild(actions)
      return row
    }

    /**
     * Duplicate one Agent.
     *
     * A preset is a declaration, not a record: it cannot be copied by the Host
     * on its own, so this reports the exact step instead of pretending.
     */
    /** Duplicate one Agent into a new declaration, then reopen the list. */
    function duplicateAgent(id) {
      report('agent-duplicate', id)
      showToast('Duplication de « ' + id + ' »\u2026')
      fetchJson(ENDPOINT + '?duplicateAgent=' + encodeURIComponent(id) + '&client=' + CLIENT_VERSION)
        .then((result) => {
          if (result?.ok === true) {
            AGENTS_CACHE = null
            showToast('« ' + (result.name ?? result.id) + ' » créé (' + result.id + ')')
            window.setTimeout(() => { openAgentManager() }, 600)
            return
          }
          showToast('Échec : ' + String(result?.error ?? 'inconnu'))
        })
        .catch((error) => { showToast('Échec : ' + String(error?.message ?? error)) })
    }

    /** Short-lived message at the bottom of the window. */
    function showToast(text) {
      const notice = document.createElement('div')
      notice.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483001;'
        + 'background:#2c2c31;color:#f2f2f7;border:1px solid rgba(255,255,255,.16);border-radius:10px;'
        + 'padding:9px 14px;font-size:12px;box-shadow:0 10px 30px rgba(0,0,0,.5)'
      notice.textContent = text
      document.body.appendChild(notice)
      window.setTimeout(() => { try { notice.remove() } catch { /* detached */ } }, 3600)
    }

    /** Build the manager panel, or the editor for one Agent. */
    function openAgentManager(editId, readOnly) {
      closeAgentManager()
      const overlay = document.createElement('div')
      Object.assign(overlay.style, UI.panel)
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeAgentManager()
      })
      const card = document.createElement('div')
      Object.assign(card.style, UI.card)
      overlay.appendChild(card)

      const head = document.createElement('div')
      Object.assign(head.style, UI.head)
      const headText = document.createElement('div')
      const title = document.createElement('div')
      title.style.cssText = 'font-size:15px;font-weight:600;color:#f2f2f7'
      title.textContent = editId === undefined
        ? 'Agents'
        : (readOnly === true ? 'Consulter l\u2019agent' : 'Modifier l\u2019agent')
      const sub = document.createElement('div')
      sub.style.cssText = 'font-size:12px;color:#8a8a92;margin-top:3px'
      sub.textContent = editId === undefined
        ? 'Les agents définissent le comportement, les outils et les prompts.'
        : (readOnly === true
          ? 'Définition déclarée par DSH ou par un bundle installé : lecture seule.'
          : 'Nom, description, outils et prompt de l\u2019agent.')
      headText.append(title, sub)
      head.appendChild(headText)
      // One right-hand group: the header already spreads its two children, so a
      // button appended on its own landed in the middle of the bar.
      const headRight = document.createElement('div')
      headRight.style.cssText = 'display:flex;align-items:center;gap:6px;flex:none'
      if (editId === undefined) {
        headRight.appendChild(uiButton('+ Nouveau', UI.btn, () => openAgentCreator()))
      }
      headRight.appendChild(uiButton('\u2715', UI.iconBtn, closeAgentManager))
      head.appendChild(headRight)
      card.appendChild(head)

      const body = document.createElement('div')
      Object.assign(body.style, UI.body)
      card.appendChild(body)

      if (editId !== undefined) {
        void loadAgents().then((payload) => {
          const entry = (payload?.agents ?? []).find((row) => row.id === editId)
          if (entry === undefined) {
            body.textContent = 'Agent introuvable.'
            return
          }
          renderAgentEditor(body, entry, readOnly === true)
        })
      } else {
        body.textContent = 'Chargement\u2026'
        void loadAgents().then((payload) => {
          body.textContent = ''
          if (payload === null || payload.ok !== true) {
            const failed = document.createElement('div')
            failed.style.cssText = 'font-size:12px;color:#f87171'
            failed.textContent = 'Impossible de lire les agents du profil.'
            body.appendChild(failed)
            return
          }
          // Two axes, two levels of heading: the scope is the outer group, the
          // type the inner one, so an Agent is always read "where" then "what".
          const all = payload.agents
          const pick = (scope, kind) => all.filter((row) => row.scope === scope && row.kind === kind)
          const scopeHead = (label, count) => {
            const head = document.createElement('div')
            Object.assign(head.style, UI.scopeHead)
            head.textContent = label + ' (' + count + ')'
            return head
          }
          const kindHead = (label, count) => {
            const head = document.createElement('div')
            Object.assign(head.style, UI.groupHead)
            head.textContent = label + ' (' + count + ')'
            return head
          }
          const renderGroup = (scope, scopeLabel, emptyText) => {
            const agents = pick(scope, 'agent')
            const subs = pick(scope, 'subagent')
            if (agents.length + subs.length === 0 && emptyText === null) return
            body.appendChild(scopeHead(scopeLabel, agents.length + subs.length))
            if (agents.length + subs.length === 0) {
              const empty = document.createElement('div')
              empty.style.cssText = 'font-size:11.5px;color:#6e6e76;padding:4px 2px 2px'
              empty.textContent = emptyText
              body.appendChild(empty)
              return
            }
            if (agents.length > 0) {
              body.appendChild(kindHead('Agents', agents.length))
              for (const entry of agents) body.appendChild(agentRow(entry, (row) => openAgentManager(row.id), openAgentConsult))
            }
            if (subs.length > 0) {
              body.appendChild(kindHead('Sous-agents', subs.length))
              for (const entry of subs) body.appendChild(agentRow(entry, (row) => openAgentManager(row.id), openAgentConsult))
            }
          }

          renderGroup('global', 'Global', 'Aucun agent global.')
          renderGroup('project', 'Projet', 'Aucun agent propre à ce projet.')

          const note = document.createElement('div')
          note.style.cssText = 'font-size:11px;color:#6e6e76;margin-top:10px;line-height:1.5'
          note.textContent = 'La portée (global / projet) et le type (agent / sous-agent) sont gérés par ce panneau : '
            + 'une déclaration DSH ne porte ni l\u2019un ni l\u2019autre. Modifiez-les depuis le crayon.'
          body.appendChild(note)
        })
      }

      document.body.appendChild(overlay)
      AGENT_MANAGER = overlay
      return overlay
    }

    /** The editor form for one Agent. */
    function renderAgentEditor(body, entry, readOnly) {
      body.textContent = ''
      const field = (label) => {
        const wrap = document.createElement('div')
        Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' })
        const caption = document.createElement('div')
        caption.style.cssText = 'font-size:11px;color:#8a8a92;font-weight:500'
        caption.textContent = label
        wrap.appendChild(caption)
        return wrap
      }
      const input = document.createElement('input')
      const readOnlyLook = readOnly === true
        ? { background: 'transparent', borderColor: 'rgba(255,255,255,.08)', color: '#d8d8e0' }
        : {}
      Object.assign(input.style, {
        font: 'inherit', fontSize: '12.5px', color: '#f2f2f7',
        background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '7px', padding: '7px 9px', outline: 'none', width: '100%', boxSizing: 'border-box',
      })
      input.value = entry.name ?? ''
      input.placeholder = presetLabel(entry.id, {})
      if (readOnly === true) { input.readOnly = true; Object.assign(input.style, readOnlyLook) }

      const nameField = field('Nom')
      nameField.appendChild(input)
      body.appendChild(nameField)

      const descField = field('Description')
      const textarea = document.createElement('textarea')
      Object.assign(textarea.style, {
        font: 'inherit', fontSize: '12.5px', color: '#f2f2f7', minHeight: '56px', resize: 'vertical',
        background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '7px', padding: '7px 9px', outline: 'none', width: '100%', boxSizing: 'border-box',
      })
      textarea.value = entry.description ?? ''
      if (readOnly === true) { textarea.readOnly = true; Object.assign(textarea.style, readOnlyLook) }
      descField.appendChild(textarea)
      body.appendChild(descField)

      const colorField = field('Couleur')
      colorField.appendChild(colorControl(entry.id, {
        readOnly: readOnly === true,
        current: () => AGENT_COLORS?.get(entry.id) ?? null,
        onPick: (hex) => { void writeAgentColor(entry.id, hex).then(() => repaintAgentDots()) },
      }).element)
      body.appendChild(colorField)

      // Scope and type: stored choices, saved immediately so the list regroups
      // without a second visit to the form. A consulted declaration is shown
      // as it is, so its classification is left out entirely.
      if (readOnly === true) {
        renderReadOnlySummary(body, entry)
      } else {
      const classify = document.createElement('div')
      Object.assign(classify.style, { display: 'flex', gap: '18px', flexWrap: 'wrap', marginBottom: '12px' })
      const chooser = (label, options, value, onPick) => {
        const wrap = document.createElement('div')
        Object.assign(wrap.style, { display: 'flex', alignItems: 'center', gap: '8px' })
        const caption = document.createElement('span')
        caption.style.cssText = 'font-size:11px;color:#8a8a92;font-weight:500'
        caption.textContent = label
        wrap.appendChild(caption)
        const group = document.createElement('div')
        Object.assign(group.style, { display: 'inline-flex', gap: '2px', padding: '2px', borderRadius: '7px', background: 'rgba(255,255,255,.05)' })
        for (const option of options) {
          const active = option.value === value
          const button = document.createElement('button')
          button.type = 'button'
          button.textContent = option.label
          Object.assign(button.style, {
            font: 'inherit',
            fontSize: '11.5px',
            padding: '3px 9px',
            borderRadius: '5px',
            border: '0',
            cursor: 'pointer',
            background: active ? 'rgba(255,255,255,.16)' : 'transparent',
            color: active ? '#f2f2f7' : '#9a9aa2',
          })
          button.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (active) return
            void savePresetMeta(entry.id, option.patch).then(() => openAgentManager(entry.id))
          })
          group.appendChild(button)
        }
        wrap.appendChild(group)
        return wrap
      }
      classify.appendChild(chooser('Portée', [
        { label: 'Global', value: 'global', patch: { scope: 'global' } },
        { label: 'Projet', value: 'project', patch: { scope: 'project' } },
      ], entry.scope ?? 'global', () => {}))
      classify.appendChild(chooser('Type', [
        { label: 'Agent', value: 'agent', patch: { kind: 'agent' } },
        { label: 'Sous-agent', value: 'subagent', patch: { kind: 'subagent' } },
      ], entry.kind ?? 'agent', () => {}))
      body.appendChild(classify)
      }

      // The very component the creation form uses, read-only: every tool module
      // of the catalogue with the ones this Agent mounts checked, and the MCP
      // servers it forces with the tools it keeps. A chip wall was hiding the
      // difference between "declared" and "actually mounted".
      renderCompose(body, { id: entry.id, readOnly: true })

      const promptField = field('Prompt')
      const prompt = document.createElement('textarea')
      Object.assign(prompt.style, {
        font: 'inherit', fontSize: '12px', color: '#f2f2f7', minHeight: '120px', resize: 'vertical',
        background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '7px', padding: '7px 9px', outline: 'none', width: '100%', boxSizing: 'border-box',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      })
      prompt.placeholder = 'Chargement du prompt\u2026'
      if (readOnly === true) { prompt.readOnly = true; Object.assign(prompt.style, readOnlyLook) }
      promptField.appendChild(prompt)
      body.appendChild(promptField)

      // The declaration is read from the Host so the prompt shown is the one
      // the Agent actually receives, not a placeholder.
      void fetchJson(ENDPOINT + '?view=agentDoc&id=' + encodeURIComponent(entry.id) + '&client=' + CLIENT_VERSION)
        .then((payload) => {
          if (payload?.ok !== true) { prompt.placeholder = 'Prompt indisponible.'; return }
          prompt.value = typeof payload.prompt === 'string' ? payload.prompt : ''
          prompt.placeholder = payload.prompt === null ? 'Aucun prompt déclaré.' : ''
        })
        .catch(() => { prompt.placeholder = 'Prompt indisponible.' })

      const actions = document.createElement('div')
      Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' })
      actions.appendChild(uiButton('Retour', UI.btn, () => openAgentManager()))
      body.appendChild(actions)
    }

    /**
     * True only for the Agent-preset menu.
     *
     * Every dropdown in the app is a `[role="menu"]`, so a footer added blindly
     * also landed in the permission picker. The preset menu is the one whose
     * entries are named after presets, so that is the test.
     */
    function isPresetMenu(menu) {
      const items = menu.querySelectorAll('[class*="itemName"]')
      if (items.length < 2) return false
      let hits = 0
      for (const node of items) {
        const own = foldLabel(node.textContent)
        if (own.length === 0) continue
        for (const id of Object.keys(BUILTIN_PRESET_NAMES)) {
          if (BUILTIN_PRESET_NAMES[id].some((label) => foldLabel(label) === own)) {
            hits += 1
            break
          }
        }
      }
      return hits >= 2
    }

    /** The "Manage agents" button pinned under the Agent list. */
    function installAgentManagerButton() {
      if (typeof MutationObserver !== 'function') return false
      let queued = false
      const paint = () => {
        queued = false
        // The New-Session menu: a footer after the preset entries. It is added
        // only to a menu that actually lists presets — every other menu (the
        // permission picker, the model picker) is left untouched.
        for (const menu of deepQueryAll('[role="menu"]')) {
          if (menu.querySelector('[data-mcpc-manage]') !== null) continue
          if (!isPresetMenu(menu)) continue
          const footer = document.createElement('div')
          footer.setAttribute('data-mcpc-manage', 'true')
          Object.assign(footer.style, {
            padding: '6px 8px 2px',
            marginTop: '4px',
            borderTop: '1px solid rgba(255,255,255,.10)',
          })
          const button = uiButton('Gérer les agents', UI.btn, () => openAgentManager())
          button.style.width = '100%'
          footer.appendChild(button)
          menu.appendChild(footer)
        }

        // Settings section: under the last card group.
        const cards = deepQueryAll('[data-agent-preset-id]')
        if (cards.length > 0) {
          const list = cards[0].parentElement?.parentElement ?? null
          if (list !== null && list.querySelector('[data-mcpc-manage]') === null) {
            const footer = document.createElement('div')
            footer.setAttribute('data-mcpc-manage', 'true')
            Object.assign(footer.style, { display: 'flex', justifyContent: 'center', padding: '10px 0 2px' })
            footer.appendChild(uiButton('Gérer les agents', UI.btn, () => openAgentManager()))
            list.appendChild(footer)
          }
        }
      }
      const schedule = () => {
        if (queued) return
        queued = true
        window.requestAnimationFrame(paint)
      }
      const observer = new MutationObserver(schedule)
      observer.observe(document.body, { childList: true, subtree: true })
      const sweep = setInterval(schedule, 400)
      if (typeof sweep?.unref === 'function') sweep.unref()
      report('agent-manager', 'observing')
      return true
    }

    /** Register the chip in the New Session row, right of the mode preset. */
    function installChip(ctx) {
      if (React === undefined || React === null || typeof React.createElement !== 'function') {
        report('chip-slot-error', 'react runtime unavailable')
        return false
      }
      let slots
      try {
        slots = typeof ctx.get === 'function' ? ctx.get('slots') : undefined
        if (slots === undefined || slots === null) slots = ctx.slots
      } catch {
        slots = undefined
      }
      if (slots === undefined || slots === null || typeof slots.register !== 'function' || typeof slots.inject !== 'function') {
        report('chip-slot-error', 'slots service unavailable')
        return false
      }
      try {
        // A negative order keeps the chip first in the row's option group, so
        // it sits as close as possible to the workspace and preset controls.
        const register = () => slots.register({
          name: CHIP_SLOT,
          id: CHIP_ID,
          order: -10,
          label: 'MCP for this conversation',
        }, ConversationMcpChip)
        slots.inject(CHIP_SLOT, register)
        report('chip-slot', CHIP_SLOT)
        return true
      } catch (error) {
        report('chip-slot-error', String(error?.message ?? error))
        return false
      }
    }

    /* ------------------------------------------------------------------ */
    /* 3. Skill/MCP page tabs: tool definitions and prompt sections        */
    /* ------------------------------------------------------------------ */
    /*
     * dsh-skill-mcp-panel renders ONE page in the `main` slot with its own
     * "Skills | MCP" tab strip. It exposes no slot inside that page, so the
     * only additive way to add a tab is to decorate its rendered DOM:
     *
     *   - two buttons cloned from its own tab button (same classes, same look)
     *     are appended to its `[role="tablist"]`, so the strip is untouched;
     *   - one body element is appended to the page root and shown only while
     *     one of our tabs is selected;
     *   - its own content stays mounted and is hidden inline, and its own tab
     *     highlight is only de-emphasized by a stylesheet rule keyed on
     *     `data-mcpc-active`, so React state is never fought over;
     *   - a MutationObserver repairs the few things React can undo (a swapped
     *     content node reappearing, the page being re-rendered).
     *
     * Every entry point is guarded: a panel that changes shape must leave the
     * page usable, with our tabs simply absent.
     */

    const PAGE_STYLE_ID = 'dsh-mcp-companion-page-styles'
    const PAGE_TABS = [
      { id: 'tools', label: 'Tools', heading: 'Tool definitions' },
      { id: 'prompts', label: 'System prompt', heading: 'System prompt sections' },
    ]

    const PAGE_CSS = [
      // The panel's own tab stays React-active while ours is selected; only its
      // highlight is muted (the underline is drawn by the plugin's ::after).
      '[data-mcpc-active="1"]>[role="tablist"]>button:not([data-mcpc-tab]){color:var(--dsw-alias-label-secondary);',
      'font-weight:400}',
      '[data-mcpc-active="1"]>[role="tablist"]>button:not([data-mcpc-tab])::after{transform:scaleX(0)!important}',
      '.dsh-mcpc-body{display:none;flex-direction:column;gap:12px;width:100%;box-sizing:border-box;',
      'flex:1;min-height:0;overflow-y:auto;padding:0 clamp(20px,3vw,40px) 40px;max-width:1040px;margin:0 auto}',
      // The body is a flex column: without this its children shrink to the
      // capped height and the rows get clipped instead of scrolling.
      '.dsh-mcpc-body>*{flex:0 0 auto}',
      '.dsh-mcpc-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}',
      '.dsh-mcpc-title{font-size:15px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary)}',
      '.dsh-mcpc-caption{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);margin:2px 0 0}',
      '.dsh-mcpc-total{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);',
      'font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}',
      '.dsh-mcpc-group{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;',
      'background:var(--dsw-alias-bg-layer-3);overflow:hidden}',
      '.dsh-mcpc-tokchip{font-size:10.5px;line-height:15px;padding:1px 6px;border-radius:5px;flex:none;white-space:nowrap;',
      '  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2)}',
      '.MCP_toolRow .dsh-mcpc-tokchip{margin-left:auto}',
      '.SKV_catalogHeading .dsh-mcpc-tokchip{margin-left:8px}',
      '.SKV_toolButtons .dsh-mcpc-tokchip{margin-left:8px;align-self:center}',
      '.SKV_rowControls .dsh-mcpc-tokchip{margin-left:2px}',
      '.dsh-mcpc-groupright{display:inline-flex;align-items:center;gap:8px;flex:none}',
      '.dsh-mcpc-grouphead{display:flex;align-items:center;justify-content:space-between;gap:8px;',
      'padding:8px 12px;background:var(--dsw-alias-bg-layer-1);border-bottom:1px solid var(--dsw-alias-border-l2)}',
      '.dsh-mcpc-groupname{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-mcpc-groupmeta{font-size:11.5px;color:var(--dsw-alias-label-tertiary);',
      'font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}',
      '.dsh-mcpc-row{display:flex;align-items:center;gap:10px;padding:8px 12px;',
      'border-bottom:1px solid var(--dsw-alias-border-l2);flex-wrap:wrap}',
      '.dsh-mcpc-row:last-child{border-bottom:none}',
      '.dsh-mcpc-row[data-off="true"] .dsh-mcpc-rowname{color:var(--dsw-alias-label-tertiary)}',
      '.dsh-mcpc-rowtext{flex:1 1 0%;min-width:0;display:flex;flex-direction:column;gap:1px;cursor:pointer;',
      'background:0 0;border:0;padding:0;text-align:left;font:inherit;color:inherit}',
      '.dsh-mcpc-rowtext[data-static="true"]{cursor:default}',
      '.dsh-mcpc-rowname{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);',
      'white-space:normal;overflow-wrap:anywhere}',
      '.dsh-mcpc-rowsub{font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary);',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-mcpc-tok{font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary);',
      'font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}',
      '.dsh-mcpc-switch{width:36px;height:20px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);',
      'background:var(--dsw-alias-bg-layer-1);position:relative;cursor:pointer;flex:none;padding:0;',
      'transition:background-color .18s ease,border-color .18s ease}',
      '.dsh-mcpc-switch[data-on="true"]{background:var(--dsw-alias-label-primary);border-color:transparent}',
      '.dsh-mcpc-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;',
      'background:var(--dsw-alias-label-secondary);transition:transform .18s ease,background-color .18s ease;display:block}',
      '.dsh-mcpc-switch[data-on="true"]>.dsh-mcpc-knob{transform:translateX(16px);background:var(--dsw-alias-bg-base,#000)}',
      '.dsh-mcpc-switch:disabled{opacity:.4;cursor:default}',
      '.dsh-mcpc-pre{margin:0;padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l2);',
      'background:var(--dsw-alias-markdown-code-block,var(--dsw-alias-bg-layer-1));',
      'color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace;',
      'font-size:11.5px;line-height:17px;white-space:pre-wrap;word-break:break-word;max-height:420px;overflow:auto}',
      '.dsh-mcpc-note{font-size:12.5px;line-height:20px;color:var(--dsw-alias-label-tertiary);padding:6px 2px}',
      '.dsh-mcpc-note[data-error="true"]{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-mcpc-tag{font-size:10.5px;line-height:15px;padding:1px 6px;border-radius:5px;',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary);flex:none;white-space:nowrap}',
      // Agent-preset tags: the same shape as the order tag, outlined so a row
      // that only some presets provide is readable at a glance.
      '.dsh-mcpc-presets{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;',
      'flex:none;min-width:0;max-width:100%}',
      // A long preset list moves to its own line instead of squeezing the name
      // out of the row, which is what made the name unreadable.
      '.dsh-mcpc-presets-block{display:flex;flex:1 0 100%;justify-content:flex-start;margin-top:2px}',
      // No max-width and no ellipsis: a preset name is short and cutting it made
      // the tag unreadable, which defeated its purpose.
      '.dsh-mcpc-presetchip{font-size:10.5px;line-height:15px;padding:1px 7px;border-radius:999px;flex:none;',
      'white-space:nowrap;',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);',
      'border:1px solid var(--dsw-alias-border-l2)}',
      '.dsh-mcpc-presetchip[data-in-all="true"]{border-style:dashed;color:var(--dsw-alias-label-tertiary)}',
      '.dsh-mcpc-presetchip[data-clickable="true"],.dsh-mcpc-presettotal[data-clickable="true"]{font:inherit;cursor:pointer}',
      '.dsh-mcpc-presetchip[data-clickable="true"]:hover,.dsh-mcpc-presettotal[data-clickable="true"]:hover{',
      'background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-label-secondary)}',
      '.dsh-mcpc-presetchip[data-active="true"],.dsh-mcpc-presettotal[data-active="true"]{',
      'border-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary)}',
      '.dsh-mcpc-filterbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 10px;border-radius:8px;',
      'background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);font-size:12px}',
      '.dsh-mcpc-filtertext{color:var(--dsw-alias-label-primary);font-weight:600}',
      '.dsh-mcpc-filterclear{font:inherit;font-size:11.5px;color:var(--dsw-alias-label-secondary);background:0 0;',
      'border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 10px;cursor:pointer}',
      '.dsh-mcpc-filterclear:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-secondary)}',
      '.dsh-mcpc-seatstats{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px}',
      '.dsh-mcpc-seatstat{font-size:10.5px;line-height:15px;padding:0 7px;border-radius:999px;white-space:nowrap;',
      'font-variant-numeric:tabular-nums;background:rgba(255,255,255,.06);',
      'color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2)}',
      '.dsh-mcpc-seatstat b{font-weight:600;color:var(--dsw-alias-label-primary)}',
      // Per-Agent colour dot, injected as the first child of the preset card
      // so it sits before the name. `inline-block` keeps it on the text line.
      '.dsh-mcpc-agentdot{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none;',
      'margin-right:6px;vertical-align:middle;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.25) inset}',
      '.dsh-mcpc-agentdot:hover{transform:scale(1.25)}',
      // No colour chosen yet: a hollow ring instead of an invisible dot, so
      // the control is discoverable rather than missing.
      '.dsh-mcpc-agentdot-none{background:transparent!important;',
      'border:1.5px dashed var(--dsw-alias-label-tertiary);width:7px;height:7px}',
      '.dsh-mcpc-colorpop{position:absolute;z-index:10000;display:flex;flex-direction:column;gap:8px;',
      'padding:10px;border-radius:10px;background:var(--dsw-alias-bg-layer-3,#1c1c1e);',
      'border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));',
      'box-shadow:0 8px 24px rgba(0,0,0,.35)}',
      '.dsh-mcpc-colorswatches{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}',
      '.dsh-mcpc-colorswatch{width:18px;height:18px;border-radius:50%;border:1px solid rgba(0,0,0,.3);',
      'cursor:pointer;padding:0}',
      '.dsh-mcpc-colorswatch:hover{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px}',
      '.dsh-mcpc-colorswatch[aria-pressed="true"]{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px}',
      '.dsh-mcpc-colornone{font:inherit;font-size:11.5px;color:var(--dsw-alias-label-secondary);',
      'background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:3px 8px;cursor:pointer}',
      '.dsh-mcpc-colornone:hover{color:var(--dsw-alias-label-primary)}',
      '.dsh-mcpc-mcptok{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);',
      'font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.dsh-mcpc-row[data-off="true"] .dsh-mcpc-presetchip{opacity:.55}',
      '.dsh-mcpc-presettotals{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.dsh-mcpc-presettotalslabel{font-size:11.5px;color:var(--dsw-alias-label-tertiary);flex:none}',
      '.dsh-mcpc-presettotal{display:inline-flex;align-items:center;gap:6px;font-size:11px;line-height:16px;',
      'padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);',
      'border:1px solid var(--dsw-alias-border-l2);white-space:nowrap}',
      '.dsh-mcpc-presettotalname{color:var(--dsw-alias-label-secondary);max-width:160px;overflow:hidden;',
      'text-overflow:ellipsis}',
      '.dsh-mcpc-presettotalvalue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}',
      '.dsh-mcpc-subagent-box{display:flex;flex-direction:column;gap:12px;padding:14px 16px;margin:12px 0;',
      'border-radius:10px;border:1px solid var(--dsw-alias-border-l4,rgba(255,255,255,.12));',
      'background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.03));box-sizing:border-box}',
      '.dsh-mcpc-subagent-header{display:flex;align-items:center;justify-content:space-between;gap:10px;',
      'padding-bottom:8px;border-bottom:1px solid var(--dsw-alias-border-l3,rgba(255,255,255,.08))}',
      '.dsh-mcpc-subagent-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#fff);',
      'display:flex;align-items:center;gap:6px}',
      '.dsh-mcpc-subagent-badge{font-size:10.5px;line-height:1;padding:3px 7px;border-radius:999px;',
      'background:var(--dsw-alias-brand-secondary,rgba(0,150,255,.15));color:var(--dsw-alias-brand-primary,#4ea1ff);font-weight:500}',
      '.dsh-mcpc-subagent-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}',
      '.dsh-mcpc-subagent-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
      '.dsh-mcpc-subagent-name{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,#f2f2f2);line-height:1.4}',
      '.dsh-mcpc-subagent-desc{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8a8e);line-height:1.4}',
      '.dsh-mcpc-subagent-select-wrap{display:flex;align-items:center;gap:10px;padding:8px 10px;',
      'border-radius:6px;background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.25));',
      'border:1px solid var(--dsw-alias-border-l3,rgba(255,255,255,.08));margin-top:4px}',
      '.dsh-mcpc-subagent-select-label{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary,#b0b0b5);white-space:nowrap}',
      '.dsh-mcpc-subagent-select{flex:1;min-width:0;background:var(--dsw-alias-bg-layer-2,#2c2c2e);',
      'color:var(--dsw-alias-label-primary,#fff);border:1px solid var(--dsw-alias-border-l2,#3a3a3e);',
      'border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit;outline:none;cursor:pointer}',
      '.dsh-mcpc-subagent-saved{font-size:11px;color:#34c759;font-weight:500;opacity:0;transition:opacity .2s ease}',
      '.dsh-mcpc-subagent-saved[data-visible="true"]{opacity:1}',
    ].join('')

    /** The decorated page, or null while the panel is closed. */
    let PAGE = null

    function ensurePageStyles() {
      try {
        const existing = document.getElementById(PAGE_STYLE_ID)
        if (existing !== null) {
          if (existing.textContent !== PAGE_CSS) existing.textContent = PAGE_CSS
          return
        }
        const style = document.createElement('style')
        style.id = PAGE_STYLE_ID
        style.textContent = PAGE_CSS
        document.head.appendChild(style)
      } catch {
        // Unstyled tabs are still usable.
      }
    }

    function childBy(element, match) {
      if (element === null || element === undefined) return null
      const kids = element.children
      if (kids === null || kids === undefined) return null
      for (let index = 0; index < kids.length; index += 1) {
        const kid = kids[index]
        try {
          if (match(kid) === true) return kid
        } catch {
          // A single odd node must not stop the search.
        }
      }
      return null
    }

    function tagIs(element, name) {
      return String(element?.tagName ?? '').toUpperCase() === name
    }

    /** The panel page: a `[data-tab]` root whose second child is a tab strip. */
    function findPageRoot() {
      try {
        if (typeof document.querySelectorAll !== 'function') return null
        const nodes = document.querySelectorAll('[data-tab]')
        for (let index = 0; index < nodes.length; index += 1) {
          const node = nodes[index]
          const strip = childBy(node, (kid) => kid?.getAttribute?.('role') === 'tablist')
          if (strip === null) continue
          const tab = String(node.getAttribute?.('data-tab') ?? '')
          if (tab !== 'skills' && tab !== 'mcp') continue
          let buttons = 0
          for (let next = 0; next < strip.children.length; next += 1) {
            if (tagIs(strip.children[next], 'BUTTON')) buttons += 1
          }
          if (buttons >= 2) return node
        }
      } catch {
        // A page without the panel simply has no root.
      }
      return null
    }

    function noteElement(text, isError) {
      const element = document.createElement('div')
      element.className = 'dsh-mcpc-note'
      if (isError === true) element.setAttribute('data-error', 'true')
      element.textContent = text
      return element
    }

    function switchElement(on, title, onFlip) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'dsh-mcpc-switch'
      button.setAttribute('role', 'switch')
      button.setAttribute('aria-checked', on ? 'true' : 'false')
      button.setAttribute('data-on', on ? 'true' : 'false')
      button.setAttribute('title', title)
      const knob = document.createElement('span')
      knob.className = 'dsh-mcpc-knob'
      button.appendChild(knob)
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        onFlip(on !== true)
      })
      return button
    }

    /**
     * Per-preset weight chips: the payload's total is the union of every preset,
     * so this names what one conversation of each preset really sends.
     */
    function presetTotalsElement(summary, state) {
      const totals = Array.isArray(summary?.presetTotals) ? summary.presetTotals : []
      if (totals.length < 2) return undefined
      const line = document.createElement('div')
      line.className = 'dsh-mcpc-presettotals'
      const lede = document.createElement('span')
      lede.className = 'dsh-mcpc-presettotalslabel'
      lede.textContent = 'Per preset'
      line.appendChild(lede)
      const sorted = totals.slice().sort((a, b) => (b.tokens || 0) - (a.tokens || 0))
      for (const entry of sorted) {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = 'dsh-mcpc-presettotal'
        chip.setAttribute('data-clickable', 'true')
        if (state?.presetFilter === entry?.id) chip.setAttribute('data-active', 'true')
        const name = document.createElement('span')
        name.className = 'dsh-mcpc-presettotalname'
        name.textContent = presetLabel(entry?.id, state?.presetNames)
        const value = document.createElement('span')
        value.className = 'dsh-mcpc-presettotalvalue'
        value.textContent = formatTokens(entry?.tokens)
        chip.appendChild(name)
        chip.appendChild(value)
        // The live-agent count stays in the tooltip only: a bare "x4" beside a
        // token figure read as a multiplier rather than an agent count.
        const agents = typeof entry?.agents === 'number' ? entry.agents : 0
        chip.title = presetLabel(entry?.id, state?.presetNames) + ' assembles ' + formatTokens(entry?.tokens)
          + ' across ' + String(entry?.rows ?? 0) + ' rows, '
          + (agents === 0 ? 'and no live agent runs it' : (agents === 1 ? 'with 1 live agent' : 'with ' + String(agents) + ' live agents'))
        const totalId = entry?.id
        chip.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          setPresetFilter(state, state.tab, totalId)
        })
        line.appendChild(chip)
      }
      return line
    }

    /**
     * Built-in preset ids and the name each one is shown under.
     *
     * A shipped preset publishes no `name`, and the host has no locale; the
     * client does, so the label belongs here. Without this the tag showed the
     * raw id — "cordis" is the same preset the UI calls Creator mode.
     */
    const BUILTIN_PRESET_NAMES = {
      // Both locales are listed, because the shipped menu prints whichever the
      // profile uses. Several forms exist for one preset: the harness has
      // shipped both "Mode Créateur" and the feminised "Mode Creatrice", and a
      // table missing one of them silently leaves that card without a dot.
      standard: ['Standard mode', 'Mode Standard', 'Mode standard'],
      ptc: ['PTC mode', 'Mode PTC', 'Mode ptc'],
      minimal: ['Minimal mode', 'Mode Minimal', 'Mode minimal'],
      cordis: ['Creator mode', 'Mode Créateur', 'Mode Creatrice', 'Mode Createur', 'Mode créateur', 'Mode creatrice'],
    }

    /** 0 for English, 1 for French; the plugin ships both locales. */
    function presetLanguage() {
      try {
        const raw = String(navigator?.language ?? document?.documentElement?.lang ?? 'en').toLowerCase()
        return raw.startsWith('fr') ? 1 : 0
      } catch {
        return 0
      }
    }

    /** Display name for one preset id: published name, built-in text, then id. */
    function presetLabel(id, names) {
      const key = String(id ?? '')
      const published = names !== null && names !== undefined ? names[key] : undefined
      if (typeof published === 'string' && published.length > 0) return published
      const builtin = BUILTIN_PRESET_NAMES[key]
      if (builtin !== undefined) return builtin[presetLanguage()]
      return key
    }

    /**
     * Tag the Agent presets a row comes from.
     *
     * Only a row the presets disagree on needs the tag: a section, context or
     * tool that every preset assembles is simply part of the prompt, and a
     * global registration belongs to none of them. The host decides that and
     * sends `conditional`, so this stays a rendering decision.
     */
    function presetChipsElement(row, state) {
      // One tag instead of a wall of preset names when the row is everywhere.
      if (row?.inAll === true) {
        const all = document.createElement('span')
        all.className = 'dsh-mcpc-presets'
        const chip = document.createElement('span')
        chip.className = 'dsh-mcpc-presetchip'
        chip.setAttribute('data-in-all', 'true')
        chip.textContent = 'In All Agent'
        chip.title = 'Every Agent preset assembles this row'
        all.appendChild(chip)
        return { node: all, block: true }
      }
      if (row?.conditional !== true) return
      const presets = Array.isArray(row?.presets) ? row.presets : []
      if (presets.length === 0) return
      const names = state?.presetNames
      const labels = presets.map((preset) => presetLabel(preset, names))
      // Tags always own the line below the row, so the name, the weight and the
      // switch keep a stable place whatever the preset list looks like.
      const block = true
      const held = document.createElement('span')
      held.className = block ? 'dsh-mcpc-presets dsh-mcpc-presets-block' : 'dsh-mcpc-presets'
      held.title = (labels.length === 1 ? 'Only this Agent preset provides it: ' : 'Provided by these Agent presets: ')
        + labels.join(', ')
      for (let index = 0; index < labels.length; index += 1) {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = 'dsh-mcpc-presetchip'
        chip.textContent = labels[index]
        chip.title = 'Show only what ' + labels[index] + ' assembles, and switch it off for that preset only'
        chip.setAttribute('data-clickable', 'true')
        const id = presets[index]
        if (state?.presetFilter === id) chip.setAttribute('data-active', 'true')
        chip.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          setPresetFilter(state, state.tab, id)
        })
        held.appendChild(chip)
      }
      return { node: held, block }
    }

    /** One tool row: name, description, weight, switch. */
    /** One tool row: name, description, weight, switch, expandable definition. */
    function toolRow(row, state) {
      const wrap = document.createElement('div')
      const element = document.createElement('div')
      element.className = 'dsh-mcpc-row'
      element.setAttribute('data-off', row.enabled === true ? 'false' : 'true')

      const text = document.createElement('button')
      text.type = 'button'
      text.className = 'dsh-mcpc-rowtext'
      const name = document.createElement('div')
      name.className = 'dsh-mcpc-rowname'
      name.textContent = row.name
      const sub = document.createElement('div')
      sub.className = 'dsh-mcpc-rowsub'
      const bits = []
      if (typeof row.description === 'string' && row.description.length > 0) bits.push(row.description)
      if (row.locked === true) bits.push('cannot be restricted')
      if (row.serverDisabled === true) bits.push('server off')
      sub.textContent = bits.join(' \u00b7 ')
      text.appendChild(name)
      if (sub.textContent !== '') text.appendChild(sub)

      const definition = typeof row.definition === 'string' ? row.definition : ''
      const pre = document.createElement('pre')
      pre.className = 'dsh-mcpc-pre'
      pre.textContent = definition
      pre.style.display = 'none'
      const canExpand = definition.length > 0
      if (canExpand) {
        text.title = 'Open the full definition sent to the model'
        text.setAttribute('aria-expanded', 'false')
        text.addEventListener('click', () => {
          const open = pre.style.display !== 'none'
          pre.style.display = open ? 'none' : 'block'
          text.setAttribute('aria-expanded', open ? 'false' : 'true')
        })
      } else {
        text.setAttribute('data-static', 'true')
      }

      const tokens = formatTokens(row.tokens)
      const tok = document.createElement('span')
      tok.className = 'dsh-mcpc-tok'
      tok.textContent = tokens
      tok.title = 'Weight of this schema in the context'

      const chips = presetChipsElement(row, state)
      element.appendChild(text)
      if (chips !== undefined && chips.block !== true) element.appendChild(chips.node)
      if (tokens !== '') element.appendChild(tok)
      const locked = row.locked === true || row.serverDisabled === true
      element.appendChild(switchElement(
        row.enabled === true,
        locked ? 'Locked' : 'Turn this tool on or off',
        (wanted) => { if (locked) return; state.flip('tools', 'toggleTool', row.name, wanted) },
      ))
      if (locked) element.lastChild.disabled = true
      if (chips !== undefined && chips.block === true) element.appendChild(chips.node)
      wrap.appendChild(element)
      if (canExpand) wrap.appendChild(pre)
      return wrap
    }

    /** One prompt-section row: name, weight, preset tags, switch, expandable text. */
    function promptRow(row, state) {
      const wrap = document.createElement('div')
      const element = document.createElement('div')
      element.className = 'dsh-mcpc-row'
      element.setAttribute('data-off', row.enabled === true ? 'false' : 'true')

      const text = document.createElement('button')
      text.type = 'button'
      text.className = 'dsh-mcpc-rowtext'
      const name = document.createElement('div')
      name.className = 'dsh-mcpc-rowname'
      name.textContent = row.name
      const sub = document.createElement('div')
      sub.className = 'dsh-mcpc-rowsub'
      const description = typeof row.description === 'string' ? row.description.trim() : ''
      if (description !== '') sub.textContent = description
      text.appendChild(name)
      if (description !== '') text.appendChild(sub)

      const details = []
      details.push(row.empty === true ? 'empty' : String(row.chars) + ' chars')
      if (row.dynamic === true) details.push('dynamic')
      const isContext = row.kind === 'context'
      if (isContext) details.push('runtime context')
      element.title = row.name + ' \u00b7 ' + details.join(' \u00b7 ')

      const pre = document.createElement('pre')
      pre.className = 'dsh-mcpc-pre'
      const body = typeof row.text === 'string' ? row.text : ''
      pre.textContent = body
      pre.style.display = 'none'
      const canExpand = body.length > 0
      if (!canExpand) text.setAttribute('data-static', 'true')
      text.addEventListener('click', () => {
        if (!canExpand) return
        const open = pre.style.display !== 'none'
        pre.style.display = open ? 'none' : 'block'
        text.setAttribute('aria-expanded', open ? 'false' : 'true')
      })

      const tokens = formatTokens(row.tokens)
      const tok = document.createElement('span')
      tok.className = 'dsh-mcpc-tok'
      tok.textContent = tokens
      tok.title = isContext
        ? 'Weight of this runtime context in each request'
        : 'Weight of this section in the system prompt'

      // A runtime context has no registered placement, and the switch cannot
      // shadow it, so the row still says what it is. Sections carry no order
      // tag: the list itself is in assembly order.
      element.appendChild(text)
      if (isContext) {
        const kindTag = document.createElement('span')
        kindTag.className = 'dsh-mcpc-tag'
        kindTag.textContent = 'runtime context'
        kindTag.title = 'Dynamic context attached to each request, not part of the prompt text'
        element.appendChild(kindTag)
      }
      const chips = presetChipsElement(row, state)
      if (chips !== undefined && chips.block !== true) element.appendChild(chips.node)
      if (tokens !== '') element.appendChild(tok)
      const locked = row.locked === true
      const control = switchElement(
        row.enabled === true,
        locked ? 'Runtime context follows the request; no profile switch' : 'Turn this section on or off',
        (wanted) => { if (!locked) state.flip('prompts', 'togglePrompt', row.name, wanted) },
      )
      if (locked) control.disabled = true
      element.appendChild(control)
      if (chips !== undefined && chips.block === true) element.appendChild(chips.node)
      wrap.appendChild(element)
      if (canExpand) wrap.appendChild(pre)
      return wrap
    }

    /**
     * Rows the active preset filter keeps, carrying that preset's own switch
     * state. Without a filter every row keeps the profile-wide state the host
     * already resolved.
     */
    function visibleRows(rows, state) {
      const filter = state?.presetFilter ?? null
      if (filter === null) return rows
      const kept = []
      for (const row of rows) {
        const belongs = row?.inAll === true
          || (Array.isArray(row?.presets) && row.presets.includes(filter))
        if (!belongs) continue
        const off = Array.isArray(row?.presetsOff) && row.presetsOff.includes(filter)
        kept.push({ ...row, enabled: !off })
      }
      return kept
    }

    /** Group already-sorted rows sequentially, for a filtered view. */
    function groupsFromRows(rows) {
      const groups = []
      for (const row of rows) {
        const last = groups[groups.length - 1]
        if (last === undefined || last.name !== row.group) {
          groups.push({ name: row.group, rows: [], tokens: 0 })
        }
        const target = groups[groups.length - 1]
        target.rows.push(row)
        if (row.enabled !== false) target.tokens += row.tokens
      }
      return groups
    }

    /** Turn the preset filter on or off and repaint the page in place. */
    function setPresetFilter(state, kind, presetId) {
      if (state === null) return
      state.presetFilter = state.presetFilter === presetId ? null : presetId
      if (state.tab === kind) paintPage(state, kind)
    }

    /** Bar naming the active filter, with the way back to every preset. */
    function filterBar(state, kind) {
      const filter = state?.presetFilter ?? null
      if (filter === null) return undefined
      const bar = document.createElement('div')
      bar.className = 'dsh-mcpc-filterbar'
      const text = document.createElement('span')
      text.className = 'dsh-mcpc-filtertext'
      text.textContent = 'Only ' + presetLabel(filter, state.presetNames)
      bar.appendChild(text)
      const clear = document.createElement('button')
      clear.type = 'button'
      clear.className = 'dsh-mcpc-filterclear'
      clear.textContent = 'Show every preset'
      clear.title = 'Clear the preset filter'
      clear.addEventListener('click', (event) => {
        event.preventDefault()
        setPresetFilter(state, kind, filter)
      })
      bar.appendChild(clear)
      return bar
    }

    function headElement(heading, caption, total) {
      const head = document.createElement('div')
      head.className = 'dsh-mcpc-head'
      const left = document.createElement('div')
      const title = document.createElement('div')
      title.className = 'dsh-mcpc-title'
      title.textContent = heading
      const note = document.createElement('p')
      note.className = 'dsh-mcpc-caption'
      note.textContent = caption
      left.appendChild(title)
      left.appendChild(note)
      head.appendChild(left)
      if (typeof total === 'string' && total.length > 0) {
        const right = document.createElement('div')
        right.className = 'dsh-mcpc-total'
        right.textContent = total
        head.appendChild(right)
      }
      return head
    }

    /**
     * One bordered group: a headline with its counters (and, for a group of
     * more than one row, a switch for the whole group), then its rows.
     */
    function groupElement(name, bits, nodes, toggle) {
      const section = document.createElement('div')
      section.className = 'dsh-mcpc-group'
      const head = document.createElement('div')
      head.className = 'dsh-mcpc-grouphead'
      const label = document.createElement('span')
      label.className = 'dsh-mcpc-groupname'
      label.textContent = String(name ?? '')
      const right = document.createElement('span')
      right.className = 'dsh-mcpc-groupright'
      const meta = document.createElement('span')
      meta.className = 'dsh-mcpc-groupmeta'
      meta.textContent = bits.filter((bit) => typeof bit === 'string' && bit.length > 0).join(' \u00b7 ')
      right.appendChild(meta)
      if (toggle !== undefined && toggle !== null) {
        right.appendChild(switchElement(toggle.on, toggle.title, toggle.flip))
      }
      head.appendChild(label)
      head.appendChild(right)
      section.appendChild(head)
      for (const node of nodes) section.appendChild(node)
      return section
    }

    /** Switch for a whole group: on only when every row of the group is on. */
    function groupToggle(rows, title, flip) {
      if (rows.length < 2) return undefined
      const allOn = rows.every((row) => row.enabled !== false)
      return { on: allOn, title, flip }
    }

    /** Group counters as shown in a group headline. */
    function groupBits(group) {
      const count = typeof group.count === 'number' ? group.count : 0
      const on = typeof group.on === 'number' ? group.on : count
      return [String(on) + '/' + String(count), formatTokens(group.tokens)]
    }

    function paintTools(state, payload) {
      const body = state.body
      while (body.firstChild !== null) body.removeChild(body.firstChild)
      if (payload === null || payload === undefined) {
        body.appendChild(headElement(
          PAGE_TABS[0].heading,
          'Each switch removes the tool from the model in every conversation.',
          '',
        ))
        body.appendChild(noteElement('Loading\u2026', false))
        return
      }
      const summary = payload?.summary ?? {}
      const parts = []
      if (typeof summary.on === 'number') parts.push(summary.on + ' active')
      if (typeof summary.off === 'number' && summary.off > 0) parts.push(summary.off + ' off')
      const total = formatTokens(summary.tokens)
      if (total !== '') parts.push(total)
      const presetCount = typeof summary.presets === 'number' ? summary.presets : 0
      body.appendChild(headElement(
        PAGE_TABS[0].heading,
        'Every tool the model can receive, gathered from all '
          + (presetCount > 1 ? String(presetCount) + ' Agent presets' : 'Agent presets')
          + '. Each switch removes the tool from the model in every conversation; '
          + 'a row tagged with a preset name exists only there. Groups are the plugins that register them.',
        parts.join(' \u00b7 '),
      ))
      state.presetNames = payload?.presetNames ?? {}
      const toolPresetLine = presetTotalsElement(summary, state)
      if (toolPresetLine !== undefined) body.appendChild(toolPresetLine)

      const allRows = Array.isArray(payload?.tools) ? payload.tools : []
      const rows = visibleRows(allRows, state)
      const bar = filterBar(state, 'tools')
      if (bar !== undefined) body.appendChild(bar)
      if (rows.length === 0) {
        body.appendChild(noteElement(payload?.error !== undefined
          ? 'Erreur : ' + String(payload.error)
          : (state.presetFilter === null
            ? 'No harness tool is registered.'
            : 'This Agent preset assembles no harness tool.'), payload?.ok === false))
        return
      }
      // A filtered view regroups what survived; the unfiltered one uses the
      // host's counters so the group weights stay authoritative.
      const groups = state.presetFilter === null
        ? (Array.isArray(payload?.groups) ? payload.groups : [])
        : groupsFromRows(rows).map((group) => ({ name: group.name, count: group.rows.length, on: group.rows.filter((row) => row.enabled !== false).length, tokens: group.tokens }))
      if (groups.length === 0) {
        for (const row of rows) body.appendChild(toolRow(row, state))
        return
      }
      for (const group of groups) {
        const members = rows.filter((row) => row?.group === group.name)
        if (members.length === 0) continue
        const names = members.map((row) => row.name)
        const groupFilter = state.presetFilter
        const toggle = groupToggle(members, 'Turn every tool in this group on or off', (wanted) => {
          flipMany(state, 'tools', 'toggleTools', names, wanted, groupFilter)
        })
        body.appendChild(groupElement(group.name, groupBits(group), members.map((row) => toolRow(row, state)), toggle))
      }
    }

    function paintPrompts(state, payload) {
      const body = state.body
      while (body.firstChild !== null) body.removeChild(body.firstChild)
      if (payload === null || payload === undefined) {
        body.appendChild(headElement(
          PAGE_TABS[1].heading,
          'Each switch removes the section from the system prompt in every conversation.',
          '',
        ))
        body.appendChild(noteElement('Loading\u2026', false))
        return
      }
      const summary = payload?.summary ?? {}
      const parts = []
      if (typeof summary.sections === 'number') {
        parts.push(summary.sections + (summary.sections === 1 ? ' section' : ' sections'))
      }
      if (typeof summary.contexts === 'number' && summary.contexts > 0) {
        parts.push(summary.contexts + ' runtime context' + (summary.contexts === 1 ? '' : 's'))
      }
      if (typeof summary.off === 'number' && summary.off > 0) parts.push(summary.off + ' off')
      const total = formatTokens(summary.tokens)
      if (total !== '') parts.push(total)
      const presetCount = typeof summary.presets === 'number' ? summary.presets : 0
      body.appendChild(headElement(
        PAGE_TABS[1].heading,
        presetCount > 1
          ? 'Every section and runtime context the model receives, assembled for all '
            + String(presetCount) + ' Agent presets. A row tagged with a preset name exists only there.'
          : 'Every section and runtime context the model receives. Groups are the plugins that register them.',
        parts.join(' \u00b7 '),
      ))
      state.presetNames = payload?.presetNames ?? {}
      const promptPresetLine = presetTotalsElement(summary, state)
      if (promptPresetLine !== undefined) body.appendChild(promptPresetLine)

      const allRows = Array.isArray(payload?.prompts) ? payload.prompts : []
      const rows = visibleRows(allRows, state)
      const bar = filterBar(state, 'prompts')
      if (bar !== undefined) body.appendChild(bar)
      if (rows.length === 0) {
        const message = payload?.ok === false
          ? 'Erreur : ' + String(payload.error ?? 'registre indisponible')
          : (state.presetFilter === null
            ? 'The system prompt registry is not available.'
            : 'This Agent preset assembles nothing from the registry.')
        body.appendChild(noteElement(message, payload?.ok === false))
        return
      }
      const groups = state.presetFilter === null
        ? (Array.isArray(payload?.groups) ? payload.groups : [])
        : groupsFromRows(rows).map((group) => ({ name: group.name, count: group.rows.length, on: group.rows.filter((row) => row.enabled !== false).length, tokens: group.tokens }))
      if (groups.length === 0) {
        const nodes = []
        for (const row of rows) nodes.push(promptRow(row, state))
        body.appendChild(groupElement('Assembly order', [String(rows.length) + ' sections'], nodes))
        return
      }
      for (const group of groups) {
        const members = rows.filter((row) => row?.group === group.name)
        if (members.length === 0) continue
        const names = members.map((row) => row.name)
        const groupFilter = state.presetFilter
        const toggle = groupToggle(members, 'Turn every section in this group on or off', (wanted) => {
          flipMany(state, 'prompts', 'togglePrompts', names, wanted, groupFilter)
        })
        body.appendChild(groupElement(group.name, groupBits(group), members.map((row) => promptRow(row, state)), toggle))
      }
    }

    function paintPage(state, kind) {
      try {
        const payload = state.payload[kind]
        if (kind === 'tools') paintTools(state, payload)
        else paintPrompts(state, payload)
        state.body.setAttribute('data-mcpc-ready', 'true')
      } catch (error) {
        report('page-paint-error', String(error?.message ?? error))
      }
    }

    function loadPage(state, kind, force) {
      if (state.loading[kind] === true) return
      if (force !== true && state.payload[kind] !== null) return
      state.loading[kind] = true
      const url = ENDPOINT + '?view=' + kind + '&client=' + CLIENT_VERSION
      fetchJson(url)
        .then((payload) => {
          state.loading[kind] = false
          if (payload !== null && typeof payload === 'object') state.payload[kind] = payload
          else state.payload[kind] = { ok: false, error: 'unreadable response' }
          if (state.tab === kind) paintPage(state, kind)
        })
        .catch((error) => {
          state.loading[kind] = false
          state.payload[kind] = { ok: false, error: String(error?.message ?? error) }
          if (state.tab === kind) paintPage(state, kind)
          report('page-load-error', kind + ': ' + String(error?.message ?? error))
        })
    }

    /** Show or hide the panel's own content while one of our tabs is active. */
    function maskOwnContent(state, mask) {
      const kids = state.root.children
      for (let index = 2; index < kids.length; index += 1) {
        const kid = kids[index]
        if (kid === null || kid === undefined) continue
        if (typeof kid.hasAttribute === 'function' && kid.hasAttribute('data-mcpc-body')) continue
        try {
          if (mask === true) {
            if (kid.style.display !== 'none') {
              kid.setAttribute('data-mcpc-masked', 'true')
              kid.style.display = 'none'
            }
          } else if (kid.hasAttribute('data-mcpc-masked') === true) {
            kid.removeAttribute('data-mcpc-masked')
            kid.style.removeProperty('display')
          }
        } catch {
          // One stubborn node must not leave the page blank.
        }
      }
    }

    /**
     * Keep the tab body inside the viewport so its own list can scroll.
     *
     * The panel page may be as tall as its content and clipped by its own
     * `overflow:hidden`: a long list would then be cut with no scrollbar. Sizing
     * the body to the space left under the tab strip gives it a definite height,
     * which is what turns `overflow-y:auto` into a real scroll.
     */
    function fitBody(state) {
      if (state === null || state === undefined || state.tab === null) return
      try {
        const viewport = typeof window !== 'undefined' && Number.isFinite(window.innerHeight) ? window.innerHeight : 0
        if (viewport <= 0) return
        const rect = state.body.getBoundingClientRect()
        const available = Math.max(180, Math.floor(viewport - rect.top - 16))
        const current = Number.parseInt(state.body.style.maxHeight, 10)
        if (Number.isFinite(current) && Math.abs(current - available) < 3) return
        state.body.style.maxHeight = available + 'px'
        if (state.reported !== true) {
          state.reported = true
          const rootRect = state.root.getBoundingClientRect()
          report('page-metrics', 'vh=' + viewport + ' top=' + Math.round(rect.top)
            + ' avail=' + available + ' scroll=' + state.body.scrollHeight
            + ' client=' + state.body.clientHeight + ' rootH=' + Math.round(rootRect.height)
            + ' overflow=' + String(state.body.style.overflowY))
        }
      } catch {
        // A page without layout still renders, just without the cap.
      }
    }

    function selectTab(state, id) {
      if (state === null) return
      state.tab = id
      for (const [key, button] of state.buttons) {
        button.setAttribute('data-active', key === id ? 'true' : 'false')
        button.setAttribute('aria-pressed', key === id ? 'true' : 'false')
      }
      state.root.setAttribute('data-mcpc-active', '1')
      state.body.style.display = 'flex'
      state.body.setAttribute('data-mcpc-view', id)
      maskOwnContent(state, true)
      fitBody(state)
      // The body is a single subtree shared by both views: switching tabs must
      // repaint it even when that view was already loaded.
      paintPage(state, id)
      loadPage(state, id, false)
    }

    function clearTab(state) {
      if (state === null) return
      state.tab = null
      for (const [, button] of state.buttons) {
        button.setAttribute('data-active', 'false')
        button.setAttribute('aria-pressed', 'false')
      }
      state.root.removeAttribute('data-mcpc-active')
      state.body.style.display = 'none'
      maskOwnContent(state, false)
    }

    /** Switch a whole group at once: one request, one persist, one reapply. */
    function flipMany(state, kind, param, names, wanted, preset) {
      if (state === null || names.length === 0) return
      if (state.busy[kind] === true) return
      state.busy[kind] = true
      const url = ENDPOINT + '?view=' + kind + '&' + param + '=' + encodeURIComponent(names.join(','))
        + '&enabled=' + (wanted === true ? 'true' : 'false')
        + (typeof preset === 'string' && preset.length > 0 ? '&preset=' + encodeURIComponent(preset) : '')
        + '&client=' + CLIENT_VERSION
      fetchJson(url)
        .then((payload) => {
          state.busy[kind] = false
          if (payload === null || typeof payload !== 'object') return
          state.payload[kind] = payload
          if (state.tab === kind) paintPage(state, kind)
          if (payload.ok !== true) report('page-toggle-error', String(payload.error ?? 'inconnu'))
          else report('page-toggle-group', kind + ' x' + names.length + '=' + String(wanted === true))
        })
        .catch((error) => {
          state.busy[kind] = false
          report('page-toggle-error', String(error?.message ?? error))
        })
    }

    function flipPage(state, kind, param, name, wanted, preset) {
      const url = ENDPOINT + '?view=' + kind + '&' + param + '=' + encodeURIComponent(name)
        + '&enabled=' + (wanted === true ? 'true' : 'false')
        + (typeof preset === 'string' && preset.length > 0 ? '&preset=' + encodeURIComponent(preset) : '')
        + '&client=' + CLIENT_VERSION
      fetchJson(url)
        .then((payload) => {
          if (payload === null || typeof payload !== 'object') return
          state.payload[kind] = payload
          if (state.tab === kind) paintPage(state, kind)
          if (payload.ok !== true) report('page-toggle-error', String(payload.error ?? 'inconnu'))
          else report('page-toggle', kind + ' ' + name + '=' + String(wanted === true))
        })
        .catch((error) => { report('page-toggle-error', String(error?.message ?? error)) })
    }

    /**
     * Drop the tabs and body a previous module instance left in the page.
     *
     * A client bundle reload replaces the module but not the DOM it built, so
     * decoration must be idempotent across instances instead of stacking.
     */
    function cleanPrevious(root) {
      try {
        const strip = childBy(root, (kid) => kid?.getAttribute?.('role') === 'tablist')
        if (strip !== null) {
          for (const kid of Array.from(strip.children)) {
            if (typeof kid.hasAttribute === 'function' && kid.hasAttribute('data-mcpc-tab')) strip.removeChild(kid)
          }
        }
        for (const kid of Array.from(root.children)) {
          if (typeof kid.hasAttribute === 'function' && kid.hasAttribute('data-mcpc-body')) root.removeChild(kid)
        }
        root.removeAttribute('data-mcpc-active')
        for (const kid of Array.from(root.children)) {
          if (kid.hasAttribute?.('data-mcpc-masked') === true) {
            kid.removeAttribute('data-mcpc-masked')
            kid.style.removeProperty('display')
          }
        }
      } catch {
        // A half-cleaned page is still better than a duplicated one.
      }
    }

    /** Build our tabs and body inside the panel page; returns the state. */
    function decoratePage(root) {
      const strip = childBy(root, (kid) => kid?.getAttribute?.('role') === 'tablist')
      if (strip === null) return null
      cleanPrevious(root)
      const own = []
      for (let index = 0; index < strip.children.length; index += 1) {
        if (tagIs(strip.children[index], 'BUTTON')) own.push(strip.children[index])
      }
      if (own.length === 0) return null

      const buttons = new Map()
      const prototype = own[own.length - 1]
      for (const tab of PAGE_TABS) {
        let button
        try {
          button = prototype.cloneNode(true)
        } catch {
          button = null
        }
        if (button === null) {
          button = document.createElement('button')
          button.className = prototype.getAttribute('className') ?? prototype.className ?? ''
          button.type = 'button'
        }
        button.textContent = tab.label
        button.setAttribute('data-mcpc-tab', tab.id)
        button.setAttribute('data-active', 'false')
        button.setAttribute('aria-pressed', 'false')
        button.setAttribute('title', tab.heading)
        strip.appendChild(button)
        buttons.set(tab.id, button)
      }

      const body = document.createElement('div')
      body.className = 'dsh-mcpc-body'
      body.setAttribute('data-mcpc-body', '1')
      body.style.display = 'none'
      root.appendChild(body)

      const state = {
        root,
        strip,
        body,
        buttons,
        tab: null,
        payload: { tools: null, prompts: null },
        loading: { tools: false, prompts: false },
        busy: { tools: false, prompts: false },
        // The Agent preset a tag was clicked for; null shows every preset.
        presetFilter: null,
        presetNames: {},
        // A visible filter scopes every switch to that preset, so the same
        // control means "for every agent" or "for this preset only".
        flip: (kind, param, name, wanted) => flipPage(state, kind, param, name, wanted, state.presetFilter),
        observer: null,
        timer: null,
        dispose: null,
      }

      for (const tab of PAGE_TABS) {
        buttons.get(tab.id).addEventListener('click', (event) => {
          event.preventDefault()
          selectTab(state, tab.id)
        })
      }
      // The user going back to one of the panel's own tabs must reveal its
      // content again; the listener runs in the capture phase so it wins
      // against React's own click handling.
      const onStripClick = (event) => {
        let node = event.target
        while (node !== null && node !== undefined && node !== strip) {
          if (typeof node.hasAttribute === 'function' && node.hasAttribute('data-mcpc-tab')) return
          node = node.parentNode
        }
        if (state.tab !== null) clearTab(state)
      }
      strip.addEventListener('click', onStripClick, true)

      const repair = () => {
        if (state.tab === null) return
        if (state.body.style.display !== 'flex') state.body.style.display = 'flex'
        fitBody(state)
        maskOwnContent(state, true)
        if (state.body.childNodes.length === 0 && state.payload[state.tab] === null) paintPage(state, state.tab)
      }
      const onResize = () => { try { fitBody(state) } catch { /* layout not ready */ } }
      try { window.addEventListener('resize', onResize) } catch { /* no window */ }
      try {
        if (typeof MutationObserver === 'function') {
          state.observer = new MutationObserver(() => {
            try { repair() } catch { /* a repair pass must never throw into React */ }
          })
          state.observer.observe(root, { childList: true, subtree: false })
        }
      } catch {
        state.observer = null
      }
      // Belt and braces: content swapped by React is hidden again within a
      // quarter second even if the observer missed the mutation.
      state.timer = setInterval(() => {
        try {
          if (document.contains?.(root) === false) { disposePage(state); return }
          // A reloaded bundle replaces the module but keeps the page: the old
          // body is detached by the new instance, so this one stands down.
          if (state.body.isConnected === false) { disposePage(state); return }
          repair()
          tickMcp(state)
        } catch { /* ignore */ }
      }, 250)

      state.dispose = () => {
        state.tab = null
        try { strip.removeEventListener('click', onStripClick, true) } catch { /* already gone */ }
        try { window.removeEventListener('resize', onResize) } catch { /* no window */ }
        try { state.observer?.disconnect?.() } catch { /* already gone */ }
        if (state.timer !== null) clearInterval(state.timer)
        state.timer = null
        try { body.remove() } catch { if (body.parentNode !== null) body.parentNode.removeChild(body) }
        for (const [, button] of buttons) {
          try { button.remove() } catch { /* already gone */ }
        }
        try { root.removeAttribute('data-mcpc-active') } catch { /* ignore */ }
        maskOwnContent(state, false)
      }
      return state
    }

    /**
     * Token chips on the panel's own MCP cards.
     *
     * The page belongs to `dsh-skill-mcp-panel` and is not modified: we only
     * append one chip to each server headline and one to each tool row, priced
     * from the same inventory the menu uses. Running it on every pass is safe -
     * a chip whose text is already right is left alone, so a repaint by the
     * panel is repaired on the next tick without churn.
     */
    function tickMcp(state) {
      if (state === null) return
      try {
        const root = state.root
        if (String(root?.getAttribute?.('data-tab') ?? '') !== 'mcp') return
        const cards = Array.from(root.querySelectorAll?.('.MCP_card') ?? [])
        if (cards.length === 0) return
        const payload = inventory.value
        const servers = Array.isArray(payload?.servers) ? payload.servers : null
        if (servers === null) {
          refresh(false)
          return
        }
        for (const card of cards) {
          const label = String(card.querySelector?.('.MCP_name')?.textContent ?? '').trim()
          if (label === '') continue
          const server = servers.find((row) => row?.name === label)
          if (server === undefined) continue
          const badges = card.querySelector?.('.MCP_badges') ?? card.querySelector?.('.MCP_cardTop')
          if (badges !== null && badges !== undefined) {
            const weight = weightOf(server)
            chipInto(badges, weight.value, weight.title, 'server')
          }
          // The card prints the tool count it read when the list was built, so
          // a server that only connected afterwards still reads "0 tools" while
          // the inventory knows better. Only a positive, known count overwrites
          // it: this must never replace a real number with a stale zero.
          // The card's switch belongs to the panel: it mirrors the profile (or the
          // workspace override) and a click writes exactly that. Forcing it off
          // here desynchronised it from React, so the next click sent the
          // opposite of what the reader asked for.
          // A result box from "Test connection" stays until dismissed: one
          // click on the card closes it, and it stays closed even when the
          // panel re-renders it.
          if (card.querySelector?.('.MCP_result') !== null) {
            if (card.getAttribute('data-mcpc-dismissed') === '1') {
              for (const box of Array.from(card.querySelectorAll?.('.MCP_result') ?? [])) {
                box.style.setProperty('display', 'none', 'important')
              }
            } else if (card.getAttribute('data-mcpc-dismiss') !== '1') {
              card.setAttribute('data-mcpc-dismiss', '1')
              card.addEventListener('click', (event) => {
                const target = event.target
                // A click that starts the test, or lands inside the box, is not
                // a dismissal.
                if (target?.closest?.('.MCP_actions, .MCP_form, .MCP_result') !== null) return
                card.setAttribute('data-mcpc-dismissed', '1')
                for (const box of Array.from(card.querySelectorAll?.('.MCP_result') ?? [])) {
                  box.style.setProperty('display', 'none', 'important')
                }
              })
            }
          }

          const meta = card.querySelector?.('.MCP_meta')
          if (meta !== null && meta !== undefined && typeof server.toolCount === 'number' && server.toolCount > 0) {
            for (const span of Array.from(meta.querySelectorAll?.('span') ?? [])) {
              if (span.classList?.contains?.('MCP_dot') === true) continue
              const text = String(span.textContent ?? '')
              const leading = /^\s*(\d+)/.exec(text)
              if (leading === null) continue
              if (leading[1] === String(server.toolCount)) continue
              span.textContent = text.replace(/^\s*\d+/, String(server.toolCount))
              span.title = 'Compte lu dans l\'inventaire du Host : ' + String(server.toolCount) + ' outils'
            }
            // The total hides how many are actually live: say so, but only when
            // the two really differ.
            const active = typeof server.activeToolCount === 'number' ? server.activeToolCount : null
            let extra = meta.querySelector?.('[data-mcpc-active-count]') ?? null
            const wanted = active !== null && active !== server.toolCount
              ? '(' + String(active) + ' active' + ')'
              : ''
            if (wanted === '') {
              if (extra !== null) extra.remove()
            } else {
              if (extra === null) {
                extra = document.createElement('span')
                extra.setAttribute('data-mcpc-active-count', 'true')
                meta.appendChild(extra)
              }
              if (extra.textContent !== wanted) extra.textContent = wanted
              extra.title = String(active) + ' of ' + String(server.toolCount)
                + ' tools are on; the rest are switched off'
            }
          }
          for (const row of Array.from(card.querySelectorAll?.('.MCP_toolRow') ?? [])) {
            const toolLabel = String(row.querySelector?.('.MCP_toolName')?.textContent ?? '').trim()
            if (toolLabel === '') continue
            const tools = Array.isArray(server.tools) ? server.tools : []
            const tool = tools.find((entry) => entry?.name === toolLabel
              || String(entry?.name ?? '').endsWith('__' + toolLabel))
            if (tool === undefined) continue
            chipInto(row, tool.tokens, 'Tokens this tool schema costs', 'tool')
          }
        }
      } catch {
        // A price chip must never break the panel.
      }
    }

    /** Keep exactly one price chip of that kind in `container`. */
    function chipInto(container, tokens, title, kind) {
      let chip = null
      for (const kid of Array.from(container.children ?? [])) {
        if (kid?.classList?.contains?.('dsh-mcpc-tokchip') === true
          && kid.getAttribute?.('data-kind') === kind) { chip = kid; break }
      }
      const text = formatTokens(tokens)
      if (text === '') {
        if (chip !== null) chip.remove()
        return
      }
      if (chip === null) {
        chip = document.createElement('span')
        chip.className = 'dsh-mcpc-tokchip'
        chip.setAttribute('data-kind', kind)
        container.appendChild(chip)
      }
      if (chip.textContent !== text) chip.textContent = text
      if (chip.title !== title) chip.title = title
    }

    function disposePage(state) {
      if (state === null) return
      try { state.dispose?.() } catch { /* already disposed */ }
      if (PAGE === state) PAGE = null
    }

    /**
     * Keep the page decorated while the panel is open. A new page element
     * (panel reopened, route changed) replaces the previous decoration.
     */
    function installPageTabs() {
      let root = null
      try { root = findPageRoot() } catch { root = null }
      if (PAGE !== null && (root === null || root !== PAGE.root || pageAlive(PAGE) === false)) {
        disposePage(PAGE)
      }
      if (root !== null && PAGE !== null) { tickMcp(PAGE); return }
      if (root === null || PAGE !== null) return
      ensurePageStyles()
      const state = decoratePage(root)
      if (state !== null) {
        PAGE = state
        report('page-tabs', 'tabs installed')
      }
    }

    function pageAlive(state) {
      try {
        if (state?.root?.isConnected === true) return true
        if (typeof document.contains === 'function') return document.contains(state.root) === true
      } catch {
        // Unknown: assume alive and let the next pass decide.
        return true
      }
      return true
    }

    /* ------------------------------------------------------------------ */
    /* 4. Subagent Settings Page Decoration                               */
    /* ------------------------------------------------------------------ */

    const subagentState = {
      forceModel: false,
      blockMainModel: false,
      forcedModel: null,
      loaded: false,
      loading: false,
    }

    function fetchSubagentSettings() {
      if (subagentState.loading) return Promise.resolve(subagentState)
      subagentState.loading = true
      return fetchJson(ENDPOINT + '?view=subagentSettings')
        .then((res) => {
          if (res !== null && typeof res === 'object' && res.ok === true) {
            subagentState.forceModel = res.subagentForceModel === true
            subagentState.blockMainModel = res.subagentBlockMainModel === true
            subagentState.forcedModel = res.forcedSubagentModel ?? null
            subagentState.loaded = true
          }
          return subagentState
        })
        .catch(() => subagentState)
        .finally(() => { subagentState.loading = false })
    }

    function saveSubagentSettings(force, block, forced, savedNoticeEl) {
      subagentState.forceModel = force === true
      subagentState.blockMainModel = block === true
      subagentState.forcedModel = typeof forced === 'string' && forced.length > 0 && forced !== 'auto' ? forced : null
      const url = ENDPOINT + '?setSubagentSettings=1'
        + '&force=' + (subagentState.forceModel ? 'true' : 'false')
        + '&block=' + (subagentState.blockMainModel ? 'true' : 'false')
        + '&forced=' + encodeURIComponent(subagentState.forcedModel ?? 'auto')
      return fetchJson(url)
        .then((res) => {
          if (res !== null && typeof res === 'object' && res.ok === true) {
            if (savedNoticeEl !== null && savedNoticeEl !== undefined) {
              savedNoticeEl.setAttribute('data-visible', 'true')
              setTimeout(() => {
                try { savedNoticeEl.removeAttribute('data-visible') } catch { /* ignore */ }
              }, 1800)
            }
          }
        })
        .catch(() => {})
    }

    function collectPageModels(container) {
      const list = []
      const seen = new Set()
      const labels = container.querySelectorAll('label')
      for (let i = 0; i < labels.length; i += 1) {
        const label = labels[i]
        const nameNode = label.querySelector('[class*="modelName"]')
        const routeNode = label.querySelector('[class*="route"]')
        const input = label.querySelector('input[type="checkbox"]')
        if (nameNode !== null || routeNode !== null) {
          const name = nameNode?.textContent?.trim() || ''
          const rawRoute = routeNode?.textContent?.trim() || ''
          let providerModel = ''
          if (rawRoute.indexOf('\u00b7') !== -1) {
            providerModel = rawRoute.split('\u00b7')[1]?.trim() || ''
          } else {
            providerModel = rawRoute
          }
          if (providerModel.length === 0) providerModel = name
          if (providerModel.length > 0 && !seen.has(providerModel)) {
            seen.add(providerModel)
            list.push({
              name: name,
              route: providerModel,
              fullLabel: name.length > 0 && name !== providerModel ? (name + ' (' + providerModel + ')') : providerModel,
              checked: input?.checked === true,
            })
          }
        }
      }
      return list
    }

    function findSubagentSection() {
      try {
        const byAttr = document.querySelector('section[aria-labelledby*="-models"]')
        if (byAttr !== null) return byAttr
        const sections = document.querySelectorAll('section')
        for (let i = 0; i < sections.length; i += 1) {
          const s = sections[i]
          const h3 = s.querySelector('h3')
          const text = (h3?.textContent ?? '').toLowerCase()
          if (text.indexOf('model') !== -1 || text.indexOf('mod\u00e8le') !== -1) {
            return s
          }
        }
        const fieldsets = document.querySelectorAll('fieldset')
        for (let j = 0; j < fieldsets.length; j += 1) {
          const f = fieldsets[j]
          const leg = (f.querySelector('legend')?.textContent ?? '').toLowerCase()
          if (leg.indexOf('model') !== -1 || leg.indexOf('mod\u00e8le') !== -1) {
            return f.closest('section') || f.parentElement
          }
        }
      } catch {
        return null
      }
      return null
    }

    function decorateSubagentSection(section) {
      if (section === null || section === undefined) return
      if (section.querySelector('#dsh-mcpc-subagent-card') !== null) return

      ensurePageStyles()
      const permission = section.querySelector('[class*="permission"]')
      const anchor = permission || section.querySelector('h3')
      if (anchor === null) return

      const card = document.createElement('div')
      card.id = 'dsh-mcpc-subagent-card'
      card.className = 'dsh-mcpc-subagent-box'

      // Header
      const head = document.createElement('div')
      head.className = 'dsh-mcpc-subagent-header'

      const title = document.createElement('div')
      title.className = 'dsh-mcpc-subagent-title'
      title.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> <span>Contr\u00f4le du mod\u00e8le des sous-agents (MCP Companion)</span>'

      const badgeWrap = document.createElement('div')
      badgeWrap.style.display = 'flex'
      badgeWrap.style.alignItems = 'center'
      badgeWrap.style.gap = '8px'

      const savedNotice = document.createElement('span')
      savedNotice.className = 'dsh-mcpc-subagent-saved'
      savedNotice.textContent = 'Enregistr\u00e9'

      const badge = document.createElement('span')
      badge.className = 'dsh-mcpc-subagent-badge'
      badge.textContent = 'Actif'

      badgeWrap.appendChild(savedNotice)
      badgeWrap.appendChild(badge)
      head.appendChild(title)
      head.appendChild(badgeWrap)
      card.appendChild(head)

      // Row 1: Force subagents to use selected model
      const rowForce = document.createElement('div')
      rowForce.className = 'dsh-mcpc-subagent-row'

      const textForce = document.createElement('div')
      textForce.className = 'dsh-mcpc-subagent-text'
      const nameForce = document.createElement('div')
      nameForce.className = 'dsh-mcpc-subagent-name'
      nameForce.textContent = 'Forcer les sous-agents \u00e0 utiliser un mod\u00e8le s\u00e9lectionn\u00e9'
      const descForce = document.createElement('div')
      descForce.className = 'dsh-mcpc-subagent-desc'
      descForce.textContent = 'Emp\u00eache les sous-agents de choisir librement ou d\'h\u00e9riter par d\u00e9faut : ils utiliseront obligatoirement le mod\u00e8le choisi ci-dessous.'
      textForce.appendChild(nameForce)
      textForce.appendChild(descForce)

      const selectWrap = document.createElement('div')
      selectWrap.className = 'dsh-mcpc-subagent-select-wrap'
      selectWrap.style.display = subagentState.forceModel ? 'flex' : 'none'

      const selectLabel = document.createElement('span')
      selectLabel.className = 'dsh-mcpc-subagent-select-label'
      selectLabel.textContent = 'Mod\u00e8le impos\u00e9 :'

      const select = document.createElement('select')
      select.className = 'dsh-mcpc-subagent-select'

      function updateSelectOptions() {
        const currentVal = select.value || subagentState.forcedModel || 'auto'
        while (select.firstChild !== null) select.removeChild(select.firstChild)

        const optAuto = document.createElement('option')
        optAuto.value = 'auto'
        optAuto.textContent = 'Premier mod\u00e8le coch\u00e9 ci-dessous (Automatique)'
        select.appendChild(optAuto)

        const models = collectPageModels(section)
        for (const m of models) {
          const opt = document.createElement('option')
          opt.value = m.route
          opt.textContent = (m.checked ? '\u2713 ' : '') + m.fullLabel
          select.appendChild(opt)
        }
        select.value = currentVal
      }

      select.addEventListener('change', () => {
        saveSubagentSettings(subagentState.forceModel, subagentState.blockMainModel, select.value, savedNotice)
      })

      selectWrap.appendChild(selectLabel)
      selectWrap.appendChild(select)

      const switchForce = switchElement(subagentState.forceModel, 'Forcer un mod\u00e8le', (nextVal) => {
        subagentState.forceModel = nextVal
        switchForce.setAttribute('data-on', String(nextVal))
        switchForce.setAttribute('aria-checked', String(nextVal))
        selectWrap.style.display = nextVal ? 'flex' : 'none'
        saveSubagentSettings(nextVal, subagentState.blockMainModel, select.value, savedNotice)
      })

      rowForce.appendChild(textForce)
      rowForce.appendChild(switchForce)
      card.appendChild(rowForce)
      card.appendChild(selectWrap)

      // Row 2: Block main agent model
      const rowBlock = document.createElement('div')
      rowBlock.className = 'dsh-mcpc-subagent-row'

      const textBlock = document.createElement('div')
      textBlock.className = 'dsh-mcpc-subagent-text'
      const nameBlock = document.createElement('div')
      nameBlock.className = 'dsh-mcpc-subagent-name'
      nameBlock.textContent = 'Bloquer l\'utilisation du m\u00eame mod\u00e8le que l\'agent principal'
      const descBlock = document.createElement('div')
      descBlock.className = 'dsh-mcpc-subagent-desc'
      descBlock.textContent = 'Interdit strictement aux sous-agents d\'utiliser le m\u00eame mod\u00e8le que l\'agent principal (Lead). Si demand\u00e9, un mod\u00e8le alternatif autoris\u00e9 sera utilis\u00e9.'
      textBlock.appendChild(nameBlock)
      textBlock.appendChild(descBlock)

      const switchBlock = switchElement(subagentState.blockMainModel, 'Bloquer le mod\u00e8le principal', (nextVal) => {
        subagentState.blockMainModel = nextVal
        switchBlock.setAttribute('data-on', String(nextVal))
        switchBlock.setAttribute('aria-checked', String(nextVal))
        saveSubagentSettings(subagentState.forceModel, nextVal, select.value, savedNotice)
      })

      rowBlock.appendChild(textBlock)
      rowBlock.appendChild(switchBlock)
      card.appendChild(rowBlock)

      // Insert into DOM after anchor
      if (anchor.nextSibling !== null) {
        anchor.parentNode.insertBefore(card, anchor.nextSibling)
      } else {
        anchor.parentNode.appendChild(card)
      }

      // Initial load of backend state and populate select
      fetchSubagentSettings().then(() => {
        switchForce.setAttribute('data-on', String(subagentState.forceModel))
        switchForce.setAttribute('aria-checked', String(subagentState.forceModel))
        selectWrap.style.display = subagentState.forceModel ? 'flex' : 'none'
        switchBlock.setAttribute('data-on', String(subagentState.blockMainModel))
        switchBlock.setAttribute('aria-checked', String(subagentState.blockMainModel))
        updateSelectOptions()
        if (subagentState.forcedModel !== null && subagentState.forcedModel.length > 0) {
          select.value = subagentState.forcedModel
        }
      })

      // When checkboxes change in the models fieldset, update select options
      section.addEventListener('change', (e) => {
        if (e.target !== null && e.target.type === 'checkbox') {
          setTimeout(updateSelectOptions, 60)
        }
      })
    }

    function installSubagentPageDecorator() {
      try {
        const section = findSubagentSection()
        if (section !== null) decorateSubagentSection(section)
      } catch {
        // Must never break the UI
      }
    }

    return {
      inject: ['remote'],
      apply(ctx) {
        // Nothing here may take the page down: every step is guarded, and a
        // failure simply leaves the chip or the panel decoration absent.
        report('apply', 'v=' + CLIENT_VERSION)
        try {
          refresh(true)
        } catch {
          // The route is unavailable; the chip will report it when opened.
        }
        try {
          installChip(ctx)
        } catch (error) {
          report('chip-slot-error', String(error?.message ?? error))
        }
        try {
          installPresetSeatStats()
        } catch (error) {
          report('preset-stats-error', String(error?.message ?? error))
        }
        try {
          installAgentColors()
        } catch (error) {
          report('agent-colors-error', String(error?.message ?? error))
        }
        try {
          installAgentManagerButton()
        } catch (error) {
          report('agent-manager-error', String(error?.message ?? error))
        }
        try {
          installDraftAttachmentKeeper(ctx)
        } catch (error) {
          report('draft-keep-error', String(error?.message ?? error))
        }
        try {
          installMcpTokenBadges()
        } catch (error) {
          report('mcp-token-error', String(error?.message ?? error))
        }
        try {
          installPageTabs()
          installSubagentPageDecorator()
        } catch (error) {
          report('page-tabs-error', String(error?.message ?? error))
        }
        // The panel page exists only while its sidebar row is open, so the
        // decoration is re-checked often: the pass is one query when the page
        // is closed and idle work when it is open.
        const pageTimer = setInterval(() => {
          try {
            installPageTabs()
            installSubagentPageDecorator()
          } catch { /* one failed pass must not stop the decorator */ }
        }, 300)
        if (typeof pageTimer?.unref === 'function') pageTimer.unref()
        try {
          ctx.effect(() => () => clearInterval(pageTimer), 'dsh-mcp-companion: page tabs')
        } catch {
          // No effect scope: the interval stays for the life of the page.
        }
        // The namespace appears when the owning panel mounts it; a light poll
        // picks it up without depending on plugin activation order.
        const timer = setInterval(() => {
          try {
            install(ctx)
            refresh(false)
          } catch {
            // A single failed pass must not stop the decorator.
          }
        }, 1000)
        if (typeof timer?.unref === 'function') timer.unref()
        try {
          ctx.effect(() => () => clearInterval(timer), 'dsh-mcp-companion: panel decorator')
        } catch {
          // No effect scope: the interval stays for the life of the page.
        }
      },
    }
  },
})
