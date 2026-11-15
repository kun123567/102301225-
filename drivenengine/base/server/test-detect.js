'use strict';
/**
 * test-detect.js -- D1/D2/D3 验收（node，无需浏览器；D2 需后端在跑）
 *
 * 覆盖：
 *   D1 AST 声明表：typedef / 嵌套模板 / C++ 容器声明 / 多声明符 / 注释不误报 / 结构体字段
 *   D2 堆图判定：链表 / 二叉树 / 带环 / 空结构
 *   D3 仲裁：③>②>①、②推翻①、都无 → none
 * 并且验证「用户那段 BFS 代码」的插桩 trace 是否已能跑通（原 D1 的关键验收）。
 */
const path = require('path');
const http = require('http');
const fs = require('fs');

const WEB = path.resolve(__dirname, '..', 'web', 'js');
global.window = global;
global.document = {
  createElement: () => ({ style: {}, dataset: {}, children: [], setAttribute() {}, appendChild() {}, addEventListener() {} }),
  createElementNS: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  getElementById: () => null, querySelectorAll: () => [],
};
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

for (const f of ['theme.js', 'doc.js', 'highlight.js', 'vmodel.js', 'session.js',
  'memcell.js', 'stackheap.js', 'arrayView.js', 'linkView.js', 'treeView.js',
  'dsCatalog.js', 'ast.js', 'detect.js', 'shape.js', 'arbitrate.js']) {
  require(path.join(WEB, f));
}
const AVC = global.AVC;

let pass = 0, fail = 0;
function ok(c, n, e) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e ? '  [' + e + ']' : '')); } }
function eq(a, b, n) { ok(a === b, n, 'got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b)); }

const PORT = Number(process.env.PORT || 8780);
function post(p, body) {
  const buf = Buffer.from(JSON.stringify(body), 'utf8');
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length } },
      res => { const c = []; res.on('data', d => c.push(d)); res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(c).toString('utf8'))); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.end(buf);
  });
}
const sample = (n) => fs.readFileSync(path.resolve(__dirname, '..', 'samples', n), 'utf8');

/* ---------------- D1 ---------------- */
function testD1() {
  console.log('\n[D1] AST 声明表');

  // 1) typedef 别名
  const p1 = AVC.ast.parse('typedef struct Node *LinkList;\nLinkList head;');
  const d1 = p1.decls.find(d => d.name === 'head');
  ok(!!d1, 'typedef 别名变量被解析出');
  eq(d1 && d1.ptrDepth, 1, 'head 的指针层数 = 1（typedef 展开成功）');
  eq(d1 && d1.structTag, 'Node', 'head 的 structTag = Node');

  // 2) 嵌套模板
  const p2 = AVC.ast.parse('#include <bits/stdc++.h>\nvector<vector<pair<int,int> > > g;');
  const d2 = p2.decls.find(d => d.name === 'g');
  ok(!!d2, '嵌套模板变量被解析出');
  ok(d2 && d2.isTemplate, 'g 被识别为模板类型');

  // 3) C++ 容器声明行判定（插桩 E006 的根因）
  ok(AVC.ast.isDeclLine('queue<int> q;'), 'queue<int> q; 判为声明（不再当语句）');
  ok(AVC.ast.isDeclLine('Stack s;'), '大写别名 Stack s; 判为声明');
  ok(!AVC.ast.isDeclLine('q.push(v);'), 'q.push(v); 不判为声明');

  // 4) 多维数组 + 多声明符
  const p4 = AVC.ast.parse('int N = 10;\nint m[3][4], k, *p;');
  const dm = p4.decls.find(d => d.name === 'm');
  eq(dm && dm.dims.length, 2, 'm 的维数 = 2');
  ok(p4.decls.some(d => d.name === 'k'), '多声明符 k 被解析出');
  ok(p4.decls.some(d => d.name === 'p' && d.ptrDepth === 1), '多声明符 *p 指针层数 = 1');

  // 5) 注释不误报 + 结构体字段 offset
  const p5 = AVC.ast.parse('// vector<int> g[N]\nstruct T { int key; struct T *left, *right; };');
  ok(!p5.decls.some(d => d.name === 'g'), '注释里的声明不误报');
  const st = p5.structs.T;
  ok(!!st, '结构体 T 被解析');
  eq(st && st.fields[0].name, 'key', '字段0 = key');
  eq(st && st.fields[0].offset, 0, 'key offset = 0');
  eq(st && st.fields[1].name, 'left', '字段1 = left');
  eq(st && st.fields[1].offset, 4, 'left offset = 4');
  ok(st && st.fields[1].self, 'left 标记为自引用');

  // 6) detect.js 走 AST 通道识别用户 BFS 代码
  const items = AVC.detect.detect(sample('08_bfs_raw.cpp'));
  ok(items.some(i => i.templateId === 'algraph'), 'BFS 代码识别出邻接表');
  ok(items.some(i => i.templateId === 'linkqueue'), 'BFS 代码识别出队列');
  ok(items.some(i => i.templateId === 'proto-seq'), 'BFS 代码识别出标记数组/一维数组');
  ok(items.some(i => i.source === 'ast'), '至少一条来自 AST 通道');
}

/* ---------------- D2 ---------------- */
function testD2(traces) {
  console.log('\n[D2] 运行时堆图判定');

  // 链表
  const s3 = AVC.session.create(traces.linked);
  let snapL = null;
  for (let i = 0; i < s3.totalSteps; i++) { const sn = s3.snapshotAt(i); if (sn.lists.head && sn.lists.head.nodes.length === 5) { snapL = sn; break; } }
  const rL = AVC.shape.analyze(snapL, traces.linked.structure);
  eq(rL.byVar.head.shape, 'list', '链表 → shape=list');
  ok(rL.byVar.head.conf >= 0.85, '链表置信度 ≥0.85（' + rL.byVar.head.conf + '）');
  ok(rL.graph.nodes >= 5, '图统计结点数 ≥5（实际 ' + rL.graph.nodes + '，head 与 p 各 5 个 dump）');

  // 二叉树
  const s6 = AVC.session.create(traces.bst);
  let snapT = null;
  for (let i = 0; i < s6.totalSteps; i++) { const sn = s6.snapshotAt(i); if (sn.lists.root && sn.lists.root.nodes.length === 7) { snapT = sn; break; } }
  const rT = AVC.shape.analyze(snapT, traces.bst.structure);
  eq(rT.byVar.root.shape, 'btree', '二叉树 → shape=btree');
  ok(rT.byVar.root.evidence.levels >= 3, '层数 ≥3（实际 ' + rT.byVar.root.evidence.levels + '）');

  // 带环（合成）
  const cyc = { lists: { p: { shape: 'list', count: 3, nodes: [
    { idx: 0, key: '1', ptr: 100, more: 1 }, { idx: 1, key: '2', ptr: 200, more: 1 }, { idx: 2, key: '3', ptr: 100, more: 1 },
  ] } }, frames: [], heap: [] };
  eq(AVC.shape.analyze(cyc).byVar.p.shape, 'clist', 'ptr 重复 → shape=clist（有环）');

  // 空结构
  const empty = { lists: { q: { shape: 'list', count: 0, nodes: [] } }, frames: [], heap: [] };
  eq(AVC.shape.analyze(empty).byVar.q.shape, 'unknown', '空结构 → unknown');
}

/* ---------------- D3 ---------------- */
function testD3() {
  console.log('\n[D3] 三层仲裁');
  const rt = { shape: 'list', conf: 0.9, evidence: { reason: 'outDeg≤1 且唯一尾结点' } };
  const ast = { templateId: 'algraph', renderer: 'treeView', conf: 0.96, why: 'AST：vector 数组' };
  const manual = { id: 'proto-dlist', renderer: 'linkView' };

  eq(AVC.arbitrate.arbitrate('v', ast, rt, manual).source, 'manual', '③ 手工指定优先级最高');
  eq(AVC.arbitrate.arbitrate('v', ast, rt, null).source, 'runtime(override ast)', '② 与①冲突时采信运行时并标注');
  eq(AVC.arbitrate.arbitrate('v', ast, { shape: 'list', conf: 0.9 }, null).templateId, 'proto-list', '运行时 list → 模板 proto-list');
  eq(AVC.arbitrate.arbitrate('v', ast, { shape: 'list', conf: 0.5 }, null).source, 'ast', '②置信不足时回落①');
  eq(AVC.arbitrate.arbitrate('v', null, null, null).source, 'none', '三层皆无 → none');
  const same = AVC.arbitrate.arbitrate('v', { templateId: 'proto-list', conf: 0.7 }, rt, null);
  eq(same.source, 'ast+runtime', '①与②一致 → ast+runtime');
  eq(AVC.arbitrate.badge('runtime').text, '运行时', '徽标文案');
}

/* ---------------- 关键回归：BFS 代码插桩 --------------- */
async function testBfsTrace() {
  console.log('\n[回归] 用户 BFS 代码的插桩跟踪（原 D1 的关键验收）');
  const code = sample('08_bfs_raw.cpp');
  const t = await post('/api/trace', { code, lang: 'cpp', stdin: '4 4\n1 2\n1 3\n2 4\n3 4\n1\n', maxSteps: 4000 });
  ok(t.ok === true, '插桩 trace 成功（不再是"回退普通编译"）', t.ok ? '' : (t.log || '').slice(0, 120));
  if (t.ok) {
    ok(t.steps > 20, '步数 > 20（实际 ' + t.steps + '）');
    const s = AVC.session.create(t);
    const snap = s.snapshotAt(Math.floor(s.totalSteps * 0.7));
    const shape = AVC.shape.analyze(snap, t.structure);
    console.log('    运行时图统计：' + shape.summary);
  }
}

(async () => {
  console.log('===== D1/D2/D3 验收 =====');
  testD1();
  const mk = async (name, stdin) => post('/api/trace', { code: sample(name), lang: name.endsWith('.cpp') ? 'cpp' : 'c', stdin: stdin || '', maxSteps: 4000 });
  const traces = {
    linked: await mk('03_linked_list.c'),
    bst: await mk('06_bst.c'),
  };
  testD2(traces);
  testD3();
  try { await testBfsTrace(); } catch (e) { fail++; console.log('  ✗ BFS 回归异常：' + e.message); }
  console.log('\n===== 结果 =====');
  console.log('  通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 2 : 0);
})();
