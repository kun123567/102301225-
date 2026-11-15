'use strict';
/**
 * test-m3.js -- M3 渲染器冒烟测试（node + 极简 DOM shim，不需要浏览器）
 *
 * 目的：用**真实 trace 快照**驱动 5 个渲染器，抓 undefined 引用/拼写错误/结构性崩溃。
 * 断言的是"渲染器跑通且产出节点"，不是像素。
 */
const path = require('path');
const http = require('http');
const fs = require('fs');

/* ---------------- 极简 DOM shim ---------------- */
function mkNode(tag) {
  const n = {
    tagName: tag,
    children: [],
    style: { cssText: '', setProperty() {}, },
    dataset: {},
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { on ? this._s.add(c) : this._s.delete(c); } }, contains(c) { return this._s.has(c); } },
    attrs: {},
    _text: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html || ''; },
    set innerHTML(v) { this._html = String(v); this.children = []; },
  };
  return n;
}
const root = mkNode('html');
global.document = {
  documentElement: root,
  createElement: (t) => mkNode(t),
  createElementNS: (ns, t) => mkNode(t),
  createTextNode: (t) => { const n = mkNode('#text'); n.textContent = t; return n; },
};

global.window = global;
const WEB = path.resolve(__dirname, '..', 'web', 'js');
for (const f of ['theme.js', 'doc.js', 'highlight.js', 'vmodel.js', 'session.js',
  'memcell.js', 'stackheap.js', 'arrayView.js', 'linkView.js', 'treeView.js']) {
  require(path.join(WEB, f));
}
const AVC = global.AVC;

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  [' + extra + ']' : '')); }
}
function countNodes(n) {
  let c = 1;
  for (const k of (n.children || [])) c += countNodes(k);
  return c;
}

const PORT = Number(process.env.PORT || 8770);
function post(p, body) {
  const buf = Buffer.from(JSON.stringify(body), 'utf8');
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: p, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length },
    }, res => {
      const c = [];
      res.on('data', d => c.push(d));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(c).toString('utf8'))); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end(buf);
  });
}
const sample = (n) => fs.readFileSync(path.resolve(__dirname, '..', 'samples', n), 'utf8');

(async () => {
  console.log('===== M3 渲染器冒烟测试 =====');

  console.log('\n[1] theme.js 配色（BGR → CSS）');
  // 注意：0x00FFFF00 在 Delphi 里是 clAqua（青），报告 10_COLOR_INI.md 标注为"黄"有误
  ok(AVC.theme.css('MemNode') === '#00ffff', 'MemNode 16776960(BGR) → #00ffff 青（=Delphi clAqua）');
  ok(AVC.theme.css('MemFrame') === '#0000ff', 'MemFrame 16711680 → #0000ff 蓝');
  ok(AVC.theme.css('MemFocus') === '#ff0000', 'MemFocus 255 → #ff0000 红');
  ok(AVC.theme.css('ArrOneGrid') === '#808080', 'ArrOneGrid 8421504 → #808080 灰');
  ok(typeof AVC.theme.stepInterval() === 'number' && AVC.theme.stepInterval() > 0, '速度三档 → 帧间隔');
  AVC.theme.apply();

  console.log('\n[2] memcell 单元格原语');
  const attr = AVC.memcell.DEFAULT_ATTR();
  ok(attr.max === 10000, '默认地址上界 = 10000（MaxMemory）');
  const c1 = AVC.memcell.cellEl({ addr: 8, name: 'x', value: '42', state: 'node' }, attr);
  ok(c1.children.length === 3, '单元格三段：名 / 地址 / 值');
  ok(AVC.memcell.inRange({ addr: 8 }, attr) === true, '地址 8 在范围内');
  ok(AVC.memcell.inRange({ addr: 99999 }, attr) === false, '地址 99999 越界（不绘制）');
  const host0 = mkNode('div');
  const shown = AVC.memcell.render(host0, [
    { addr: 0, name: 'a', value: '1', state: 'node' },
    { addr: 4, name: 'b', value: '2', state: 'focus' },
    { addr: 20000, name: 'z', value: '3', state: 'node' },
  ], attr);
  ok(shown === 2, '越界单元被跳过（画 2 个）');

  console.log('\n[3] 数组数组窗（真实 trace）');
  const t1 = await post('/api/trace', { code: sample('01_bubble.c'), lang: 'c', maxSteps: 4000 });
  ok(t1.ok, 'bubble 跟踪成功');
  const s1 = AVC.session.create(t1);
  let snapArr = null;
  for (let i = 0; i < s1.totalSteps; i++) {
    const sn = s1.snapshotAt(i);
    const a = AVC.vmodel.groupArrays(sn);
    if (a.a && a.a.cells.length === 8) { snapArr = sn; break; }
  }
  ok(!!snapArr, '取到 8 元素数组的某一步');
  const arr = AVC.vmodel.groupArrays(snapArr).a;

  const hostA = mkNode('div');
  AVC.arrayView.render1D(hostA, arr, { shape: 0, showGrid: true, showLine: false });
  ok(countNodes(hostA) > 20, '一维矩形框+网格：产出 SVG 节点（' + countNodes(hostA) + '）');

  const hostA2 = mkNode('div');
  AVC.arrayView.render1D(hostA2, arr, { shape: 1, showGrid: false, showLine: true, focus: ['a[0]', 'a[1]'] });
  ok(countNodes(hostA2) > 15, '一维点+连线+双焦点：产出节点（' + countNodes(hostA2) + '）');

  console.log('\n[4] 二维数组三种模式');
  const t5 = await post('/api/trace', { code: sample('05_matrix.c'), lang: 'c', maxSteps: 4000 });
  ok(t5.ok, 'matrix 跟踪成功');
  const s5 = AVC.session.create(t5);
  let snap2d = null;
  for (let i = 0; i < s5.totalSteps; i++) {
    const sn = s5.snapshotAt(i);
    const a = AVC.vmodel.groupArrays(sn);
    const k = Object.keys(a).find(x => a[x].twoD);
    if (k) { snap2d = { snap: sn, arr: a[k] }; break; }
  }
  ok(!!snap2d, '取到二维数组（' + (snap2d ? snap2d.arr.dims.join('×') : '') + '）');
  for (const mode of ['bar', 'surface', 'sparse']) {
    const h = mkNode('div');
    let threw = null;
    try { AVC.arrayView.render2D(h, snap2d.arr, { mode }); } catch (e) { threw = e.message; }
    ok(!threw && countNodes(h) > 3, '二维 ' + mode + ' 渲染通过' + (threw ? '：' + threw : ''));
  }

  console.log('\n[5] 栈 / 堆（三种语义）');
  const hostS = mkNode('div');
  AVC.stackheap.renderStack(hostS, snapArr, t1.structure, { prev: [] });
  ok(countNodes(hostS) > 5, '运行栈：活动记录渲染（' + countNodes(hostS) + ' 节点）');

  const hostH = mkNode('div');
  AVC.stackheap.renderHeapBlocks(hostH, s1.snapshotAt(s1.totalSteps - 1));
  ok(countNodes(hostH) >= 1, '动态分配堆：块表渲染');

  const hostDS = mkNode('div');
  AVC.stackheap.renderDSStack(hostDS, snapArr, t1.structure, {});
  ok(countNodes(hostDS) > 3, '数据结构栈（SqStack）：渲染（' + countNodes(hostDS) + ' 节点）');

  console.log('\n[6] 链表 2D（三段式 + 4 边 + 折线 + 箭头）');
  const t3 = await post('/api/trace', { code: sample('03_linked_list.c'), lang: 'c', maxSteps: 4000 });
  const s3 = AVC.session.create(t3);
  let snapL = null;
  for (let i = 0; i < s3.totalSteps; i++) {
    const sn = s3.snapshotAt(i);
    if (sn.lists.head && sn.lists.head.nodes.length === 5) { snapL = sn; break; }
  }
  ok(!!snapL, '取到 5 结点链表');
  const vobjL = AVC.vmodel.objFromList('head', snapL, t3.structure, { logical: 'linear' });
  const boxes = AVC.linkView.layout(vobjL, { gap: 20 });
  ok(boxes.length === 5, 'layout 产出 5 个结点框');
  ok(boxes[1].x > boxes[0].x, '结点按 x 递增排列');
  const hostL = mkNode('div');
  let threwL = null;
  try { AVC.linkView.paint(hostL, vobjL, {}); } catch (e) { threwL = e.message; }
  ok(!threwL && countNodes(hostL) > 20, '链表 paint 通过（' + countNodes(hostL) + ' 节点）' + (threwL ? '：' + threwL : ''));

  console.log('\n[7] 树（可折叠 DOM，不自绘）+ 堆树形');
  const t6 = await post('/api/trace', { code: sample('06_bst.c'), lang: 'c', maxSteps: 4000 });
  const s6 = AVC.session.create(t6);
  let snapT = null;
  for (let i = 0; i < s6.totalSteps; i++) {
    const sn = s6.snapshotAt(i);
    if (sn.lists.root && sn.lists.root.nodes.length === 7) { snapT = sn; break; }
  }
  ok(!!snapT, '取到 7 结点树');
  const vobjT = AVC.vmodel.objFromList('root', snapT, t6.structure, { logical: 'tree' });
  const hostT = mkNode('div');
  let threwT = null;
  try { AVC.treeView.render(hostT, vobjT, {}); } catch (e) { threwT = e.message; }
  ok(!threwT && countNodes(hostT) > 3, '树 DOM 渲染通过（' + countNodes(hostT) + ' 节点）' + (threwT ? '：' + threwT : ''));

  const hostHT = mkNode('div');
  let threwHT = null;
  try { AVC.treeView.paintHeapTree(hostHT, arr); } catch (e) { threwHT = e.message; }
  ok(!threwHT && AVC.dsView && typeof AVC.dsView.paintHeapTree === 'function',
    '堆树形（i→2i+1/2i+2）通过，且 AVC.dsView.paintHeapTree 已挂载');

  console.log('\n===== 结果 =====');
  console.log('  通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 2 : 0);
})().catch(e => { console.error('异常：', e); process.exit(1); });
