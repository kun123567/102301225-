'use strict';
/**
 * test-m2.js -- M2 验收（node 直接跑，不依赖浏览器）
 *
 * 覆盖：doc / highlight / vmodel / session 四个纯逻辑模块
 * 并且用**真实 trace**（后端 /api/trace，自编编译器插桩产物）验证：
 *   帧栈、变量归属、模拟地址、堆块、链表/树结点、数组聚合、结构体布局
 *
 * 用法：node server/test-m2.js           # 需要 server.js 已在 8770 运行
 */
const path = require('path');
const http = require('http');

const WEB = path.resolve(__dirname, '..', 'web', 'js');
// 让浏览器模块挂到 globalThis 上
global.window = global;
for (const f of ['doc.js', 'highlight.js', 'vmodel.js', 'session.js']) {
  require(path.join(WEB, f));
}
const AVC = global.AVC;

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? '  [' + extra + ']' : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b)); }

/* ---------------- 后端调用 ---------------- */
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
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(c).toString('utf8'))); }
        catch (e) { reject(new Error('非 JSON: ' + Buffer.concat(c).toString('utf8').slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.end(buf);
  });
}
const fs = require('fs');
function sample(name) {
  return fs.readFileSync(path.resolve(__dirname, '..', 'samples', name), 'utf8');
}

/* ---------------- 1. doc.js ---------------- */
function testDoc() {
  console.log('\n[1] doc.js 文档模型');
  const d = AVC.doc.create();
  const f = d.add({ name: 'a.c', text: 'int main(){}' });
  eq(d.files.length, 1, 'add 后 1 个文件');
  eq(d.active().id, f.id, 'add 后自动激活');

  d.setText(f.id, 'int main(){return 0;}');
  ok(f.dirty === true, 'setText 置脏');

  d.markSaved(f.id, f.text);
  ok(f.dirty === false, 'markSaved 清脏');

  const on = d.toggleBreakpoint(f.id, 3);
  ok(on === true && f.breakpoints.has(3), '设置断点');
  d.toggleBreakpoint(f.id, 3);
  ok(f.breakpoints.size === 0, '取消断点');

  d.setCompileResult(f.id, {
    log: 'x', structure: { functions: [] },
    diags: [{ sev: 'error', line: 7, message: 'boom' }, { sev: 'warning', line: 9, message: 'w' }],
  });
  ok(f.errorLines.has(7) && !f.errorLines.has(9), '错误行只收 error 级别');

  const text = 'a\nbb\nccc';
  eq(AVC.doc.lineOf(text, 0), 1, 'lineOf 行首');
  eq(AVC.doc.lineOf(text, 5), 3, 'lineOf 第三行');
  eq(AVC.doc.lineStart(text, 3), 5, 'lineStart 第三行');
}

/* ---------------- 2. highlight.js ---------------- */
function testHighlight() {
  console.log('\n[2] highlight.js 语法高亮');
  const h = AVC.highlight.toHtml('int a = 1; // x < 2\nif (a) printf("hi");', 'c');
  ok(h.includes('tk-kw'), '关键字着色');
  ok(h.includes('tk-num'), '数字着色');
  ok(h.includes('tk-com'), '注释着色');
  ok(h.includes('tk-str'), '字符串着色');
  ok(h.includes('&lt;'), 'HTML 转义（< → &lt;）');
  ok(!h.includes('<script'), '不产生原始标签');

  const cpp = AVC.highlight.toHtml('class Foo { public: int x; };', 'cpp');
  ok(cpp.includes('tk-kw'), 'C++ 关键字着色');
}

/* ---------------- 3. 合成事件：session 状态机 ---------------- */
function testSessionSynthetic() {
  console.log('\n[3] session.js 合成事件（帧栈/变量/堆/地址）');
  // 事件顺序严格模仿 instrument.js 的真实插桩：
  //   进入函数 → E；每条语句 → S 后跟 V…；返回语句 → S 里带 X；函数末尾 → X
  const events = [
    ['E', 1, 'main'],
    ['S', 10], ['V', 10, 'x', 'i', '0'],
    ['S', 11], ['V', 11, 'x', 'i', '1'], ['HA', 1000, 8, 11],
    ['E', 2, 'f'],
    ['S', 20], ['V', 20, 'y', 'i', '7'],
    ['S', 21], ['X', 2],                        // f 的 return 语句
    ['S', 12], ['V', 12, 'x', 'i', '2'], ['HF', 1000, 12],
    ['X', 1],                                   // main 结束
  ];
  const s = AVC.session.create({ events, structure: null });
  eq(s.totalSteps, 5, '总步数 = 5');

  const s0 = s.snapshotAt(0);
  eq(s0.step, 0, '第 0 步');
  eq(s0.line, 10, '第 0 步行号 = 10');
  eq(s0.depth, 1, '第 0 步栈深 = 1');
  eq(s0.frames[0].fn, 'main', '帧名为 main');
  eq(s0.frames[0].vars[0].value, '0', 'x=0');
  eq(s0.frames[0].vars[0].addr, 0, '栈区首个变量地址从 0 起（AnyviewC 语义）');

  const s1 = s.snapshotAt(1);
  eq(s1.heap.length, 1, '第 1 步堆里 1 个块');
  eq(s1.heap[0].state, 'used', '块使用中');

  const s2 = s.snapshotAt(2);          // 已进入 f
  eq(s2.depth, 2, '进入函数后栈深 = 2');
  eq(s2.frames[1].fn, 'f', '第二帧为 f');
  eq(s2.frames[1].base > s2.frames[0].base, true, '子帧 base 高于父帧（栈向高地址）');
  eq(s2.frames[1].vars[0].name, 'y', '子帧里是 y');
  eq(s2.frames[1].vars[0].value, '7', 'y=7');

  const s3 = s.snapshotAt(3);          // f 的 return 语句：X 已生效
  eq(s3.depth, 2, 'return 语句处栈深仍为 2（显示栈按语句起点捕获）');
  eq(s3.frames[1].fn, 'f', 'return 处仍能看到 f 帧');

  const s4 = s.snapshotAt(4);
  eq(s4.frames[0].vars[0].value, '2', 'x=2');
  eq(s4.heap.length, 1, '堆里 1 个块');
  eq(s4.heap[0].state, 'freed', '块已释放');
  ok(s4.heap[0].addr <= AVC.session.HEAP_TOP, '堆地址 ≤ 9996（向低分配）');

  // 回退重建
  const back = s.snapshotAt(1);
  eq(back.step, 1, '回退到第 1 步');
  eq(back.depth, 1, '回退后栈深正确');
  eq(back.frames[0].vars[0].value, '1', '回退后 x=1');
}

/* ---------------- 4. 真实 trace：数组 / 链表 / 树 ---------------- */
async function testRealTrace() {
  console.log('\n[4] 真实 trace（自编编译器插桩）—— 数组');
  const t1 = await post('/api/trace', { code: sample('01_bubble.c'), lang: 'c', maxSteps: 4000 });
  ok(t1.ok, 'bubble 跟踪成功');
  const s1 = AVC.session.create(t1);
  ok(s1.totalSteps > 50, 'bubble 步数 > 50（实际 ' + s1.totalSteps + '）');

  // 找到数组已初始化的步（a[0]=49）
  let snapA = null;
  for (let i = 0; i < s1.totalSteps; i++) {
    const sn = s1.snapshotAt(i);
    const arrs = AVC.vmodel.groupArrays(sn);
    if (arrs.a && arrs.a.cells.length === 8) { snapA = sn; break; }
  }
  ok(!!snapA, '某一步出现完整 8 元素数组 a');
  const arrs = AVC.vmodel.groupArrays(snapA);
  eq(arrs.a.dims[0], 8, 'a 的维度 = 8');
  eq(arrs.a.cells.length, 8, 'a 有 8 个格子');
  eq(arrs.a.twoD, false, 'a 是一维');
  const cell0 = arrs.a.cells[0];
  eq(cell0.name, 'a[0]', '格名 a[0]');
  ok(cell0.i === 0 && typeof cell0.value === 'string', '格子带下标与值');

  const last = s1.snapshotAt(s1.totalSteps - 1);
  const arrsLast = AVC.vmodel.groupArrays(last);
  eq(arrsLast.a.cells.map(c => c.value).join(','), '13,27,38,49,49,65,76,97', '排序完成后数组已有序');

  console.log('\n[5] 真实 trace —— 链表 + 结构体布局');
  const t3 = await post('/api/trace', { code: sample('03_linked_list.c'), lang: 'c', maxSteps: 4000 });
  ok(t3.ok, 'linked_list 跟踪成功');
  const s3 = AVC.session.create(t3);

  let snapL = null;
  for (let i = 0; i < s3.totalSteps; i++) {
    const sn = s3.snapshotAt(i);
    if (sn.lists && sn.lists.head && sn.lists.head.nodes.length === 5) { snapL = sn; break; }
  }
  ok(!!snapL, '某一步 head 链出 5 个结点');
  eq(snapL.lists.head.shape, 'list', '形状为 list');
  eq(snapL.lists.head.nodes[0].key, '50', '首结点键 = 50（头插法）');

  // 结构体布局：Node{ data@0, next@4 }, size 8
  const lay = AVC.vmodel.structLayout(t3.structure);
  ok(!!lay.Node, '解析出 struct Node 布局');
  eq(lay.Node.fields[0].name, 'data', '字段0 = data');
  eq(lay.Node.fields[0].offset, 0, 'data 偏移 0');
  eq(lay.Node.fields[1].name, 'next', '字段1 = next');
  eq(lay.Node.fields[1].offset, 4, 'next 偏移 4');
  eq(lay.Node.size, 8, 'Node 大小 8');

  // 堆：5 次 malloc、最终全部释放
  const heapSnap = s3.snapshotAt(s3.totalSteps - 1);
  eq(heapSnap.heap.length, 5, '堆块数 = 5');
  ok(heapSnap.heap.every(h => h.state === 'freed'), '最终所有块均已释放');

  // VObj（供 linkView 消费）
  const vobj = AVC.vmodel.objFromList('head', snapL, t3.structure, { logical: 'linear' });
  ok(!!vobj, 'objFromList 返回 VObj');
  eq(vobj.kind, 'list', 'VObj.kind = list');
  eq(vobj.children.length, 5, 'VObj 子结点 5 个');
  eq(vobj.children[0].valueText, '50', '首结点值 50');
  ok(vobj.children[0].fields.some(f => f.name === 'data' && f.offset === 0), 'VObj 带字段表（data@0）');
  ok(vobj.children[0].fields.some(f => f.name === 'next' && f.offset === 4), 'VObj 带字段表（next@4）');

  console.log('\n[6] 真实 trace —— 树');
  const t6 = await post('/api/trace', { code: sample('06_bst.c'), lang: 'c', maxSteps: 4000 });
  ok(t6.ok, 'bst 跟踪成功');
  const s6 = AVC.session.create(t6);
  let snapT = null;
  for (let i = 0; i < s6.totalSteps; i++) {
    const sn = s6.snapshotAt(i);
    if (sn.lists && sn.lists.root && sn.lists.root.nodes.length === 7) { snapT = sn; break; }
  }
  ok(!!snapT, '某一步 root 出现 7 个结点');
  eq(snapT.lists.root.shape, 'tree', '形状为 tree');
  const tv = AVC.vmodel.objFromList('root', snapT, t6.structure, { logical: 'tree' });
  eq(tv.kind, 'tree', 'VObj.kind = tree');
  eq(tv.children.length, 7, '树结点 7 个');
  eq(tv.children[0].valueText, '45', '根键 = 45');
  ok(!!tv.children[0].meta.left && !!tv.children[0].meta.right, '根结点有左右子（2i+1/2i+2）');
  eq(tv.children[0].meta.left.valueText, '24', '根的左子 = 24');
  eq(tv.children[0].meta.right.valueText, '53', '根的右子 = 53');

  console.log('\n[7] 候选可视化对象 + 变量观察表');
  const cands = AVC.vmodel.candidates(snapL, t3.structure);
  ok(cands.some(c => c.name === 'head' && c.category === 'list'), '候选里含 head(list)');
  const table = AVC.vmodel.watchTable(snapL, t3.structure);
  ok(table.length > 0, '变量观察表非空');
  ok(table.every(r => typeof r.addr === 'number' && r.addr >= 0), '每个变量都有非负模拟地址');
  // 结构型指针走 dump 通道（L 事件），不出现在 V 变量表里；用静态结构表校验其 tag
  eq(AVC.vmodel.findStructTagOfVar('head', t3.structure), 'Node', 'head 解析出 structTag=Node');
  ok(table.every(r => !/head|q$/.test(r.name) || r.kind === 'ptr'), '指针变量不进标量表（改由 dump 输出）');
}

(async () => {
  console.log('===== M2 验收（doc / highlight / vmodel / session）=====');
  testDoc();
  testHighlight();
  testSessionSynthetic();
  try {
    await testRealTrace();
  } catch (e) {
    fail++;
    failures.push('真实 trace 测试异常：' + e.message);
    console.log('\n  ✗ 真实 trace 测试异常：' + e.message);
  }
  console.log('\n===== 结果 =====');
  console.log('  通过 ' + pass + ' / 失败 ' + fail);
  if (fail) { failures.forEach(f => console.log('   - ' + f)); process.exit(2); }
  process.exit(0);
})();
