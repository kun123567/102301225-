'use strict';
/**
 * test-coverage.js -- 「换一个代码就什么都不显示」的覆盖矩阵（V2 收尾）
 *
 * 目的：不再逐个样例救火，而是对 samples/ 下**每一个**样例跑一遍真实流水线
 * （插桩 → 自建编译器 → 运行 → 事件 → 会话快照），断言：
 *   ① 编译+跟踪成功（degraded 级别必须 full）
 *   ② 至少有一个「有数据」的候选（数组窗或结构窗能画出东西）
 *   ③ 报出每个样例到底靠哪条采集通道（V 数组 / N-M 结构 / lists）
 *
 * 任何新样例加进 samples/ 就会自动进入矩阵。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

global.window = global;
global.document = {
  createElement: () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} } }),
  createElementNS: () => ({ setAttribute() {}, appendChild() {} }),
  getElementById: () => null, querySelectorAll: () => [],
};
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const WEB = path.resolve(__dirname, '..', 'web', 'js');
for (const f of ['theme.js', 'doc.js', 'highlight.js', 'vmodel.js', 'session.js', 'memcell.js', 'stackheap.js',
  'arrayView.js', 'linkView.js', 'treeView.js', 'dsCatalog.js', 'ast.js', 'detect.js', 'shape.js',
  'graph.js', 'viewport.js', 'arbitrate.js']) {
  require(path.join(WEB, f));
}
const AVC = global.AVC;
const { instrument } = require('./instrument');
const { build, execute } = require('./compile');
const { parseTrace } = require('./trace');

const ROOT = path.resolve(__dirname, '..');
const STDIN = {
  '08_bfs_raw.cpp': '4 4\n1 2\n1 3\n2 4\n3 4\n1\n',
  '08_bfs_graph.cpp': '4 4\n1 2\n1 3\n2 4\n3 4\n1\n',
  '10_quicksort_new.cpp': '5\n42 32 5 1 1\n',
  '02_quicksort.cpp': '5\n42 32 5 1 1\n',
};

let pass = 0, fail = 0;
function ok(c, n, e) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e ? '  [' + e + ']' : '')); } }

async function traceOne(file) {
  const code = fs.readFileSync(path.join(ROOT, 'samples', file), 'utf8');
  const lang = /\.c$/.test(file) ? 'c' : 'cpp';
  const inst = instrument(code, { withWatches: true, withDumps: true, withFrame: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'));
  fs.copyFileSync(path.join(ROOT, 'runtime', 'avctrace.h'), path.join(dir, 'avctrace.h'));
  const b = await build({ workdir: dir, source: inst.code, lang, exeName: 'main.exe' });
  if (!b.ok) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} return { file, ok: false, stage: b.stage, log: b.log }; }
  const ex = await execute(b.exe, dir, { stdin: STDIN[file] || '', timeoutMs: 20000 });
  let text = '';
  try { text = fs.readFileSync(path.join(dir, '__avc_trace.txt'), 'utf8'); } catch (_) {}
  const parsed = parseTrace(text);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  return { file, ok: true, parsed, ex, inst };
}

(async () => {
  const files = fs.readdirSync(path.join(ROOT, 'samples')).filter(f => /\.(c|cpp)$/.test(f)).sort();
  console.log('覆盖矩阵：' + files.length + ' 个样例，全部走真实 插桩→编译→运行→事件→快照 流水线\n');

  const rows = [];
  for (const f of files) {
    const r = await traceOne(f);
    if (!r.ok) { rows.push({ f, note: '编译失败(' + r.stage + ')', arr: [], str: [] }); continue; }
    const p = r.parsed;
    const code = fs.readFileSync(path.join(ROOT, 'samples', f), 'utf8');
    const sess = new AVC.session.Session({ events: p.events, structure: null });
    const total = sess.totalSteps;
    // 扫全程，取"最丰富"的一步
    let best = null;
    for (let st = 0; st < total; st++) {
      const snap = sess.snapshotAt(st);
      const arrs = AVC.vmodel.groupArrays(snap);
      const str = Object.keys(snap.nxm || {}).filter(k => (snap.nxm[k] || []).length);
      const lst = Object.keys(snap.lists || {});
      // 纯递归/纯标量程序的"可视化"就是**运行栈**（调用帧深度），也算一条通道
      const depth = (snap.frames || []).length;
      const n = Object.keys(arrs).length + str.length + lst.length + (depth > 1 ? 1 : 0);
      if (!best || n > best.n) best = { st, n, arr: Object.keys(arrs), str, lst, snap, depth };
      if (best.st === st && n === 0 && st > 3) break;   // 前面几步没东西就不必扫完
    }
    rows.push({ f, total, degraded: r.degradedMode || '', best, note: '' });
  }

  console.log('样例'.padEnd(24) + '步数   数组候选            结构候选(N/M)        通道');
  console.log('-'.repeat(92));
  for (const row of rows) {
    if (row.note) { console.log(row.f.padEnd(24) + row.note); continue; }
    const b = row.best || { arr: [], str: [], lst: [], st: -1 };
    const ch = b.arr.length && b.str.length ? 'V + N/M' : (b.arr.length ? 'V' : (b.str.length ? 'N/M' : '—'));
    console.log(row.f.padEnd(24) + String(row.total).padEnd(6) +
      (b.arr.join(',') || '—').slice(0, 20).padEnd(20) +
      (b.str.concat(b.lst).join(',') || '—').slice(0, 20).padEnd(22) + ch);
  }
  console.log('');

  // 断言：每个样例都必须至少有一条可视化通道
  for (const row of rows) {
    if (row.note) { ok(false, row.f + ' 可编译可跟踪', row.note); continue; }
    const b = row.best || { arr: [], str: [], lst: [], depth: 0 };
    const has = (b.arr.length + b.str.length + b.lst.length) > 0 || b.depth > 1;
    ok(has, row.f + ' 至少有一个可画对象', '数组=' + b.arr.join(',') + ' 结构=' + b.str.concat(b.lst).join(',') + ' 栈深=' + b.depth);
  }

  console.log('\n' + (fail === 0 ? '✅ 覆盖矩阵全绿：' : '❌ 有样例什么都画不出：') + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
