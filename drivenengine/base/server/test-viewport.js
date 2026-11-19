'use strict';
/**
 * test-viewport.js -- V1 验收（纯 node，无需后端）
 *
 * 覆盖 PLAN_VIEWPORT §0.2 契约：
 *   A. graph.js  ：N/E/M → {nodes,edges,meta,stats}；形状登记表 26项→6 shape
 *   B. 候选组装  ：仲裁结论 ∪ 运行时数据，去重、排序、hasData 标记
 *   C. viewport  ：切换器枚举 / 只按 shape 分派渲染器 / 无数据时给可读提示
 */
const path = require('path');
const WEB = path.resolve(__dirname, '..', 'web', 'js');

/* ---------------- 迷你 DOM（只够 viewport 用） ---------------- */
function mkEl(tag) {
  const el = {
    tagName: tag, children: [], style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
    _html: '', _on: {},
    set innerHTML(v) { this._html = v; this.children.length = 0; },
    get innerHTML() { return this._html; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(t, fn) { (this._on[t] = this._on[t] || []).push(fn); },
    setAttribute() {}, removeAttribute() {}, querySelector: () => null,
    trigger(t) { (this._on[t] || []).forEach(f => f()); },
  };
  return el;
}
const store = {};
global.window = global;
global.document = {
  createElement: mkEl,
  createElementNS: () => mkEl('svg'),
  getElementById: () => null,
  querySelectorAll: () => [],
};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

for (const f of ['theme.js', 'doc.js', 'vmodel.js', 'memcell.js', 'stackheap.js', 'arrayView.js',
  'linkView.js', 'treeView.js', 'dsCatalog.js', 'shape.js', 'graph.js', 'arbitrate.js', 'viewport.js']) {
  require(path.join(WEB, f));
}
const AVC = global.AVC;
const G = AVC.graph;

let pass = 0, fail = 0;
function ok(c, n, e) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e ? '  [' + e + ']' : '')); } }
function eq(a, b, n) { ok(a === b, n, 'got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b)); }

/* ---------------- 测试用快照 ---------------- */
function listSnap() {
  return {
    frames: [{ fn: 'main', depth: 1, vars: [{ name: 'a[0]', kind: 'int', value: '1' }, { name: 'a[1]', kind: 'int', value: '2' }] }],
    lists: {
      head: { shape: 'list', count: 3, nodes: [{ idx: 0, key: 10 }, { idx: 1, key: 20 }, { idx: 2, key: 30 }] },
      T: { shape: 'tree', count: 3, nodes: [{ idx: 0, key: 5 }, { idx: 1, key: 3 }, { idx: 2, key: 8 }] },
    },
    heap: [], heapCursor: 100,
  };
}

/* ================= A. graph.js ================= */
console.log('\nA. graph.js（N/E/M → 图模型）');
{
  const g = G.fromEvents([
    ['N', 'head', 0, 10], ['N', 'head', 1, 20], ['N', 'head', 2, 30],
    ['E', 'head', 0, 1, 'next'], ['E', 'head', 1, 2, 'next'],
    ['M', 'head', 'len=3;kind=sll'],
    ['N', 'other', 0, 99],
  ], 'head', 'list');
  eq(g.nodes.length, 3, 'fromEvents 只收本变量的 N');
  eq(g.edges.length, 2, 'fromEvents 收 E');
  eq(g.meta.len, '3', 'M 事件进 meta');
  eq(g.stats.cyclic, false, '无环');
  eq(g.stats.roots.join(','), '0', '唯一根 0');
  eq(g.nodes[0].value, '10', 'N 值保真');
}
{
  const g = G.fromEvents([
    ['N', 'g', 0, 'A'], ['N', 'g', 1, 'B'], ['N', 'g', 2, 'C'],
    ['E', 'g', 0, 1, 'next'], ['E', 'g', 1, 2, 'next'], ['E', 'g', 2, 0, 'next'],
  ], 'g', 'graph');
  eq(g.stats.cyclic, true, 'E 成环 → cyclic');
  eq(g.stats.edgeCount, 3, '边计数');
}
{
  const g = G.fromEvents([
    ['N', 'T', 0, 5], ['N', 'T', 1, 3], ['N', 'T', 2, 8],
    ['E', 'T', 0, 1, 'left'], ['E', 'T', 0, 2, 'right'],
  ], 'T', 'tree');
  eq(g.edges.filter(e => e.kind === 'left').length, 1, 'left 边');
  eq(g.edges.filter(e => e.kind === 'right').length, 1, 'right 边');
  eq(g.nodes[0].meta.out, 2, '出度统计进 node.meta');
}
{
  const g = G.fromSnapshot(listSnap(), 'head', 'list');
  eq(g.edges.length, 2, 'fromSnapshot 链式自动补 i→i+1');
  eq(g.meta.count, '3', 'count 进 meta');
}
{
  const g = G.fromSnapshot(listSnap(), 'T', 'tree');
  eq(g.edges.length, 2, 'fromSnapshot 树补 2 条边');
  eq(g.edges.map(e => e.kind).sort().join(','), 'left,right', '树的边 kind');
}
eq(G.fromSnapshot(listSnap(), 'nope', 'list'), null, '无该变量 → null');
{
  const g = G.fromArray({ name: 'a', dims: [2], cells: [{ i: 0, j: null, value: '1' }, { i: 1, j: null, value: '2' }] });
  eq(g.shape, 'seq', 'fromArray → seq');
  eq(g.nodes.length, 2, 'seq 结点数');
  ok(G.describe(g).indexOf('结点') >= 0, 'describe 有内容');
}
{
  const m = { sqstack: 'stack', heap: 'heap', sqlist: 'list', algraph: 'graph', ptree: 'tree', ufset: 'tree', hashtab: 'list', 'proto-seq': 'seq', sqqueue: 'list' };
  let bad = [];
  for (const k in m) if (G.shapeFromCatalog(k) !== m[k]) bad.push(k + '→' + G.shapeFromCatalog(k) + '(want ' + m[k] + ')');
  ok(bad.length === 0, 'shapeFromCatalog：26 项 → 6 shape', bad.join(' '));
  eq(G.shapeFromCatalog('不存在的模板'), null, '未知模板 → null');
  ok(AVC.dsCatalog.ITEMS.length === 26, '目录 26 条（25 DB + 并查集拆分）');
}

/* ================= B. 候选组装 ================= */
console.log('\nB. buildCandidates（仲裁 ∪ 运行时）');
{
  const snap = listSnap();
  const arb = [
    { name: 'head', templateId: 'proto-list', source: 'runtime', conf: 0.9 },
    { name: 'q', templateId: 'linkqueue', source: 'ast', conf: 0.92 },     // 静态识别、本步无数据
    { name: 'T', templateId: 'proto-bitree', source: 'ast+runtime', conf: 0.95 },
  ];
  const cs = AVC.viewport.buildCandidates(snap, arb);
  eq(cs.length, 4, 'head/T + a(数组) + q = 4 项（head/T 已仲裁不重复）');
  eq(cs.find(c => c.var === 'head').shape, 'list', 'proto-list → list');
  eq(cs.find(c => c.var === 'T').shape, 'tree', 'proto-bitree → tree');
  eq(cs.find(c => c.var === 'q').hasData, false, '静态项 hasData=false');
  eq(cs.find(c => c.var === 'a').shape, 'seq', '数组自动补 seq 候选');
  eq(cs.filter(c => c.hasData)[0].hasData, true, '有数据的排前面');
  eq(cs[cs.length - 1].var, 'q', '无数据项排末尾');
}

/* ================= C. viewport 渲染分派 ================= */
console.log('\nC. viewport（切换器 + 只按 shape 分派）');
{
  const calls = [];
  AVC.linkView.paint = (h, v, p) => calls.push(['linkView', v.meta.shape]);
  AVC.treeView.render = (h, v) => calls.push(['treeView', v.meta.shape]);
  AVC.arrayView.render1D = () => calls.push(['arrayView', 'seq']);
  AVC.arrayView.render2D = () => calls.push(['arrayView', 'seq2d']);
  AVC.stackheap.renderDSStack = () => calls.push(['dsStack', 'stack']);

  const host = mkEl('div');
  const vp = AVC.viewport.create({ host });
  const snap = listSnap();
  const arb = [
    { name: 'head', templateId: 'proto-list', source: 'runtime', conf: 0.9 },
    { name: 'T', templateId: 'proto-bitree', source: 'ast+runtime', conf: 0.95 },
  ];
  const cs = AVC.viewport.buildCandidates(snap, arb);
  vp.setCandidates(cs);

  const pick = host.children[0].children[0];
  eq(pick.tagName, 'select', '视窗内自绘切换器');
  eq(pick.children.length, cs.length, '选项数 = 候选数');
  eq(pick.children[0].value, cs[0].var, '首项为默认选中');
  ok(/shape:/.test(host.children[0].children[1].textContent), '标题栏显示 shape');

  // 候选项按「有数据 > 来源优先级」排序，'T'(ast+runtime) 排在 'head'(runtime) 之前；
  // 这里显式选链表项，验证 list → linkView
  pick.value = 'head'; pick.trigger('change');
  calls.length = 0;
  vp.update(snap);
  eq(calls.length, 1, 'update 只画一次');
  eq(calls[0][0], 'linkView', 'list → linkView');
  eq(calls[0][1], 'list', 'shape 传到渲染器');

  // 切到树
  calls.length = 0;
  pick.value = 'T'; pick.trigger('change');
  eq(calls[0][0], 'treeView', 'tree → treeView');
  eq(vp.getActive(), 'T', 'getActive 跟随切换');

  // 切到数组（seq）
  calls.length = 0;
  pick.value = 'a'; pick.trigger('change');
  eq(calls[0][0], 'arrayView', 'seq → arrayView');
  eq(calls[0][1], 'seq', '一维数组 → seq');

  // 无数据项：不崩、给提示
  const host2 = mkEl('div');
  const vp2 = AVC.viewport.create({ host: host2 });
  vp2.setCandidates([{ var: 'q', shape: 'list', label: 'q', source: 'ast', conf: 0.9, hasData: false }]);
  calls.length = 0;
  vp2.update(snap);
  const canvas = host2.children[1];
  ok(/无|空/.test(canvas.innerHTML), '无数据 → 可读提示而非抛错', canvas.innerHTML);
  eq(calls.length, 0, '无数据不调用渲染器');

  // 空候选
  const host3 = mkEl('div');
  const vp3 = AVC.viewport.create({ host: host3 });
  vp3.setCandidates([]);
  ok(/F8|尚无可视化结构/.test(host3.children[1].innerHTML), '空候选 → 引导文案');

  // 预设 shape 覆盖（③手工改画法）
  const host4 = mkEl('div');
  const vp4 = AVC.viewport.create({ host: host4 });
  vp4.setCandidates(AVC.viewport.buildCandidates(snap, [{ name: 'head', templateId: 'proto-list', source: 'runtime', conf: 0.9 }]));
  vp4.update(snap);
  calls.length = 0;
  vp4.setShape('head', 'graph');
  eq(calls[0][0], 'linkView', 'graph 走 linkView');
  eq(calls[0][1], 'graph', 'shape 覆盖生效');
  ok(store['avc.viewports'] && JSON.parse(store['avc.viewports']).items.head.shape === 'graph', '预设写入 localStorage');
}

/* ================= D. 前端接线一致性 ================= */
console.log('\nD. 前端接线（防止"缺一个 DOM 元素 → 整个 boot 静默失效"）');
{
  const fsReal = require('fs');
  const html = fsReal.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  /* dsPick：结构窗切换器已改由 viewport.js 自绘，代码里保留了判空引用，故允许不存在 */
  const allowMissing = new Set(['dsPick']);
  const dir = path.join(__dirname, '..', 'web', 'js');
  const missing = [];
  for (const f of fsReal.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    const t = fsReal.readFileSync(path.join(dir, f), 'utf8');
    const refs = [...t.matchAll(/\$\(\s*'#([A-Za-z0-9_-]+)'/g)].map(m => m[1])
      .concat([...t.matchAll(/getElementById\(\s*'([A-Za-z0-9_-]+)'/g)].map(m => m[1]));
    for (const id of new Set(refs)) {
      if (!ids.has(id) && !allowMissing.has(id)) missing.push(f + ' → #' + id);
    }
  }
  ok(missing.length === 0, 'JS 里 $(\'#id\') 引用的元素都能在 index.html 找到', missing.join(', '));

  const app = fsReal.readFileSync(path.join(dir, 'app.js'), 'utf8');
  ok(/const dsPickEl = \$\('#dsPick'\)/.test(app), '#dsPick 已判空（不再是裸 addEventListener）');
  ok(/catch \(e\) \{[\s\S]{0,120}演示区控件装配失败/.test(app), '演示区控件装配有 try/catch 兜底');
  ok(html.indexOf('id="dsPick"') === -1, 'index.html 不再有 #dsPick（切换器在视窗内自绘）');
  const scripts = [...html.matchAll(/src="js\/([^"]+)\.js"/g)].map(m => m[1]);
  const files = fsReal.readdirSync(dir).filter(x => x.endsWith('.js')).map(x => x.replace(/\.js$/, ''));
  const notLoaded = files.filter(f => scripts.indexOf(f) === -1);
  ok(notLoaded.length === 0, 'web/js 下每个模块都被 index.html 引入', notLoaded.join(', '));
  const order = { 'graph.js': 1, 'viewport.js': 1, 'app.js': 1 };
  ok(scripts.indexOf('app') === scripts.length - 1, 'app.js 最后加载');
  ok(scripts.indexOf('graph') < scripts.indexOf('viewport') && scripts.indexOf('viewport') < scripts.indexOf('app'),
    '加载顺序 graph → viewport → app');
}

console.log('\n' + (fail === 0 ? '✅ V1 全绿：' : '❌ 有失败：') + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
