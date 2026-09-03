// dsh-everything-search —— Client 半端（静态 web 插件形态，ModuleLoader bundle）
// 经 /plugins/dsh-everything-search/client.js 加载。RPC 通过 fetch POST /evs/api/<name>。
window.__ModuleLoader__.load({
  id: 'dsh-everything-search',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    var React = require('react')

    async function apiCall(name, args) {
      const res = await fetch('/evs/api/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {}),
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return await res.json()
    }

    function insertStyles(css) {
      try {
        const style = document.createElement('style')
        style.textContent = css
        document.head.appendChild(style)
        return () => { try { style.remove() } catch (e) { /* ignore */ } }
      } catch (e) { return () => {} }
    }

    // ---- 共享状态（按钮、覆盖层、设置页协调） ----
    var searchOpen = false
    var listeners = new Set()
    var commitHandler = null
    function notifier() { listeners.forEach(function (fn) { fn() }) }
    function openSearch() { if (!searchOpen) { searchOpen = true; notifier() } }
    function closeSearch() { if (searchOpen) { searchOpen = false; notifier() } }
    function setCommitHandler(fn) { commitHandler = fn }
    function commit(paths) { if (commitHandler) commitHandler(paths) }

    // ---- 插件设置（localStorage 落盘） ----
    var settings = { limit: 50, kind: 'all', path: '', prefer: true }
    var settingsListeners = new Set()
    function getSettings() { return settings }
    function updateSettings(patch) {
      settings = Object.assign({}, settings, patch)
      settingsListeners.forEach(function (fn) { fn() })
    }
    function subscribeSettings(fn) { settingsListeners.add(fn); return function () { settingsListeners.delete(fn) } }
    function loadStorage() {
      try {
        if (typeof localStorage === 'undefined') return null
        const raw = localStorage.getItem('evsr-settings')
        if (!raw) return null
        const p = JSON.parse(raw)
        return {
          limit: Number(p.limit) > 0 ? Math.min(Number(p.limit), 200) : 50,
          kind: (p.kind === 'folder' || p.kind === 'file' || p.kind === 'all') ? p.kind : 'all',
          path: (typeof p.path === 'string' && p.path.trim()) ? p.path : '',
          prefer: p.prefer !== false,
        }
      } catch (e) { return null }
    }
    function saveStorage() {
      try {
        if (typeof localStorage === 'undefined') return
        localStorage.setItem('evsr-settings', JSON.stringify({ limit: settings.limit, kind: settings.kind, path: settings.path, prefer: settings.prefer }))
      } catch (e) { /* ignore */ }
    }
    function reloadSettings() { const p = loadStorage(); if (p) updateSettings(p) }
    function saveSettings(patch) { updateSettings(patch); saveStorage() }

    // 优先开关：保存到本地 + 同步到 Host（Host 据此加/移除系统提示）
    function setPrefer(v) {
      saveSettings({ prefer: Boolean(v) })
      try { apiCall('set-preference', { prefer: Boolean(v) }) } catch (e) { /* ignore */ }
    }

    // 拉取插件默认 es.exe 路径（打包在插件 lib 里的），作为路径默认值
    apiCall('default-path').then(function (p) {
      if (typeof p === 'string' && p.trim()) { if (!getSettings().path) saveSettings({ path: p }) }
    }, function () { /* ignore */ })

    // 加载本地设置并同步"优先开关"到 Host（Host 据此加/移除系统提示）
    reloadSettings()
    try { apiCall('set-preference', { prefer: getSettings().prefer }) } catch (e) { /* ignore */ }

    function toMention(path) {
      const p = String(path || '').replace(/\\/g, '/')
      if (/[\u0000-\u001f\u007f-\u009f"]/.test(p)) return null
      if (/\s/.test(p)) return '@"' + p + '"'
      return '@' + p
    }

    var inject = []

    function apply(ctx) {
      insertStyles(
        '.evs-trigger { display: inline-flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; padding: 5px 7px; border-radius: 8px; color: var(--dsw-alias-label-primary); }\n' +
        '.evs-trigger:hover { background: var(--dsw-alias-bg-layer-2); }\n' +
        '.evs-trigger svg { display: block; }\n' +
        '.evs-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 9999; pointer-events: auto; }\n' +
        '.evs-modal { position: fixed; bottom: 0; max-height: 88vh; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l1); border-bottom: none; border-radius: 14px 14px 0 0; box-shadow: 0 -12px 40px rgba(0,0,0,.45); display: flex; flex-direction: column; overflow: hidden; }\n' +
        '.evs-titlebar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--dsw-alias-border-l1); }\n' +
        '.evs-tb-title { font-size: 14px; font-weight: 600; }\n' +
        '.evs-tb-close { background: transparent; border: none; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 12px; padding: 4px 8px; border-radius: 6px; }\n' +
        '.evs-tb-close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }\n' +
        '.evs-body { padding: 12px 16px 0; display: flex; flex-direction: column; gap: 12px; flex: 1; overflow: hidden; }\n' +
        '.evs-desc { font-size: 13px; color: var(--dsw-alias-label-secondary); }\n' +
        '.evs-search-row { display: flex; gap: 8px; align-items: center; }\n' +
        '.evs-input { flex: 1; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit; }\n' +
        '.evs-input:focus { outline: 2px solid var(--dsw-alias-brand-primary); }\n' +
        '.evs-filter-row { display: flex; align-items: center; gap: 10px; }\n' +
        '.evs-scope-row { display: flex; align-items: center; gap: 10px; }\n' +
        '.evs-filter-label { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }\n' +
        '.evs-seg { display: flex; gap: 4px; background: var(--dsw-alias-bg-layer-2); padding: 3px; border-radius: 8px; }\n' +
        '.evs-seg-btn { padding: 4px 14px; border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; border-radius: 6px; font-size: 12px; }\n' +
        '.evs-seg-btn.active { background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); box-shadow: 0 1px 3px rgba(0,0,0,.25); }\n' +
        '.evs-results { flex: 1; overflow: auto; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; }\n' +
        '.evs-results-head { display: flex; justify-content: space-between; padding: 6px 10px; font-size: 12px; color: var(--dsw-alias-label-secondary); border-bottom: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }\n' +
        '.evs-row { display: flex; gap: 8px; align-items: center; padding: 6px 10px; cursor: pointer; font-family: monospace; font-size: 12px; }\n' +
        '.evs-row:hover { background: var(--dsw-alias-bg-layer-2); }\n' +
        '.evs-row.checked { background: var(--dsw-alias-bg-layer-2); }\n' +
        '.evs-row input { flex-shrink: 0; }\n' +
        '.evs-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n' +
        '.evs-empty { padding: 16px 10px; color: var(--dsw-alias-label-secondary); font-size: 12px; text-align: center; }\n' +
        '.evs-foot { display: flex; gap: 8px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--dsw-alias-border-l1); }\n' +
        '.evs-count { margin-right: auto; font-size: 12px; color: var(--dsw-alias-label-secondary); }\n' +
        '.evs-btn { padding: 7px 14px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); cursor: pointer; white-space: nowrap; font-size: 13px; }\n' +
        '.evs-btn:hover { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }\n' +
        '.evs-btn:disabled { opacity: .5; cursor: default; }\n' +
        '.evs-btn.primary { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); border-color: transparent; }\n' +
        '.evs-btn.primary:hover { opacity: .9; }\n' +
        '.evs-err { padding: 6px 10px; color: var(--dsw-alias-state-error-primary); font-size: 12px; }\n' +
        '.evs-set { padding: 10px 4px 24px; display: flex; flex-direction: column; gap: 0; max-width: 620px; }\n' +
        '.evs-set-intro { font-size: 13px; color: var(--dsw-alias-label-secondary); opacity: .8; padding-bottom: 16px; }\n' +
        '.evs-set-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }\n' +
        '.evs-set-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }\n' +
        '.evs-set-label { font-size: 14px; color: var(--dsw-alias-label-primary); font-weight: 500; }\n' +
        '.evs-set-desc { font-size: 12px; color: var(--dsw-alias-label-secondary); opacity: .8; }\n' +
        '.evs-set-ctl { padding: 7px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit; }\n' +
        '.evs-set-input { flex: 1; min-width: 0; padding: 7px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-family: monospace; font-size: 12px; margin-left: 12px; }\n'
      )

      const slots = ctx.get('slots')
      if (slots === undefined) return

      function measureComposer() {
        try {
          if (typeof document === 'undefined') return null
          const el = document.querySelector('textarea')
          if (!el) return null
          const rect = el.getBoundingClientRect()
          if (!rect.width) return null
          return { left: rect.left, width: rect.width }
        } catch (e) { return null }
      }

      function SearchOverlay() {
        const [open, setOpen] = React.useState(searchOpen)
        const [query, setQuery] = React.useState('')
        const [kind, setKind] = React.useState(getSettings().kind)
        const [scope, setScope] = React.useState('')
        const [busy, setBusy] = React.useState(false)
        const [results, setResults] = React.useState([])
        const [selected, setSelected] = React.useState([])
        const [err, setErr] = React.useState('')
        const [geom, setGeom] = React.useState(null)

        React.useEffect(function () {
          const fn = function () { setOpen(searchOpen) }
          listeners.add(fn)
          return function () { listeners.delete(fn) }
        }, [])

        React.useEffect(function () {
          if (!open) return
          reloadSettings()
          setKind(getSettings().kind)
          function measure() { setGeom(measureComposer()) }
          measure()
          let onResize = null
          if (typeof window !== 'undefined') {
            onResize = function () { measure() }
            window.addEventListener('resize', onResize)
          }
          return function () { if (onResize) window.removeEventListener('resize', onResize) }
        }, [open])

        if (!open) return null

        async function runSearch(q, k) {
          const qq = (q !== undefined ? q : String(query || '')).trim()
          const kk = k !== undefined ? k : kind
          if (!qq) { setResults([]); setErr(''); return }
          setBusy(true); setErr('')
          try {
            const a = { query: qq, limit: getSettings().limit, foldersOnly: kk === 'folder', filesOnly: kk === 'file' }
            const pth = getSettings().path
            if (pth) a.path = pth
            const sc = String(scope || '').trim()
            if (sc) a.scope = sc
            const r = await apiCall('search', a)
            if (r && r.ok) { setResults(r.results || []) } else { setResults([]); setErr(r && r.error ? r.error : '搜索失败') }
          } catch (e) {
            setResults([]); setErr(String(e && e.message ? e.message : e))
          }
          setBusy(false)
        }

        function chooseKind(k) {
          setKind(k)
          const q = String(query || '').trim()
          if (q) runSearch(q, k)
        }

        function toggle(p) {
          setSelected(function (prev) {
            return prev.indexOf(p) >= 0 ? prev.filter(function (x) { return x !== p }) : prev.concat([p])
          })
        }
        function toggleAll() {
          setSelected(function (prev) {
            if (prev.length === results.length) return []
            return results.slice()
          })
        }
        function addToContext() {
          if (selected.length === 0) return
          commit(selected)
          closeSearch()
        }

        const rows = results.map(function (p, i) {
          const checked = selected.indexOf(p) >= 0
          return React.createElement('label', { className: checked ? 'evs-row checked' : 'evs-row', key: i },
            React.createElement('input', { type: 'checkbox', checked: checked, onChange: function () { toggle(p) } }),
            React.createElement('span', { className: 'evs-path' }, p),
          )
        })

        const modalStyle = geom
          ? { left: geom.left, width: geom.width }
          : { left: '50%', transform: 'translateX(-50%)', maxWidth: '920px' }

        const segs = [
          { key: 'all', label: '全部' },
          { key: 'folder', label: '文件夹' },
          { key: 'file', label: '文件' },
        ]

        return React.createElement('div', { className: 'evs-backdrop', onClick: closeSearch },
          React.createElement('div', { className: 'evs-modal', style: modalStyle, onClick: function (e) { e.stopPropagation() } },
            React.createElement('div', { className: 'evs-titlebar' },
              React.createElement('span', { className: 'evs-tb-title' }, 'Everything 全盘搜索'),
              React.createElement('button', { className: 'evs-tb-close', onClick: closeSearch }, '✕ 关闭'),
            ),
            React.createElement('div', { className: 'evs-body' },
              React.createElement('div', { className: 'evs-desc' }, '在全盘快速搜索文件 / 文件夹，勾选后可加入对话上下文'),
              React.createElement('div', { className: 'evs-search-row' },
                React.createElement('input', {
                  className: 'evs-input',
                  placeholder: '输入关键词，回车搜索（支持 *.pdf、ext:ini 等语法）',
                  value: query,
                  onChange: function (e) { setQuery(e.target.value) },
                  onKeyDown: function (e) { if (e.key === 'Enter') runSearch() },
                }),
                React.createElement('button', { className: 'evs-btn', onClick: function () { runSearch() }, disabled: busy }, busy ? '…' : '搜索'),
              ),
              React.createElement('div', { className: 'evs-filter-row' },
                React.createElement('span', { className: 'evs-filter-label' }, '类型'),
                React.createElement('div', { className: 'evs-seg' },
                  segs.map(function (s) {
                    return React.createElement('button', {
                      key: s.key,
                      className: kind === s.key ? 'evs-seg-btn active' : 'evs-seg-btn',
                      onClick: function () { chooseKind(s.key) },
                    }, s.label)
                  }),
                ),
              ),
              React.createElement('div', { className: 'evs-scope-row' },
                React.createElement('span', { className: 'evs-filter-label' }, '范围'),
                React.createElement('input', {
                  className: 'evs-input',
                  placeholder: '可选：限定文件夹，如 C:/Project（留空搜全盘）',
                  value: scope,
                  onChange: function (e) { setScope(e.target.value) },
                  onKeyDown: function (e) { if (e.key === 'Enter') runSearch() },
                }),
              ),
              err ? React.createElement('div', { className: 'evs-err' }, err) : null,
              React.createElement('div', { className: 'evs-results' },
                React.createElement('div', { className: 'evs-results-head' },
                  React.createElement('span', null, '结果'),
                  React.createElement('span', null, String(results.length) + ' 条'),
                ),
                rows.length > 0 ? rows : React.createElement('div', { className: 'evs-empty' }, '无匹配结果'),
              ),
            ),
            React.createElement('div', { className: 'evs-foot' },
              React.createElement('span', { className: 'evs-count' }, '已选 ' + selected.length),
              React.createElement('button', { className: 'evs-btn', onClick: toggleAll }, '全选/清空'),
              React.createElement('button', { className: 'evs-btn primary', onClick: addToContext, disabled: selected.length === 0 }, '加入上下文'),
            ),
          ),
        )
      }

      function SettingsPage() {
        const [s, setS] = React.useState(getSettings())
        const [pathEdit, setPathEdit] = React.useState(getSettings().path)
        React.useEffect(function () {
          reloadSettings()
          return subscribeSettings(function () { setS(getSettings()); setPathEdit(getSettings().path) })
        }, [])
        function commitPath() {
          const p = String(pathEdit || '').trim()
          if (p) { saveSettings({ path: p }) } else { setPathEdit(getSettings().path) }
        }
        const segs = [
          { key: 'all', label: '全部' },
          { key: 'folder', label: '文件夹' },
          { key: 'file', label: '文件' },
        ]
        return React.createElement('div', { className: 'evs-set' },
          React.createElement('div', { className: 'evs-set-intro' }, 'Everything 全盘搜索插件配置'),
          React.createElement('div', { className: 'evs-set-row' },
            React.createElement('div', { className: 'evs-set-info' },
              React.createElement('div', { className: 'evs-set-label' }, '默认结果数量'),
              React.createElement('div', { className: 'evs-set-desc' }, '搜索面板每次最多返回的条数'),
            ),
            React.createElement('select', {
              className: 'evs-set-ctl',
              value: String(s.limit),
              onChange: function (e) { saveSettings({ limit: Number(e.target.value) }) },
            },
              [20, 50, 100, 200].map(function (v) {
                return React.createElement('option', { key: v, value: String(v) }, String(v) + ' 条')
              }),
            ),
          ),
          React.createElement('div', { className: 'evs-set-row' },
            React.createElement('div', { className: 'evs-set-info' },
              React.createElement('div', { className: 'evs-set-label' }, '默认类型'),
              React.createElement('div', { className: 'evs-set-desc' }, '打开面板时默认筛选的类型'),
            ),
            React.createElement('div', { className: 'evs-seg' },
              segs.map(function (seg) {
                return React.createElement('button', {
                  key: seg.key,
                  className: s.kind === seg.key ? 'evs-seg-btn active' : 'evs-seg-btn',
                  onClick: function () { saveSettings({ kind: seg.key }) },
                }, seg.label)
              }),
            ),
          ),
          React.createElement('div', { className: 'evs-set-row' },
            React.createElement('div', { className: 'evs-set-info' },
              React.createElement('div', { className: 'evs-set-label' }, '默认用 Everything 优先搜索'),
              React.createElement('div', { className: 'evs-set-desc' }, '开启后 AI 找文件时优先用全盘索引搜索（推荐）'),
            ),
            React.createElement('div', { className: 'evs-seg' },
              React.createElement('button', {
                className: s.prefer ? 'evs-seg-btn active' : 'evs-seg-btn',
                onClick: function () { setPrefer(true) },
              }, '开启'),
              React.createElement('button', {
                className: !s.prefer ? 'evs-seg-btn active' : 'evs-seg-btn',
                onClick: function () { setPrefer(false) },
              }, '关闭'),
            ),
          ),
          React.createElement('div', { className: 'evs-set-row' },
            React.createElement('div', { className: 'evs-set-info' },
              React.createElement('div', { className: 'evs-set-label' }, '搜索引擎路径'),
              React.createElement('div', { className: 'evs-set-desc' }, 'Everything 官方命令行工具（随插件打包，可修改）'),
            ),
            React.createElement('input', {
              className: 'evs-set-input',
              type: 'text',
              value: pathEdit,
              onChange: function (e) { setPathEdit(e.target.value) },
              onBlur: commitPath,
              onKeyDown: function (e) { if (e.key === 'Enter') commitPath() },
              placeholder: getSettings().path || 'es.exe 路径',
            }),
          ),
        )
      }

      function SearchButton(props) {
        React.useEffect(function () {
          if (!props.inputActions) return
          setCommitHandler(function (paths) {
            const mentions = paths.map(toMention).filter(Boolean)
            if (mentions.length === 0) return
            const current = (props.input && props.input.draft) || ''
            const next = current.trim() ? current.trim() + ' ' + mentions.join(' ') : mentions.join(' ')
            props.inputActions.setDraft(next)
          })
        }, [props.inputActions, props.input])
        return React.createElement('button', { className: 'evs-trigger', onClick: openSearch, title: 'Everything 全盘搜索并加入上下文', 'aria-label': 'Everything 全盘搜索' },
          React.createElement('svg', { viewBox: '0 0 1024 1024', width: '18', height: '18', fill: 'currentColor', style: { display: 'block' } },
            React.createElement('path', { d: 'M975.648 975.648c-36 36-94.336 36-130.336 0L682.656 812.992c-66.88 42.88-145.952 68.448-231.264 68.448-237.536 0-430.08-192.512-430.08-430.048S213.856 21.344 451.392 21.344 881.44 213.888 881.44 451.392c0 85.344-25.568 164.384-68.448 231.296l162.656 162.656c36 36 36 94.368 0 130.336zM451.424 144.224c-169.664 0-307.2 137.536-307.2 307.168S281.76 758.56 451.424 758.56c169.632 0 307.168-137.536 307.168-307.168 0.064-169.632-137.536-307.168-307.168-307.168z' }),
          ),
        )
      }

      slots.inject('conversation.input.left', function () {
        return slots.register(
          { name: 'conversation.input.left', id: 'everything-search-btn' },
          function (props) { return React.createElement(SearchButton, props) }
        )
      })
      slots.inject('shell.overlay', function () {
        return slots.register(
          { name: 'shell.overlay', id: 'everything-search-overlay' },
          function () { return React.createElement(SearchOverlay) }
        )
      })
      slots.inject('settings.section', function () {
        return slots.register(
          { name: 'settings.section', id: 'everything-search', order: 90, label: 'Everything 搜索' },
          function () { return React.createElement(SettingsPage) }
        )
      })
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
