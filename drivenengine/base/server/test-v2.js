'use strict';
/**
 * test-v2.js -- V2 采集层验收（纯 node；会真实调用自建 C++ 编译器，约 20~60s）
 *
 * 覆盖 PLAN_VIEWPORT §5 的采集层三件事：
 *   A. 声明解析：vector<int> g[N] / bool vis[N] / queue<int> q / const int N=…（不编译）
 *   B. STL 泛型 dump 端到端：8 类容器都出 N/M；非数值元素只出 M(len)
 *   C. 邻接表端到端：vector<int> g[N] → N + NE(adj)，并能被 graph.js / viewport 消费
 * 以及限流铁律：结点 ≤32、边 ≤64、堆事件封顶。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web', 'js');

/* ---------------- 迷你 DOM / localStorage（viewport 需要） ---------------- */
function mkEl(tag) {
  return {
    tagName: tag, children: [], style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
    _html: '', _on: {},
    set innerHTML(v) { this._html = v; this.children.length = 0; },
    get innerHTML() { return this._html; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(t, fn) { (this._on[t] = this._on[t] || []).push(fn); },
    setAttribute() {}, removeAttribute() {}, querySelector: () => null,
    trigger(t) { (this._on[t] || []).forEach(f => f()); },
  };
}
const store = {};
global.window = global;
global.document = { createElement: mkEl, createElementNS: () => mkEl('svg'), getElementById: () => null, querySelectorAll: () => [] };
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };

for (const f of ['theme.js', 'doc.js', 'vmodel.js', 'session.js', 'memcell.js', 'stackheap.js', 'arrayView.js',
  'linkView.js', 'treeView.js', 'dsCatalog.js', 'shape.js', 'graph.js', 'arbitrate.js', 'viewport.js']) {
  require(path.join(WEB, f));
}
const AVC = global.AVC;
const { instrument } = require('./instrument');
const { build, execute } = require('./compile');
const { parseTrace } = require('./trace');

let pass = 0, fail = 0;
function ok(c, n, e) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e ? '  [' + e + ']' : '')); } }
function eq(a, b, n) { ok(a === b, n, 'got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b)); }

const OPTS = { withWatches: true, withDumps: true, withFrame: true };

/** 插桩 → 编译 → 运行 → 解析事件 → 前端会话快照 */
async function run(file, lang, stdin) {
  const code = fs.readFileSync(path.join(ROOT, 'samples', file), 'utf8');
  const inst = instrument(code, OPTS);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-'));
  fs.copyFileSync(path.join(ROOT, 'runtime', 'avctrace.h'), path.join(dir, 'avctrace.h'));
  const b = await build({ workdir: dir, source: inst.code, lang, exeName: 'main.exe' });
  if (!b.ok) return { ok: false, stage: b.stage, log: b.log, inst };
  const ex = await execute(b.exe, dir, { stdin: stdin || '', timeoutMs: 20000 });
  let text = '';
  try { text = fs.readFileSync(path.join(dir, '__avc_trace.txt'), 'utf8'); } catch (_) {}
  const parsed = parseTrace(text);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  return { ok: true, inst, parsed, ex, traceBytes: Buffer.byteLength(text) };
}

const kinds = (parsed) => {
  const c = {};
  for (const e of parsed.events) c[e[0]] = (c[e[0]] || 0) + 1;
  return c;
};
const forVar = (parsed, tag, v) => parsed.events.filter(e => e[0] === tag && e[1] === v);
const lastSnap = (parsed) => {
  const s = new AVC.session.Session({ events: parsed.events, structure: null });
  return s.snapshotAt(s.totalSteps - 1);
};

(async () => {
  /* ================= A. 声明解析 ================= */
  console.log('\nA. 声明解析（bool / const int / STL 容器）');
  {
    const bfs = instrument(fs.readFileSync(path.join(ROOT, 'samples', '08_bfs_graph.cpp'), 'utf8'), OPTS);
    const V = (n) => bfs.meta.vars.find(v => v.name === n) || {};
    eq(V('g').kind, 'cxx', 'vector<int> g[N] 识别为 C++ 容器');
    eq(V('g').array, '[N]', 'g 带数组维度');
    eq(V('vis').kind, 'ia', 'bool vis[N] 识别为整型数组（bool 进白名单）');
    eq(V('vis').array, '[N]', 'vis 带数组维度');
    eq(V('q').kind, 'cxx', 'queue<int> q 识别为 C++ 容器');
    ok(bfs.code.indexOf('__avc_len("g"') >= 0, '生成 g 的 N/NE 采集语句');
    ok(bfs.code.indexOf('__avc_edge("g"') >= 0, '邻接表按边发 NE');
    ok(bfs.code.indexOf('__avc_vi(_AVC_LINE_', 0) === -1 && /__avc_vi\(\d+,"vis\[0\]"/.test(bfs.code), 'vis 逐元素 V 事件（数组窗可见）');
    ok(bfs.code.indexOf('queue<int> _avc_c = q') >= 0, 'queue 用"拷贝后弹空"读取，不动原容器');
    ok(bfs.code.indexOf('< 16; _avc_u++') >= 0, '顶点上限 32 内且 N=100010 被裁到数组窗上限');
  }

  /* ================= B. STL 8 类容器端到端 ================= */
  console.log('\nB. STL 泛型 dump（samples/09_stl_containers.cpp）');
  const stl = await run('09_stl_containers.cpp', 'cpp', '');
  ok(stl.ok, '插桩版编译成功', stl.stage + ' ' + String(stl.log || '').split('\n')[0]);
  if (stl.ok) {
    const p = stl.parsed;
    eq(stl.ex.exitCode, 0, '运行退出码 0');
    eq(stl.ex.stdout.trim(), '5 3 9 21', '标准输出正确（容器功能未被插桩破坏）');
    const N = (v) => forVar(p, 'N', v);
    eq(N('v').length > 0, true, 'vector → N 事件');
    eq(N('ls').length > 0, true, 'list → N 事件');
    eq(N('st').length > 0, true, 'set → N 事件');
    eq(N('q').length > 0, true, 'queue → N 事件');
    eq(N('sk').length > 0, true, 'stack → N 事件');
    eq(N('pq').length > 0, true, 'priority_queue → N 事件');
    eq(N('mp').length > 0, true, 'map → N 事件');
    const mpIdx = N('mp').map(e => e[2]).sort((a, b) => a - b);
    eq(mpIdx[mpIdx.length - 1], 3, 'map 用键作 idx（最大键 3）');
    const mpVal = N('mp').filter(e => e[2] === 3).pop();
    eq(String(mpVal[3]), '9', 'map 值为键的平方（3→9）');
    const pqTop = N('pq').slice(-3).map(e => String(e[3]));
    eq(pqTop[0], '21', 'priority_queue 依次从堆顶弹出（21 最大）');
    ok(forVar(p, 'M', 'names').length > 0, 'vector<string> 降级为只发 M(len)');
    eq(forVar(p, 'N', 'names').length, 0, '非数值元素不生成 N（不会硬转 (long)）');
    ok(N('v').filter(e => e[2] === 0).length >= 1, '每步 dump 都从 idx=0 重发（会话可整轮替换）');
    ok(N('v').every(e => e[2] < 32), '结点数受 32 上限约束');
  }

  /* ================= C. 邻接表 + 统一图模型 ================= */
  console.log('\nC. 邻接表（samples/08_bfs_graph.cpp）→ N/NE → graph.js / viewport');
  const bfs = await run('08_bfs_graph.cpp', 'cpp', '4 4\n1 2\n1 3\n2 4\n3 4\n1\n');
  ok(bfs.ok, '插桩版编译成功', bfs.stage + ' ' + String(bfs.log || '').split('\n')[0]);
  if (bfs.ok) {
    const p = bfs.parsed;
    eq(bfs.ex.stdout.trim().replace(/\s+/g, ' '), '1 2 3 4', 'BFS 输出正确');
    const NE = forVar(p, 'NE', 'g');
    ok(NE.length > 0, '邻接表发出 NE 边事件');
    ok(NE.every(e => e[4] === 'adj'), '边类型统一为 adj');
    ok(NE.length <= 64 * 40, '边数受每步 64 上限约束（40 步内）');
    ok(forVar(p, 'N', 'q').length > 0, 'queue 发 N 事件');
    ok(forVar(p, 'M', 'g').length > 0, 'g 发 M(len) 元信息');
    const k = kinds(p);
    ok(k.HA > 0 && k.HA <= 2000, 'new/delete 挂钩生效且堆事件封顶 2000', 'HA=' + k.HA);

    const snap = lastSnap(p);
    ok(!!(snap.nxm && snap.nxm.g && snap.nxm.g.length), '会话快照带 nxm（N/NE/M 通道）');
    ok(snap.frames.length >= 1 && snap.frames[0].vars.some(v => /^vis\[/.test(v.name)), 'vis 进入变量表（数组窗可见）');

    const g = AVC.graph.fromSnapshot(snap, 'g', 'graph');
    ok(g && g.nodes.length > 0, 'graph.fromSnapshot 从 N/NE 建图');
    ok(g && g.edges.length > 0, '建出边');
    ok(g && g.stats.nodeCount <= 32, '结点 ≤32');
    eq(g.shape, 'graph', 'shape 保持 graph');

    const cs = AVC.viewport.buildCandidates(snap, []);
    const names = cs.map(c => c.var);
    ok(names.indexOf('g') >= 0, '切换器候选含 g（邻接表）');
    ok(names.indexOf('q') >= 0, '切换器候选含 q（队列）');
    ok(names.indexOf('vis') >= 0, '切换器候选含 vis（标记数组）');
    ok(cs.filter(c => c.var === 'vis')[0].shape === 'seq', 'vis 的 shape = seq');
    ok(cs.every(c => AVC.graph.SHAPES.indexOf(c.shape) >= 0), '所有候选 shape 都在 6 种之内');
  }

  /* ================= D. 会话层"每轮重来"语义（回归：数字冻结/边累积） ================= */
  console.log('\nD. 每轮 dump 重来（截图 bug 回归：结点值冻结 / 边无限累积）');
  if (bfs.ok) {
    const p = bfs.parsed;
    ok(forVar(p, 'M', 'g').some(e => /begin=1/.test(e[2])), 'M 带 begin=1 轮次标记');
    const s = new AVC.session.Session({ events: p.events, structure: null });
    const per = [];
    for (let st = 0; st < s.totalSteps; st++) {
      const snap = s.snapshotAt(st);
      const g = AVC.graph.fromSnapshot(snap, 'g', 'graph');
      per.push(g ? { n: g.nodes.length, e: g.edges.length, vals: g.nodes.map(x => x.value).join(',') } : { n: 0, e: 0, vals: '' });
    }
    ok(per.every(x => x.e <= 8), '任何一步的边数都 ≤8（不跨步累积）',
      'max=' + Math.max(...per.map(x => x.e)));
    const uniqVals = new Set(per.map(x => x.vals));
    ok(uniqVals.size > 2, 'g 的结点值随步变化（不再冻结在首轮）', '不同取值组合=' + uniqVals.size);
    ok(per[0].vals === '' || /^0(,0)*$/.test(per[0].vals), '第 0 步 g 为空或全 0');
    const mid = per[Math.min(per.length - 1, 20)];
    ok(mid.n === 0 || mid.vals.indexOf('2') >= 0 || mid.vals.indexOf('1') >= 0, '中段出现非 0 度数', mid.vals);
    // 队列在 bfs 内应出现元素（此前一直是 0n）
    let qMax = 0;
    for (let st = 0; st < s.totalSteps; st++) {
      const q = AVC.graph.fromSnapshot(s.snapshotAt(st), 'q', 'list');
      if (q) qMax = Math.max(qMax, q.nodes.length);
    }
    ok(qMax > 0, '队列 q 在 BFS 过程中出现元素', 'qMax=' + qMax);
  }

  console.log('\n' + (fail === 0 ? '✅ V2 全绿：' : '❌ 有失败：') + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
