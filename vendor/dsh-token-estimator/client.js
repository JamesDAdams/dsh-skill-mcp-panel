window.__ModuleLoader__.load({
  id: '@local/token-estimator',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const ENDPOINT = '/local-token-estimator/estimate'

    const T = {
      text: 'var(--dsw-alias-label-primary)',
      muted: 'var(--dsw-alias-label-secondary)',
      faint: 'var(--dsw-alias-label-tertiary)',
      border: 'var(--dsw-alias-border-l1)',
      layer2: 'var(--dsw-alias-bg-layer-2)',
      accent: 'var(--dsw-alias-brand-primary)',
      danger: 'var(--dsw-alias-state-error-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
    }

    /** 950 -> "950", 1735 -> "1.7K", 23827 -> "23.9K", 1048576 -> "1M". */
    function compact(value) {
      const n = Math.round(Number(value) || 0)
      if (n < 1000) return String(n)
      if (n < 1000000) {
        const k = n / 1000
        const text = k < 100 ? k.toFixed(1) : String(Math.round(k))
        return text.replace(/\.0$/, '') + 'K'
      }
      const m = n / 1000000
      return m.toFixed(m < 10 ? 2 : 1).replace(/\.?0+$/, '') + 'M'
    }

    /** The composer's Lexical root, or any contenteditable fallback. */
    function readDraft() {
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

    /**
     * One colour per bucket, readable on both the dark and light menu surface.
     * These are categorical data colours, not theme chrome, so they stay literal:
     * the theme tokens only offer a single accent plus state colours.
     */
    const SERIES = {
      system: '#a78bfa',
      skills: '#fbbf24',
      tools: '#60a5fa',
      mcp: '#f87171',
      messages: '#34d399',
    }

    function rowColor(id) {
      return SERIES[id] || T.accent
    }

    function Bar(props) {
      const ratio = props.total > 0 ? Math.min(1, props.tokens / props.total) : 0
      return h('div', {
        style: { height: 6, borderRadius: 999, width: '100%', backgroundColor: T.layer2, overflow: 'hidden' },
      }, h('div', {
        style: {
          height: '100%', width: (ratio * 100).toFixed(2) + '%',
          backgroundColor: props.color, borderRadius: 999, transition: 'width 160ms ease',
        },
      }))
    }

    function Row(props) {
      return h('div', {
        style: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12, color: T.text },
      },
      props.tag !== undefined
        ? h('span', {
            style: {
              flex: '0 0 auto', fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
              padding: '1px 5px', borderRadius: 4, color: T.faint, border: '1px solid ' + T.border,
            },
          }, props.tag)
        : null,
      h('span', {
        style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        title: props.name,
      }, props.name),
      h('span', {
        style: { flex: '0 0 auto', color: T.muted, fontVariantNumeric: 'tabular-nums' },
      }, compact(props.tokens)))
    }

    /** Skills and MCP have their own rows now, so no item needs a tag. */
    function itemsFor(group) {
      const items = Array.isArray(group.items) ? group.items : []
      return items
    }

    function GroupBlock(props) {
      const { group, data, total, expanded, onToggle } = props
      const items = itemsFor(group, data)
      const share = total > 0 ? (group.tokens / total) * 100 : 0
      return h('div', { style: { padding: '8px 0', borderTop: '1px solid ' + T.border } },
        h('div', {
          onClick: items.length > 0 ? onToggle : undefined,
          style: {
            display: 'flex', alignItems: 'baseline', gap: 8,
            cursor: items.length > 0 ? 'pointer' : 'default',
            fontSize: 13, color: T.text, fontWeight: 500,
          },
        },
        h('span', { style: { flex: 1 } }, group.label),
        h('span', { style: { color: T.muted, fontSize: 11, fontVariantNumeric: 'tabular-nums' } },
          share.toFixed(1) + '%'),
        h('span', { style: { fontVariantNumeric: 'tabular-nums', minWidth: 52, textAlign: 'right' } },
          '~' + compact(group.tokens)),
        h('span', { style: { color: T.muted, fontSize: 10, width: 10, textAlign: 'center' } },
          items.length > 0 ? (expanded ? '▾' : '▸') : ''),
        ),
        h('div', { style: { marginTop: 6 } }, h(Bar, { tokens: group.tokens, total, color: rowColor(group.id) })),
        expanded && items.length > 0
          ? h('div', { style: { marginTop: 6, maxHeight: 230, overflowY: 'auto' } },
              items.map((item, index) => h(Row, {
                key: item.name + ':' + index,
                name: item.name,
                tokens: item.tokens,
                tag: item.tag,
              })))
          : null)
    }

    function Panel(props) {
      const data = props.data
      const [expanded, setExpanded] = useState({})
      const all = data !== null && Array.isArray(data.groups) ? data.groups : []
      // Skills and MCP keep their own rows, but only while they carry something.
      const groups = all.filter((group) => (
        group.id !== 'mcp' && group.id !== 'skills'
      ) || group.tokens > 0 || (group.items || []).length > 0)
      const total = data !== null && typeof data.total === 'number' ? data.total : 0
      const capacity = data !== null && typeof data.capacity === 'number' ? data.capacity : undefined
      const native = data !== null && data.source === 'native'
      const failed = data !== null && data.ok === false

      return h('div', {
        role: 'dialog',
        'aria-label': 'Token breakdown',
        style: {
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 340, maxHeight: '64vh', overflowY: 'auto',
          backgroundColor: 'var(--dsw-specific-menu)',
          backdropFilter: 'var(--dsw-menu-backdrop-filter)',
          WebkitBackdropFilter: 'var(--dsw-menu-backdrop-filter)',
          color: T.text,
          border: '0.5px solid ' + T.border, borderRadius: 'var(--dsw-radius-lg, 12px)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
          padding: '12px 14px', zIndex: 60, textAlign: 'left',
        },
      },
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, paddingBottom: 4 } },
        h('div', { style: { fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.faint, flex: 1 } },
          'First request'),
        data === null
          ? h('span', { style: { fontSize: 12, color: T.muted } }, 'measuring…')
          : h('span', { style: { fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } },
              [
                '~' + compact(total),
                capacity !== undefined
                  ? h('span', { key: 'cap', style: { fontSize: 13, fontWeight: 400, color: T.muted } },
                      ' / ' + compact(capacity))
                  : null,
              ])),
      data !== null && !failed
        ? h('div', { style: { fontSize: 11, color: T.faint, paddingBottom: 2 } },
            [
              data.model ? data.model : null,
              native ? 'mesuré' : 'assemblé',
            ].filter(Boolean).join(' · '))
        : null,
      failed
        ? h('div', { style: { fontSize: 11, color: T.danger, paddingBottom: 4 } },
            'Host: ' + String(data.error || 'unknown'))
        : null,
      h('div', {
        style: {
          display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden',
          marginTop: 4, backgroundColor: T.layer2,
        },
      }, groups.filter((group) => group.tokens > 0).map((group) =>
        h('div', {
          key: group.id,
          title: group.label + ': ' + String(group.tokens) + ' tokens',
          style: {
            width: (total > 0 ? (group.tokens / total) * 100 : 0).toFixed(2) + '%',
            backgroundColor: rowColor(group.id),
            height: '100%',
          },
        }))),
      groups.map((group) => h(GroupBlock, {
        key: group.id,
        group,
        data,
        total,
        expanded: expanded[group.id] === true,
        onToggle: () => setExpanded((current) => ({ ...current, [group.id]: current[group.id] !== true })),
      })),
      h('div', {
        style: {
          display: 'flex', alignItems: 'baseline', gap: 8,
          borderTop: '1px solid ' + T.border, marginTop: 4, paddingTop: 8,
          fontSize: 13, fontWeight: 600,
        },
      },
      h('span', { style: { flex: 1 } }, 'Total'),
      h('span', { style: { fontVariantNumeric: 'tabular-nums' } }, '~' + compact(total))),
      h('div', { style: { fontSize: 10, color: T.faint, paddingTop: 6, lineHeight: 1.45 } },
        native
          ? 'Totaux issus des projections contextPressure / contextBreakdown — identiques au compteur de contexte natif. Skills et MCP sont répartis dans les totaux « system » et « tools » du harness selon le poids réel de leurs entrées.'
          : 'Estimation à 4 caractères par token : aucun appel modèle n’a encore été mesuré pour cette conversation.'),
      // PTC mode only: the catalogue is prompt text, not a tool row.
      data !== null && data.details?.toolSections?.active === true
        ? h('div', { style: { fontSize: 10, color: T.faint, paddingTop: 4, lineHeight: 1.45 } },
            'Mode PTC : le catalogue d’outils part dans le message système (section tools:sdk), compté dans System prompt ; le canal tools ne porte que run_code. Ces lignes suivent le compteur de contexte natif.')
        : null)
    }

    /** Nothing this plugin renders may take the surrounding conversation down. */
    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }

      static getDerivedStateFromError() {
        return { failed: true }
      }

      componentDidCatch() {
        /* stay silent: the composer must keep working */
      }

      render() {
        if (this.state.failed) return null
        return this.props.children
      }
    }

    function TokenEstimator(props) {
      const [open, setOpen] = useState(false)
      const [data, setData] = useState(null)
      const wrapRef = useRef(null)
      const draftRef = useRef('')
      const requestRef = useRef(0)
      const timerRef = useRef(0)
      const digestRef = useRef('')

      const session = typeof props?.sessionId === 'string' ? props.sessionId : undefined

      const fetchEstimate = useCallback((text) => {
        const id = ++requestRef.current
        // No Session id on this seat means a brand-new conversation: ask for the
        // assembled estimate rather than another conversation's measurements.
        const scope = session === undefined ? '&fresh=1' : '&session=' + encodeURIComponent(session)
        fetch(ENDPOINT + '?text=' + encodeURIComponent(text) + scope, { credentials: 'same-origin' })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status))))
          .then((payload) => {
            if (id !== requestRef.current) return
            // Identical payload -> no state write -> no re-render. The MCP chip
            // that shares this slot re-aligns itself on DOM mutations, so churn
            // here is what pushed it over the mode selector.
            const digest = JSON.stringify(payload)
            if (digest === digestRef.current) return
            digestRef.current = digest
            setData(payload)
          })
          .catch((error) => {
            if (id !== requestRef.current) return
            const digest = 'error:' + String(error?.message ?? error)
            if (digest === digestRef.current) return
            digestRef.current = digest
            setData({ ok: false, error: String(error?.message ?? error), groups: [], total: 0 })
          })
      }, [session])

      useEffect(() => {
        const tick = () => {
          if (typeof document !== 'undefined' && document.hidden === true) return
          const text = readDraft()
          if (text === draftRef.current) return
          draftRef.current = text
          if (timerRef.current !== 0) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => fetchEstimate(text), 900)
        }
        tick()
        timerRef.current = setTimeout(() => fetchEstimate(''), 80)
        const interval = setInterval(tick, 800)
        // Heartbeat: an MCP switch or a new measurement must reach the label
        // without a page reload. The digest guard means an unchanged payload
        // causes no re-render at all.
        const heartbeat = setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden === true) return
          fetchEstimate(draftRef.current)
        }, 2000)
        // A toggle is a click on the MCP chip/menu of dsh-mcp-companion: refetch
        // right after it, twice, to cover the state write and its HMR apply.
        const onDocumentDown = (event) => {
          const target = event?.target
          const inside = target !== null && target !== undefined && typeof target.closest === 'function'
            ? target.closest('.dsh-mcp-chip, .dsh-mcp-menu')
            : null
          if (inside === null) return
          setTimeout(() => fetchEstimate(draftRef.current), 400)
          setTimeout(() => fetchEstimate(draftRef.current), 1400)
        }
        const onFocus = () => fetchEstimate(draftRef.current)
        document.addEventListener('mousedown', onDocumentDown, true)
        window.addEventListener('focus', onFocus)
        return () => {
          clearInterval(interval)
          clearInterval(heartbeat)
          document.removeEventListener('mousedown', onDocumentDown, true)
          window.removeEventListener('focus', onFocus)
          if (timerRef.current !== 0) clearTimeout(timerRef.current)
        }
      }, [fetchEstimate])

      useEffect(() => {
        if (!open) return undefined
        fetchEstimate(draftRef.current)
        // Keep the panel current while it is open: a Host restart or a new
        // measurement must not leave stale numbers on screen.
        const refresh = setInterval(() => fetchEstimate(draftRef.current), 5000)
        const onDown = (event) => {
          if (wrapRef.current !== null && !wrapRef.current.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          clearInterval(refresh)
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open, fetchEstimate])

      const total = data !== null && typeof data.total === 'number' ? data.total : 0
      const failed = data !== null && data.ok === false
      const label = data === null ? '…' : failed ? 'n/a' : compact(total)

      return h('div', { ref: wrapRef, style: { position: 'relative', display: 'inline-flex' } },
        h('button', {
          type: 'button',
          onClick: () => setOpen((value) => !value),
          'aria-expanded': open,
          'aria-label': 'Token estimate for the first message',
          title: 'Estimated tokens the next request will send',
          style: {
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 24, padding: '0 8px', borderRadius: 999,
            border: '1px solid ' + T.border,
            backgroundColor: open ? T.layer2 : 'transparent',
            color: failed ? T.danger : T.muted,
            fontSize: 11, fontWeight: 500, cursor: 'pointer',
            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
          },
        },
        h('svg', {
          viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': true,
          style: { display: 'block', flex: '0 0 auto' },
        },
        h('circle', { cx: 8, cy: 8, r: 6, fill: 'none', stroke: T.accent, strokeWidth: 1.6 }),
        h('path', { d: 'M8 4.6v6.8', stroke: T.accent, strokeWidth: 1.6, strokeLinecap: 'round' }),
        h('path', { d: 'M4.6 8h6.8', stroke: T.accent, strokeWidth: 1.6, strokeLinecap: 'round' })),
        h('span', { style: { minWidth: 46, textAlign: 'right', display: 'inline-block' } }, label + ' tok')),
        open ? h(Panel, { data }) : null)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
          name: 'conversation.hero.options',
          id: 'token-estimator',
          // Registered after the MCP chip (order 100): the chip paints itself
          // leftwards by its own width, so it must keep the leading position in
          // this group or it lands on top of the mode selector.
          order: 100,
          label: 'Token estimate',
        }, function TokenEstimatorEntry(props) {
          return h(Boundary, null, h(TokenEstimator, props))
        }))
      },
    }
  },
})
