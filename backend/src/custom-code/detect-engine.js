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

/* ---------------- 「是不是栈/队列」——静态用法判定 ----------------
 *
 * 只认数组的**用法证据**，不靠变量名猜：
 *   栈：出现 top/sp 游标，且数组按下标进出（`a[top]` / `a[++top]` / `a[top++]` / `a[--top]`）
 *   队列：出现 front + rear（或 head + tail），且数组按下标读写（`q[rear]` / `q[front]`）
 * 静态识别器已经认定是 sqstack / sqqueue 时，直接采信（置信更高）。
 * 两者都没有 → 明确回答"普通数组（无进出方向）"，不再让用户以为没识别出东西。
 */
/* 只有这些模板才是"按下标访问的数组形状"，才配谈栈/队列/普通数组。
   其余（链表/树/图/结构体）给 kind:'structure'，避免把 QNode 这种结点结构说成"普通数组"。 */
const ARRAYISH_TPL = new Set(['sqstack', 'sqqueue', 'sqlist', 'proto-seq', 'sstr', 'mgraph', 'hashtab', 'ufset', 'heap']);
const LINKED_QUEUE_TPL = 'linkqueue';
const STACK_CURSORS = ['top', 'sp'];
const QUEUE_CURSORS = [['front', 'rear'], ['head', 'tail']];
const hasWord = (text, word) => new RegExp('\\b' + word + '\\b').test(text);

/** 该数组名在源码里按下标出现过的所有写法（`a[x]`、`a[++top]` …） */
function indexUsesOf(text, name) {
  const out = new Set();
  const re = new RegExp('\\b' + name + '\\s*\\[([^\\]]*)\\]', 'g');
  let m;
  while ((m = re.exec(text))) out.add(String(m[1]).replace(/\s+/g, ''));
  return out;
}

/**
 * @param {string} text 用户源码
 * @param {{name:string, templateId:string|null}} item 识别器给出的条目
 * @returns {{kind:'stack'|'queue'|'array'|'linked', zh:string, direction:string, confidence:number, evidence:string[]}}
 */
export function classifyArrayRole(text, item) {
  const source = String(text ?? '');
  const name = String(item?.name ?? '');
  const tpl = String(item?.templateId ?? '');
  const evidence = [];

  /* ① 识别器直接命中模板（最可靠） */
  if (tpl === 'sqstack') return { kind: 'stack', zh: '栈（顺序栈）', direction: '只在末尾进出（LIFO），栈顶在末格', confidence: 0.92, evidence: ['识别器：顺序栈模板'] };
  if (tpl === 'sqqueue') return { kind: 'queue', zh: '队列（循环队列）', direction: '队头出、队尾进（FIFO）', confidence: 0.92, evidence: ['识别器：循环队列模板'] };
  if (tpl === 'linkqueue') return { kind: 'queue', zh: '队列（链队列）', direction: '队头出、队尾进（FIFO），结点用指针串起来', confidence: 0.9, evidence: ['识别器：链队列模板'] };

  /* ①-b 不是数组形状的结构（链表/树/图/结构体）→ 不参与栈/队列判定 */
  if (!ARRAYISH_TPL.has(tpl) && tpl !== LINKED_QUEUE_TPL) {
    return { kind: 'structure', zh: '结构（非数组）', direction: '', confidence: item?.conf ?? null, evidence: ['模板 ' + (tpl || '未知') + ' 不是数组形状'] };
  }

  /* ② 源码用法证据 */
  const uses = name ? indexUsesOf(source, name) : new Set();
  const stackCursor = STACK_CURSORS.find((cursor) => hasWord(source, cursor));
  const queueCursors = QUEUE_CURSORS.find(([a, b]) => hasWord(source, a) && hasWord(source, b));

  if (stackCursor) {
    const bracket = [...uses].some((u) => u === stackCursor || u === '++' + stackCursor || u === stackCursor + '++' || u === '--' + stackCursor || u === stackCursor + '--');
    if (bracket) {
      evidence.push('游标 ' + stackCursor + ' 与 ' + name + '[' + stackCursor + '…] 同现');
      return { kind: 'stack', zh: '栈（顺序栈）', direction: '只在末尾进出（LIFO），栈顶在末格', confidence: 0.85, evidence };
    }
    evidence.push('有游标 ' + stackCursor + '，但没看到 ' + name + ' 用它当下标');
  }
  if (queueCursors) {
    const [a, b] = queueCursors;
    const bracket = [...uses].some((u) => u.includes(a) || u.includes(b));
    if (bracket) {
      evidence.push('front/rear 型游标 ' + a + '/' + b + ' 与 ' + name + '[' + b + '…] 同现');
      return { kind: 'queue', zh: '队列（循环队列）', direction: '队头出、队尾进（FIFO）', confidence: 0.85, evidence };
    }
    evidence.push('有游标 ' + a + '/' + b + '，但没看到 ' + name + ' 用它当下标');
  }

  /* ③ 都没有 → 明确回答"普通数组" */
  return { kind: 'array', zh: '普通数组（无进出方向）', direction: '', confidence: item?.conf ?? null, evidence: evidence.length ? evidence : ['没有 top/front/rear 这类游标'] };
}

export function detectStatic(code) {
  const AVC = loadAvc();
  if (!AVC.detect || typeof AVC.detect.detect !== 'function') throw new Error('识别器未就绪（AVC.detect 缺失）');
  const text = String(code ?? '');
  if (text.length > 20000) throw new Error('代码过长（上限 20000 字符）。');
  const items = (AVC.detect.detect(text) || [])
    /* base 的兜底正则偶尔把 `int a[N]` 里的类型词当成"结构名"报出来（int / char…），
       这类噪声对用户没有信息量，过滤掉；真结构（数组/链表/树/图…）不受影响。 */
    .filter((it) => !TYPE_WORDS.has(String(it.name || '').trim().toLowerCase()))
    .map((it) => {
    const base = {
      name: it.name || it.zh || '',
      templateId: it.templateId || null,
      logical: it.logical || null,
      conf: typeof it.conf === 'number' ? it.conf : null,
      source: it.source || null,
      line: Number.isInteger(it.line) ? it.line : null,
      why: it.why || '',
      text: it.text || '',
    };
    /* 「是不是栈/队列」：数组类条目一律给出结论（含"普通数组"），其余条目也带上 role 便于前端统一展示 */
    base.role = classifyArrayRole(text, base);
    return base;
  });
  /* 同一个变量常被多条规则命中（sqstack + proto-seq 各报一次），面板上会重复。
     按名字去重，留"结论更具体 + 置信更高"的那条。 */
  const RANK = { stack: 3, queue: 3, structure: 2, array: 1 };
  const byName = new Map();
  for (const item of items) {
    const key = String(item.name);
    const prev = byName.get(key);
    const rank = RANK[item.role.kind] || 0;
    const prevRank = prev ? (RANK[prev.role.kind] || 0) : -1;
    if (!prev || rank > prevRank || (rank === prevRank && (item.role.confidence ?? 0) > (prev.role.confidence ?? 0))) byName.set(key, item);
  }
  const unique = [...byName.values()];
  const summary = { stacks: [], queues: [], arrays: [], others: [] };
  for (const item of unique) {
    const bucket = item.role.kind === 'stack' ? 'stacks' : item.role.kind === 'queue' ? 'queues' : item.role.kind === 'array' ? 'arrays' : 'others';
    summary[bucket].push(item.name);
  }
  return { ok: true, count: unique.length, found: items.length, items: unique, summary };
}

/* ---------------- 整程序：真编译 + 插桩 + 运行 ---------------- */

const LADDER = [
  { name: 'full', opt: { withWatches: true, withDumps: true, withFrame: true } },
  { name: 'no-dump', opt: { withWatches: true, withDumps: false, withFrame: true } },
  { name: 'trace-only', opt: { withWatches: false, withDumps: false, withFrame: true } },
];

/* 这些写法只可能是 C++（`class Trie` 交给 C 编译器会报
   "Missing or misspelled data type near 'class'"）。只用来**自动换语言重试**，不做别的判断。 */
const CPP_MARKERS = [
  /\bclass\s+[A-Za-z_]\w*/,
  /\bnamespace\b/,
  /\btemplate\s*</,
  /\b(?:public|private|protected)\s*:/,
  /\bnullptr\b/,
  /#include\s*<(?:iostream|string|vector|map|queue|stack|algorithm|set|list)>/,
  /\bstd\s*::/,
  /[A-Za-z_]\w*\s*::\s*[A-Za-z_]\w*/,
  /\bnew\s+[A-Za-z_]\w*/,
  /\bcout\b|\bcin\b|\bcerr\b/,
];

/** 这段代码看起来是 C++（只看内容，不看 UI 里选的语言） */
export function looksLikeCpp(code) {
  const text = String(code ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  return CPP_MARKERS.some((re) => re.test(text));
}

/**
 * 编译 + 插桩 + 运行，返回真实执行事件（不落盘到项目目录，用系统临时目录）
 *
 * `lang:'c'` 但代码其实是 C++ 时，会自动用 C++ 再试一次（结果里标 `langUsed:'cpp'` / `autoSwitched:true`），
 * 否则用户只会看到 "Missing or misspelled data type near 'class'" 这种莫名其妙的报错。
 *
 * @param {{code:string, lang?:'c'|'cpp', maxSteps?:number, stdin?:string, timeoutMs?:number}} input
 */
export async function traceProgram(input) {
  const declared = input?.lang ?? 'c';
  const first = await traceProgramOnce(input, declared);
  if (first.ok || first.stage !== 'compile' || declared === 'cpp') return first;
  if (!looksLikeCpp(input?.code)) return first;
  /* 编译失败 + 代码里有 C++ 特征 → 换 C++ 再试一次；成功就带上说明 */
  const retry = await traceProgramOnce(input, 'cpp');
  if (!retry.ok) return { ...first, triedCpp: true, cppFailure: retry };
  return {
    ...retry,
    langUsed: 'cpp',
    autoSwitched: true,
    note: '这段代码是 C++（含 class/namespace/new 等），已自动按 C++ 编译。',
  };
}

async function traceProgramOnce(input, forcedLang) {
  const { maxSteps = 4000, stdin = '', timeoutMs = 8000, withLayers = false } = input ?? {};
  const lang = forcedLang || input?.lang || 'c';
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
        /* 静态识别结果一起传下去：数组层据此标出"栈/队列/堆/哈希"的方向语义
           （只画一根横轴的话，栈和普通数组长得一模一样）。识别失败不影响出图。 */
        let statics = [];
        try { statics = detectStatic(code).items || []; } catch (e) { statics = []; void e; }
        result.layerRun = buildLayerRun({ trace: { events }, sourceLines: String(code).split('\n'), statics });
      } catch (error) {
        result.layerRun = { ok: false, error: '结构折叠失败：' + error.message };
      }
    }
    return result;
  } finally {
    setTimeout(() => rm(dir, { recursive: true, force: true }).catch(() => {}), 1500);
  }
}
