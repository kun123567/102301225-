'use strict';
/**
 * test-ds-matrix.js -- 26 项数据结构例题的可视化矩阵
 *
 * 对 samples/ds/ 下每个例题跑真实流水线（插桩 → 自建编译器 → 运行 → 事件 → 会话快照），
 * 报出每一步实际能画什么：
 *   数组窗（V 事件聚合成 a[i]） / 结构窗（N-M 或 lists 链表树） / 切换器候选
 * 断言：每个文件至少有一个"有数据"的可画对象。
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
  'graph.js', 'viewport.js', 'arbitrate.js']) require(path.join(WEB, f));
const AVC = global.AVC;
const { instrument } = require('./instrument');
const { build, execute } = require('./compile');
const { parseTrace } = require('./trace');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'samples', 'ds');
/* 少数例题需要 stdin（层序建树等）；其余写死数据，不需要输入 */
const STDIN = {
  '27_bintree_class.cpp': '1 2 3 -1 4\n',
};

let pass = 0, fail = 0;
function ok(c, n, e) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e ? '  [' + e + ']' : '')); } }

async function run(file) {
  const code = fs.readFileSync(path.join(DIR, file), 'utf8');
  const lang = /\.cpp$/.test(file) ? 'cpp' : 'c';
  let inst;
  try { inst = instrument(code, { withWatches: true, withDumps: true, withFrame: true }); }
  catch (e) { return { file, ok: false, why: 'instrument 抛错: ' + e.message }; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-'));
  fs.copyFileSync(path.join(ROOT, 'runtime', 'avctrace.h'), path.join(dir, 'avctrace.h'));
  const b = await build({ workdir: dir, source: inst.code, lang, exeName: 'main.exe' });
  if (!b.ok) {
    const errs = String(b.log || '').split('\n').filter(l => /Error/.test(l)).slice(0, 3).join(' | ');
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    return { file, ok: false, why: '编译失败: ' + errs };
  }
  const ex = await execute(b.exe, dir, { stdin: STDIN[file] || '', timeoutMs: 20000 });
  let text = '';
  try { text = fs.readFileSync(path.join(dir, '__avc_trace.txt'), 'utf8'); } catch (_) {}
  const parsed = parseTrace(text);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  return { file, ok: true, parsed, ex, inst };
}

(async () => {
  const files = fs.readdirSync(DIR).filter(f => /\.(c|cpp)$/.test(f)).sort();
  console.log('26 项数据结构可视化矩阵（真实 插桩→编译→运行→快照）\n');
  console.log('文件'.padEnd(28) + '步数 数组窗                    结构/图形窗                切换器');
  console.log('-'.repeat(112));

  const rows = [];
  for (const f of files) {
    const r = await run(f);
    if (!r.ok) { rows.push({ f, bad: r.why }); continue; }
    const p = r.parsed;
    const sess = new AVC.session.Session({ events: p.events, structure: r.inst.meta ? { structs: r.inst.meta.structs } : null });
    let best = { n: -1, arr: [], str: [], cs: [], st: 0 };
    for (let st = 0; st < sess.totalSteps; st++) {
      const snap = sess.snapshotAt(st);
      const arrs = AVC.vmodel.groupArrays(snap);
      const str = Object.keys(snap.nxm || {}).filter(k => (snap.nxm[k] || []).length);
      const lst = Object.keys(snap.lists || {}).filter(k => (snap.lists[k].nodes || []).length);
      const cs = AVC.viewport.buildCandidates(snap, []).map(c => c.var);
      const n = Object.keys(arrs).length + str.length + lst.length;
      if (n > best.n) best = { n, st, arr: Object.keys(arrs), str: str.concat(lst), cs, snap };
    }
    rows.push({ f, total: sess.totalSteps, best, exit: r.ex.exitCode });
  }

  for (const row of rows) {
    if (row.bad) { console.log(row.f.padEnd(28) + '✗ ' + row.bad.slice(0, 70)); continue; }
    const b = row.best;
    console.log(row.f.padEnd(28) + String(row.total).padEnd(5) +
      (b.arr.join(',') || '—').slice(0, 24).padEnd(26) +
      (b.str.join(',') || '—').slice(0, 26).padEnd(27) +
      (b.cs.join(',') || '—').slice(0, 24));
  }
  console.log('');

  for (const row of rows) {
    if (row.bad) { ok(false, row.f, row.bad.slice(0, 90)); continue; }
    const b = row.best;
    const has = (b.arr.length + b.str.length) > 0;
    ok(has, row.f + ' 有可视化数据', '数组=' + b.arr.join(',') + ' 结构=' + b.str.join(','));
  }

  console.log('\n' + (fail === 0 ? '✅ 26 项矩阵全绿：' : '❌ 有例题画不出：') + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
