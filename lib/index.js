// dsh-everything-search —— Host 半端（静态 web 插件形态）
// es.exe 随插件打包在 lib/es.exe，插件自行调用；RPC 通过 ctx.webServer HTTP 路由。
import { spawn } from 'node:child_process'
import { readFileSync, unlinkSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ES = join(__dirname, 'es.exe')
const TEMP = tmpdir()

// ---- Everything 安装 / 服务诊断（解决"新文件搜不到：索引陈旧"） ----
const EVERYTHING_CANDIDATES = [
  'C:\\Program Files\\Everything\\Everything.exe',
  'C:\\Program Files (x86)\\Everything\\Everything.exe',
]

function findEverythingExe() {
  for (const p of EVERYTHING_CANDIDATES) {
    try { if (existsSync(p)) return p } catch (e) { /* ignore */ }
  }
  return null
}

function runCmd(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      return resolve({ code: -1, out: '', err: String(err && err.message || err) })
    }
    let out = ''
    let err = ''
    let settled = false
    const timer = setTimeout(() => { try { child.kill() } catch (e) { /* ignore */ } }, timeoutMs || 30000)
    const finish = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r) } }
    child.stdout.on('data', (d) => { out += String(d) })
    child.stderr.on('data', (d) => { err += String(d) })
    child.on('error', (e) => finish({ code: -1, out, err: String(e && e.message || e) }))
    child.on('close', (code) => finish({ code, out, err }))
  })
}

async function serviceStatus() {
  const r = await runCmd('sc.exe', ['query', 'Everything'], 15000)
  const installed = !/1060/.test(r.out) && r.code === 0
  const running = /RUNNING/.test(r.out)
  return { installed, running }
}

// 检测：Everything 是否在跑、服务是否装/在跑
async function health() {
  let running = false
  try {
    const t = await runCmd('tasklist.exe', ['/FI', 'IMAGENAME eq Everything.exe', '/NH'], 15000)
    running = /Everything\.exe/i.test(t.out)
  } catch (e) { /* ignore */ }
  const svc = await serviceStatus()
  return {
    everythingExe: findEverythingExe(),
    everythingRunning: running,
    serviceInstalled: svc.installed,
    serviceRunning: svc.running,
    healthy: svc.installed && svc.running,
  }
}

// 修复：安装 Everything 服务（需管理员）并重建索引，让新文件能进索引
async function fixIndex() {
  const exe = findEverythingExe()
  if (!exe) {
    return { ok: false, reason: 'no-everything', message: '未找到 Everything.exe，请先安装 Everything。' }
  }
  const before = await serviceStatus()
  if (!before.installed) {
    await runCmd(exe, ['-install-service'], 60000)
    await new Promise((r) => setTimeout(r, 2500))
  }
  const after = await serviceStatus()
  // 重建索引，补齐此前漏掉的文件
  try { await runCmd(exe, ['-reindex'], 120000) } catch (e) { /* ignore */ }
  const h = await health()
  if (h.serviceRunning) {
    return { ok: true, ...h, message: 'Everything 服务已运行，索引已重建，新文件可实时搜到。' }
  }
  return {
    ok: false,
    ...h,
    reason: h.serviceInstalled ? 'service-not-running' : 'need-admin',
    message: '无法自动安装服务（通常需要管理员权限）。请右键以管理员身份运行：' + exe + ' -install-service',
  }
}

export const inject = ['webServer', 'tools', 'systemPrompt']

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  const tools = ctx.get('tools')
  const systemPrompt = ctx.get('systemPrompt')

  // 是否默认用 Everything 优先搜索（可被客户端设置开关切换）
  let prefer = true
  let sectionDisposer = null
  function applyPreference() {
    if (sectionDisposer) {
      sectionDisposer()
      sectionDisposer = null
    }
    if (prefer && systemPrompt) {
      sectionDisposer = systemPrompt.section({
        name: 'evs-prefer-everything-search',
        order: 118,
        text: '【插件提示 · Everything 全盘搜索】当用户要求查找 / 搜索 / 找到某个文件或文件夹时，请优先调用 `everything_search` 工具（基于 Everything 全盘索引，实时返回全盘结果，支持 *.ext、ext: 类型、scope 限定文件夹等语法）。只有当你确认当前任务限定在工作区 / 项目内、或 everything_search 明显不可用时，才回退到 glob / grep 等工具。',
      })
    }
  }
  applyPreference()

  async function runSearch(args) {
    const query = String((args && args.query) || '').trim()
    if (!query) return { ok: false, error: 'empty query' }
    const esPath = String((args && args.path) || '').trim() || ES
    const scope = String((args && args.scope) || '').trim()
    let limit = Number((args && args.limit) !== undefined ? args.limit : 50)
    if (!Number.isFinite(limit) || limit <= 0) limit = 50
    if (limit > 200) limit = 200

    const tmp = join(TEMP, 'evs-current.txt')
    const argv = [esPath]
    if (args && args.foldersOnly) argv.push('/ad')
    if (args && args.filesOnly) argv.push('/a-d')
    if (args && args.wholeWord) argv.push('-ww')
    if (args && args.matchPath) argv.push('-p')
    if (args && args.regex) argv.push('-r')
    if (scope) argv.push('-path', scope)
    argv.push('-n', String(limit), '-utf8-bom', '-export-txt', tmp)
    argv.push(query)

    return await new Promise((resolve) => {
      let child
      try {
        child = spawn(argv[0], argv.slice(1), { cwd: 'C:\\', windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
      } catch (err) {
        return resolve({ ok: false, error: String(err && err.message || err) })
      }
      let stderr = ''
      child.stderr.on('data', (d) => { stderr += String(d) })
      child.on('error', (err) => {
        try { unlinkSync(tmp) } catch (e) { /* ignore */ }
        resolve({ ok: false, error: String(err && err.message || err) })
      })
      child.on('close', (code) => {
        let text = ''
        try { text = readFileSync(tmp, 'utf-8') } catch (e) { /* ignore */ }
        try { text = text.replace(/^\uFEFF/, '') } catch (e) { /* ignore */ }
        const all = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
        try { unlinkSync(tmp) } catch (e) { /* ignore */ }
        if (code !== 0 && all.length === 0) {
          resolve({ ok: false, error: 'es.exe exited ' + code + ': ' + stderr.trim(), count: 0, results: [] })
        } else {
          resolve({ ok: true, count: all.length, results: all, exitCode: code })
        }
      })
    })
  }

  if (webServer) {
    webServer.register({
      kind: 'exact',
      path: '/evs/api/search',
      handler: async (req, res) => {
        let body = ''
        try { for await (const chunk of req) body += chunk } catch (e) { /* ignore */ }
        let args = {}
        try { args = body ? JSON.parse(body) : {} } catch (e) { args = {} }
        let result
        try { result = await runSearch(args) } catch (e) { result = { ok: false, error: String(e && e.message || e) } }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(result))
      },
    })
    webServer.register({
      kind: 'exact',
      path: '/evs/api/default-path',
      handler: async (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(ES))
      },
    })
    webServer.register({
      kind: 'exact',
      path: '/evs/api/get-preference',
      handler: async (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ prefer }))
      },
    })
    webServer.register({
      kind: 'exact',
      path: '/evs/api/set-preference',
      handler: async (req, res) => {
        let body = ''
        try { for await (const chunk of req) body += chunk } catch (e) { /* ignore */ }
        let args = {}
        try { args = body ? JSON.parse(body) : {} } catch (e) { args = {} }
        prefer = Boolean(args && args.prefer)
        applyPreference()
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ prefer }))
      },
    })
    webServer.register({
      kind: 'exact',
      path: '/evs/api/health',
      handler: async (req, res) => {
        let h
        try { h = await health() } catch (e) { h = { healthy: false, error: String(e && e.message || e) } }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(h))
      },
    })
    webServer.register({
      kind: 'exact',
      path: '/evs/api/fix',
      handler: async (req, res) => {
        let r
        try { r = await fixIndex() } catch (e) { r = { ok: false, message: String(e && e.message || e) } }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(r))
      },
    })
  }

  // 启动自愈：若 Everything 服务缺失（会导致新文件搜不到），自动尝试安装服务 + 重建索引一次
  ;(async () => {
    try {
      const h = await health()
      if (!h.healthy && h.everythingExe) {
        const r = await fixIndex()
        console.log('[everything-search] 索引自愈：' + (r && r.message ? r.message : 'done'))
      }
    } catch (e) { /* ignore */ }
  })()

  if (tools) {
    tools.register({
      name: 'everything_search',
      description: '用 Everything 索引在全部硬盘上极速搜索文件，返回匹配的完整路径。适合快速找文件，比 grep/glob 更快更全。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Everything 搜索词，支持 Everything 语法，例如 *.pdf、ext:ini、文件夹名。' },
          limit: { type: 'number', description: '最多返回条数，默认 50，上限 200。' },
          foldersOnly: { type: 'boolean', description: '只搜文件夹。' },
          filesOnly: { type: 'boolean', description: '只搜文件。' },
          wholeWord: { type: 'boolean', description: '整词匹配。' },
          matchPath: { type: 'boolean', description: '同时匹配完整路径和文件名。' },
          regex: { type: 'boolean', description: '把查询当正则表达式。' },
          scope: { type: 'string', description: '可选：限定在指定文件夹内搜索，如 C:\\Project。' },
        },
        required: ['query'],
      },
      output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
      async execute(args) { return await runSearch(args || {}) },
    })
  }
}
