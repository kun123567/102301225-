/**
 * detect-engine.js -- 「自动识别」的统一入口：**raw 里的 Open Watcom 编译器 + base 的识别器**
 *
 * 两件事，分两个入口：
 *   1) detectStatic(code)      纯静态识别（不编译、不起进程，毫秒级）
 *      —— base 的 web/js/{ast,dsCatalog,detect}.js（声明表 + 语义 + 21 条兜底正则）
 *         对 26 项目录给出 {结构, 模板, 逻辑分组, 置信度, 行号, 判据}。
 *   2) traceProgram({code})     整程序真编译 + 插桩 + 运行，拿真实执行事件
 *      —— base 的 server/{instrument,compile,trace}.js + runtime/avctrace.h，
 *         编译器用本仓库 third_party/open-watcom（与 custom-code/runner.js 同一套）。
 *
 * 为什么用 createRequire：source-engine/ 是 base 的原样拷贝（CJS + AVC 全局命名空间），
 * 它自己的 package.json 标了 {"type":"commonjs"}，这里只做 ESM 门面，不改它的内部实现。
 */

import { createRequire } from 'node:module';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLayerRun } from './engine-layers.js';

const require = createRequire(import.meta.url);
const ENGINE = fileURLToPath(new URL('./source-engine/', import.meta.url));
const req = (rel) => require(path.join(ENGINE, rel));

/* ---------------- AVC 全局命名空间（base 的浏览器模块是 IIFE） ---------------- */
let avcReady = null;
function loadAvc() {
  if (avcReady) return avcReady;
  avcReady = (() => {
    const noopEl = () => ({
      style: {}, dataset: {}, children: [], textContent: '', className: '',
      setAttribute() {}, appendChild() {}, append() {}, addEventListener() {}, remove() {},
      querySelector: () => null, querySelectorAll: () => [],
    });
    const g = globalThis;
    if (!g.window) g.window = g;
    if (!g.document) {
      g.document = { createElement: noopEl, createElementNS: noopEl, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    }
    if (!g.AVC) g.AVC = {};
    for (const file of ['ast.js', 'dsCatalog.js', 'detect.js']) req('web/js/' + file);
    return g.AVC;
  })();
  return avcReady;
}

/** 编译器/链接器是否可用（raw 的 third_party 里那套） */
export function engineHealth() {
  loadAvc();
  const env = req('server/env.js');
  const h = env.health();
  return { ok: !!(h.ok && h.cc && h.linker), cc: h.cc, cxx: h.cxx, linker: h.linker, watcom: h.watcom, root: h.root };
}

/** 26 项数据结构目录（名称/逻辑分组/模板 id），供前端显示 */
export function dataStructures() {
  const AVC = loadAvc();
  const items = (AVC.dsCatalog && (AVC.dsCatalog.ITEMS || AVC.dsCatalog.items || AVC.dsCatalog.LIST)) || [];
  return (Array.isArray(items) ? items : []).map((it) => ({
    id: it.id, name: it.zh || it.name, logical: it.logical, renderer: it.renderer || null,
  }));
}

/**
 * 静态识别：贴进来的代码用了哪些数据结构
 * @param {string} code
 * @returns {{ok:boolean, items:Array, count:number}}
 */
const TYPE_WORDS = new Set(['int', 'char', 'float', 'double', 'bool', 'void', 'long', 'short', 'unsigned', 'signed', 'string']);
export function detectStatic(code) {
  const AVC = loadAvc();
  if (!AVC.detect || typeof AVC.detect.detect !== 'function') throw new Error('识别器未就绪（AVC.detect 缺失）');
  const text = String(code ?? '');
  if (text.length > 20000) throw new Error('代码过长（上限 20000 字符）。');
  const items = (AVC.detect.detect(text) || [])
    /* base 的兜底正则偶尔把 `int a[N]` 里的类型词当成"结构名"报出来（int / char…），
       这类噪声对用户没有信息量，过滤掉；真结构（数组/链表/树/图…）不受影响。 */
    .filter((it) => !TYPE_WORDS.has(String(it.name || '').trim().toLowerCase()))
    .map((it) => ({
    name: it.name || it.zh || '',
    templateId: it.templateId || null,
    logical: it.logical || null,
    conf: typeof it.conf === 'number' ? it.conf : null,
    source: it.source || null,
    line: Number.isInteger(it.line) ? it.line : null,
    why: it.why || '',
    text: it.text || '',
  }));
  return { ok: true, count: items.length, items };
}

/* ---------------- 整程序：真编译 + 插桩 + 运行 ---------------- */

const LADDER = [
  { name: 'full', opt: { withWatches: true, withDumps: true, withFrame: true } },
  { name: 'no-dump', opt: { withWatches: true, withDumps: false, withFrame: true } },
  { name: 'trace-only', opt: { withWatches: false, withDumps: false, withFrame: true } },
];

/**
 * 编译 + 插桩 + 运行，返回真实执行事件（不落盘到项目目录，用系统临时目录）
 * @param {{code:string, lang?:'c'|'cpp', maxSteps?:number, stdin?:string, timeoutMs?:number}} input
 */
export async function traceProgram(input) {
  const { maxSteps = 4000, stdin = '', timeoutMs = 8000, withLayers = false } = input ?? {};
  const lang = input?.lang ?? 'c';
  /* 从网页/编辑器粘过来的代码常带 UTF-8 BOM，Watcom 会当成非法字符报 "found ' '"。
     这里统一去掉（含首部空白前的 BOM）。 */
  const code = String(input?.code ?? '').replace(/^\uFEFF/, '');
  if (typeof code !== 'string' || !code.trim()) throw new Error('请先输入代码。');
  if (code.length > 20000) throw new Error('代码过长（上限 20000 字符）。');
  if (lang !== 'c' && lang !== 'cpp') throw new Error('只支持 c / cpp。');
  const health = engineHealth();
  if (!health.ok) return { ok: false, stage: 'toolchain', log: '未找到本仓库 third_party 里的 Open Watcom 工具链。', diags: [] };

  const { instrument } = req('server/instrument.js');
  const { build, execute } = req('server/compile.js');
  const { parseTrace } = req('server/trace.js');
  const HEADER = path.join(ENGINE, 'runtime', 'avctrace.h');
  /* C 代码按 C99 解析（学生习惯 `for (int i = 0; ...)`）；C++ 走 Watcom 的 -xs */
  const STDFLAGS = lang === 'c' ? { std: 'c99' } : {};

  const dir = await mkdtemp(path.join(tmpdir(), 'dsh-detect-'));
  try {
    await mkdir(dir, { recursive: true });
    await copyFile(HEADER, path.join(dir, 'avctrace.h'));

    // 1) 先看未插桩版本能不能编过（这样报错行号与用户源码一致）
    const plain = await build({ workdir: dir, source: code, lang, exeName: 'main.exe', ...STDFLAGS });
    if (!plain.ok) return { ok: false, stage: plain.stage, log: plain.log || '', diags: plain.diags || [], degradedMode: null };

    // 2) 逐级降级插桩（与 base /api/trace 同一套顺序）
    let used = null;
    let meta = null;
    let usedName = null;
    for (const step of LADDER) {
      let inst;
      try { inst = instrument(code, step.opt); } catch { continue; }
      const r = await build({ workdir: dir, source: inst.code, lang, exeName: 'main.exe', ...STDFLAGS });
      if (r.ok) { used = r; meta = inst.meta; usedName = step.name; break; }
    }
    if (!used) {
      return {
        ok: false, stage: 'instrument',
        log: '插桩版本编译失败：这段代码用了插桩暂不支持的写法（可先看静态识别结果）。',
        diags: [], degradedMode: null,
      };
    }

    // 3) 运行 → 读事件
    const traceFile = path.join(dir, '__avc_trace.txt');
    await rm(traceFile, { force: true });
    const ex = await execute(used.exe, dir, { stdin, timeoutMs });
    const text = await readFile(traceFile, 'utf8').catch(() => '');
    const parsed = parseTrace(text);
    const limit = Math.max(50, Math.min(Number(maxSteps) || 4000, 20000));
    let events = parsed.events;
    let truncated = parsed.truncated;
    if (parsed.steps > limit) {
      let n = 0;
      events = [];
      for (const e of parsed.events) {
        if (e[0] === 'S') { n += 1; if (n > limit) break; }
        events.push(e);
      }
      truncated = true;
    }
    const result = {
      ok: true,
      stage: 'ok',
      degradedMode: usedName,
      steps: truncated ? limit : parsed.steps,
      truncated,
      events,
      structure: meta,
      stdout: ex.stdout,
      stderr: ex.stderr,
      exitCode: ex.exitCode,
      runMs: ex.ms,
      log: used.log || '',
    };
    /* withLayers：顺手把事件折叠成 plus 的 layers[]（每步一层），
       前端拿它就能直接走 createPlusView，不需要再理解事件流。 */
    if (withLayers) {
      try {
        result.layerRun = buildLayerRun({ trace: { events }, sourceLines: String(code).split('\n') });
      } catch (error) {
        result.layerRun = { ok: false, error: '结构折叠失败：' + error.message };
      }
    }
    return result;
  } finally {
    setTimeout(() => rm(dir, { recursive: true, force: true }).catch(() => {}), 1500);
  }
}
