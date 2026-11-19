'use strict';
/**
 * server.js -- prototype01 本地服务（零依赖，只监听 127.0.0.1）
 *
 * 静态资源：/web/*
 * 样例源码：/api/samples
 * 接口：
 *   GET  /api/health
 *   POST /api/compile  {code, lang}                 -> {ok, log, diags, structure}
 *   POST /api/run      {code, lang, stdin}          -> {ok, stdout, stderr, exitCode, ms}
 *   POST /api/trace    {code, lang, stdin, maxSteps}-> {ok, events, steps, truncated, structure, degraded}
 */
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');

const { health, toolchain } = require('./env');
const { build, execute } = require('./compile');
const { instrument } = require('./instrument');
const { parseTrace } = require('./trace');

const PORT = Number(process.env.PORT || 8770);
const HOST = '127.0.0.1';
const WEB = path.resolve(__dirname, '..', 'web');
const RUNTIME = path.resolve(__dirname, '..', 'runtime');
const SAMPLES = path.resolve(__dirname, '..', 'samples');
const WORKROOT = path.resolve(__dirname, '..', 'workspace');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.map': 'application/json', '.c': 'text/plain; charset=utf-8',
};

let seq = 0;
async function freshWorkspace(tag) {
  const dir = path.join(WORKROOT, `${tag}-${Date.now().toString(36)}-${(seq++).toString(36)}`);
  await fsp.mkdir(dir, { recursive: true });
  // 跟踪运行时头文件随工程放置，源码里 #include "avctrace.h" 直接可解析
  await fsp.copyFile(path.join(RUNTIME, 'avctrace.h'), path.join(dir, 'avctrace.h'));
  return dir;
}
async function cleanupOld(days) {
  try {
    const now = Date.now();
    for (const d of await fsp.readdir(WORKROOT)) {
      const p = path.join(WORKROOT, d);
      const st = await fsp.stat(p).catch(() => null);
      if (st && st.isDirectory() && now - st.mtimeMs > days * 864e5) {
        await fsp.rm(p, { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch (_) {}
}

function send(res, code, body, type) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}
function fail(res, code, msg) { send(res, code, { ok: false, error: msg }); }

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', d => {
      n += d.length;
      if (n > (limit || 4 * 1024 * 1024)) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(d);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', reject);
  });
}


function diagnoseRun(stdin, ex) {
  if (!ex || ex.exitCode === 0) return '';
  const err = String(ex.stderr || '');
  const crashed = /referenced memory|Exception fielded|access violation/i.test(err);
  const emptyIn = !stdin || !String(stdin).trim();
  if (crashed) {
    const base = '程序崩溃（访问违例）：常见原因是未初始化的变量、数组越界或野指针。';
    if (emptyIn) {
      return base + ' 本次【没有提供 stdin】——若程序用 cin/scanf 读取规模或数据，读失败后变量是随机值，' +
        '紧接着用它们当下标就会立刻崩。请在「输入(stdin)」页填入完整输入后重跑。';
    }
    const toks = String(stdin).trim().split(/\s+/).filter(Boolean);
    const head = toks.slice(0, 8).join(' ');
    return base + ' 本次 stdin 共【' + toks.length + ' 个数据项】：' + head +
      (toks.length > 8 ? ' …' : '') +
      '。若程序是「先读 n m，再读 m 组边，最后读起点」这类形状，' +
      '所需个数通常是 2 + 2*m + 1；读不够时 u/v 会是随机值，随后 g[u] 越界即崩。' +
      ' 建议：① 按程序读取顺序补齐 stdin；② 或点「控制台运行」，让程序停下逐项等你输入。';
  }
  if (/terminated|timeout/i.test(err)) return '程序被终止（可能超时或死循环）。';
  return '';
}


/* ---------------- 交互式控制台运行（等价 Visual Studio 的“启动但不调试”） ----------------
 * 说明：浏览器无法提供真 TTY，所以这里在**桌面上开一个独立控制台窗口**，
 *       由它直接运行 exe —— 这样 cin/scanf 会真正等待用户键入，输出也直接显示在窗口里。
 *       代价：该窗口的输入输出不受本页面捕获（要捕获请用「运行」+ stdin 文本框）。
 */
async function launchConsole(code, lang) {
  const dir = path.join(WORKROOT, 'console-' + Date.now().toString(36) + '-' + (seq++).toString(36));
  await fsp.mkdir(dir, { recursive: true });
  await fsp.copyFile(path.join(RUNTIME, 'avctrace.h'), path.join(dir, 'avctrace.h')).catch(() => {});

  const r = await build({ workdir: dir, source: code, lang, exeName: 'main.exe' });
  if (!r.ok) return { ok: false, stage: r.stage, log: r.log, diags: r.diags };

  const bat = [
    '@echo off',
    'cd /d "%~dp0"',
    'title prototype01 运行窗口',
    'cls',
    'main.exe',
    'echo.',
    'echo [程序已结束] 按任意键关闭此窗口...',
    'pause >nul',
    '',
  ].join('\r\n');
  await fsp.writeFile(path.join(dir, 'run.bat'), bat, 'ascii');

  // 新开控制台窗口（start 会把窗口建在用户桌面上）
  try {
    const child = require('child_process').spawn('cmd.exe',
      ['/c', 'start', '', '/D', dir, 'cmd.exe', '/c', 'run.bat'],
      { detached: true, stdio: 'ignore', windowsHide: false, cwd: dir });
    child.unref();
  } catch (e) {
    return { ok: false, stage: 'launch', log: '无法打开控制台窗口: ' + e.message, diags: [] };
  }
  return { ok: true, dir, launched: true };
}

function langFile(lang) { return lang === 'cpp' ? 'main.cpp' : 'main.c'; }

async function handleApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/health') {
    return send(res, 200, Object.assign({ ok: true, port: PORT, node: process.version }, health()));
  }

  if (p === '/api/samples' && req.method === 'GET') {
    const list = [];
    // 顶层样例 + samples/ds/ 下的 26 项数据结构例题（子目录以 "ds/xxx.c" 形式给出）
    const walk = async (dir, prefix) => {
      for (const f of await fsp.readdir(dir).catch(() => [])) {
        const full = path.join(dir, f);
        let st;
        try { st = await fsp.stat(full); } catch (_) { continue; }
        if (st.isDirectory()) { await walk(full, prefix + f + '/'); continue; }
        if (!/\.(c|cpp)$/.test(f)) continue;
        const txt = await fsp.readFile(full, 'utf8').catch(() => '');
        const first = (txt.split(/\r?\n/).find(l => /^\/\/\s*@desc/.test(l)) || '').replace(/^\/\/\s*@desc\s*/, '');
        list.push({
          file: prefix + f,
          title: (prefix === 'ds/' ? '［数据结构］' : '') + (first || f),
          lang: /\.cpp$/.test(f) ? 'cpp' : 'c',
        });
      }
    };
    await walk(SAMPLES, '');
    return send(res, 200, { ok: true, samples: list });
  }

  if (p === '/api/sample' && req.method === 'GET') {
    // 允许 "ds/01_sqlist.c" 这种带一层子目录的样例名（禁止 ../ 穿越）
    const raw = String(url.searchParams.get('name') || '').replace(/\\/g, '/');
    if (raw.indexOf('..') >= 0 || raw.indexOf(':') >= 0) return fail(res, 400, '样例名非法');
    const name = raw;
    if (!/\.(c|cpp)$/.test(name)) return fail(res, 400, '样例名非法');
    const full = path.join(SAMPLES, name);
    if (!path.resolve(full).startsWith(path.resolve(SAMPLES))) return fail(res, 400, '样例名非法');
    if (!fs.existsSync(full)) return fail(res, 404, '样例不存在');
    const code = await fsp.readFile(full, 'utf8');
    return send(res, 200, { ok: true, file: name, code, lang: /\.cpp$/.test(name) ? 'cpp' : 'c' });
  }

  if (req.method !== 'POST') return fail(res, 405, '只支持 POST');

  let body;
  try { body = await readBody(req); } catch (e) { return fail(res, 400, e.message); }
  const lang = body.lang === 'cpp' ? 'cpp' : 'c';
  const code = String(body.code || '');
  if (!code.trim()) return fail(res, 400, '源码为空');
  if (code.length > 512 * 1024) return fail(res, 400, '源码过大（>512KB）');

  if (p === '/api/compile') {
    const dir = await freshWorkspace('cmp');
    try {
      const r = await build({ workdir: dir, source: code, lang });
      let structure = null;
      try { structure = instrument(code, { withWatches: false, withDumps: true, withFrame: true }).meta; } catch (_) {}
      return send(res, 200, {
        ok: !!r.ok, stage: r.stage, log: r.log || '', diags: r.diags || [],
        structure, ms: r.ms || 0,
      });
    } finally { setTimeout(() => fsp.rm(dir, { recursive: true, force: true }).catch(() => {}), 500); }
  }

  if (p === '/api/run') {
    const dir = await freshWorkspace('run');
    try {
      const r = await build({ workdir: dir, source: code, lang });
      if (!r.ok) return send(res, 200, { ok: false, stage: r.stage, log: r.log, diags: r.diags });
      const ex = await execute(r.exe, dir, { stdin: body.stdin || '', timeoutMs: Number(body.timeoutMs) || 8000 });
      const hint = diagnoseRun(body.stdin, ex);
      return send(res, 200, Object.assign({ ok: true, diags: [], hint }, ex));
    } finally { setTimeout(() => fsp.rm(dir, { recursive: true, force: true }).catch(() => {}), 800); }
  }

  if (p === '/api/runconsole') {
    const out = await launchConsole(code, lang);
    if (!out.ok) return send(res, 200, { ok: false, stage: out.stage, log: out.log, diags: out.diags || [] });
    return send(res, 200, {
      ok: true, launched: true, dir: out.dir,
      hint: '已在新打开的控制台窗口里启动程序（窗口会自动等待输入）。运行结束后按任意键关闭窗口。',
    });
  }

  if (p === '/api/trace') {
    const dir = await freshWorkspace('trc');
    const maxSteps = Math.max(50, Math.min(Number(body.maxSteps) || 4000, 20000));
    try {
      // 1) 先按用户原样编译一次，保证行号与用户源码一致
      const plain = await build({ workdir: dir, source: code, lang, exeName: 'main.exe' });
      if (!plain.ok) return send(res, 200, { ok: false, stage: plain.stage, log: plain.log, diags: plain.diags });

      // 2) 插桩；逐级降级以保证总能跑起来
      const attempts = [
        { name: 'full', opt: { withWatches: true, withDumps: true, withFrame: true } },
        { name: 'no-dump', opt: { withWatches: true, withDumps: false, withFrame: true } },
        { name: 'trace-only', opt: { withWatches: false, withDumps: false, withFrame: true } },
      ];
      let used = null, ir = null, usedName = null;
      for (const a of attempts) {
        let inst;
        try { inst = instrument(code, a.opt); } catch (e) { continue; }
        const r = await build({ workdir: dir, source: inst.code, lang, exeName: 'main.exe' });
        if (r.ok) { used = r; ir = inst; usedName = a.name; break; }
      }
      if (!used || !ir) {
        return send(res, 200, {
          ok: false, stage: 'instrument',
          log: '插桩版本编译失败（可能使用了不支持的结构），已回退到普通编译。可改用「编译并运行」。',
          diags: [],
        });
      }

      // 3) 运行并读取事件
      const traceFile = path.join(dir, '__avc_trace.txt');
      try { fs.unlinkSync(traceFile); } catch (_) {}
      const ex = await execute(used.exe, dir, { stdin: body.stdin || '', timeoutMs: Number(body.timeoutMs) || 8000 });
      let text = '';
      try { text = await fsp.readFile(traceFile, 'utf8'); } catch (_) {}
      let parsed = parseTrace(text);
      if (parsed.steps > maxSteps) {
        parsed.events = trimToSteps(parsed.events, maxSteps);
        parsed.steps = maxSteps;
        parsed.truncated = true;
      }
      return send(res, 200, {
        ok: true,
        events: parsed.events,
        steps: parsed.steps,
        truncated: parsed.truncated,
        degradedMode: usedName,
        stdout: ex.stdout, stderr: ex.stderr, exitCode: ex.exitCode, runMs: ex.ms,
        hint: diagnoseRun(body.stdin, ex),
        structure: ir.meta,
        maxSteps,
      });
    } finally { setTimeout(() => fsp.rm(dir, { recursive: true, force: true }).catch(() => {}), 1500); }
  }

  return fail(res, 404, '未知接口');
}

function trimToSteps(events, maxSteps) {
  const out = [];
  let n = 0;
  for (const e of events) {
    if (e[0] === 'S') { n++; if (n > maxSteps) break; }
    out.push(e);
  }
  return out;
}

/* ---------------- 静态文件 ---------------- */
async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = path.join(WEB, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!full.startsWith(WEB)) return fail(res, 403, 'forbidden');
  try {
    const st = await fsp.stat(full);
    if (!st.isFile()) return fail(res, 404, 'not found');
    const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    fs.createReadStream(full).pipe(res);
  } catch (_) {
    fail(res, 404, 'not found: ' + rel);
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  res.setHeader('X-Powered-By', 'prototype01');
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(e => fail(res, 500, String(e && e.message || e)));
    return;
  }
  serveStatic(req, res, url);
});

(async () => {
  await fsp.mkdir(WORKROOT, { recursive: true });
  cleanupOld(2);
  server.listen(PORT, HOST, () => {
    const h = health();
    console.log('=================================================');
    console.log('  AnyviewC 可视化学习环境 · prototype01');
    console.log('  http://' + HOST + ':' + PORT + '/');
    console.log('-------------------------------------------------');
    console.log('  C   编译器 : ' + (h.cc || '未找到'));
    console.log('  C++ 编译器 : ' + (h.cxx || '未找到'));
    console.log('  链接器     : ' + (h.linker || '未找到'));
    console.log('=================================================');
  });
})();
