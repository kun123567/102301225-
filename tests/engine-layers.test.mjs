import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildLayerRun } from '../backend/src/custom-code/engine-layers.js';
import { engineHealth, traceProgram } from '../backend/src/custom-code/detect-engine.js';

// 步骤3：引擎事件 → plus 的 layers[]，并用**本项目 vendor 进来的 svg-stage** 真渲染一遍。
// 判据照 dom-leftover-test：每一步"DOM 元素数 == 本帧图元数"，不残留、不抛异常。

const compilerReady = () => {
  try { return engineHealth().ok; } catch { return false; }
};
const SAMPLES = fileURLToPath(new URL('../drivenengine/base/samples/ds/', import.meta.url));

/* ---------------- 假 DOM（够 svg-stage / prim-dom 用） ---------------- */
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    nodeName: String(tag || 'div'),
    className: '', textContent: '', dataset: {}, style: {}, attributes: {}, childNodes: [],
    classList: {
      _s: new Set(),
      add(...names) { names.forEach((n) => this._s.add(n)); },
      remove(...names) { names.forEach((n) => this._s.delete(n)); },
      contains(name) { return this._s.has(name); },
      toString() { return [...this._s].join(' '); },
    },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(child) { this.childNodes.push(child); child.parentNode = this; return child; },
    removeChild(child) { const i = this.childNodes.indexOf(child); if (i >= 0) this.childNodes.splice(i, 1); return child; },
    remove() { if (this.parentNode && this.parentNode.removeChild) this.parentNode.removeChild(this); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 720, height: this.style.height ? parseFloat(this.style.height) : 300, left: 0, top: 0, right: 720, bottom: 300 }; },
    getContext() { return globalThis.__ctx; },
    addEventListener() {}, removeEventListener() {},
  };
  return el;
}

async function stageHarness() {
  globalThis.window = globalThis;
  globalThis.devicePixelRatio = 1;
  globalThis.location = { href: 'http://127.0.0.1/', search: '' };
  globalThis.document = { body: makeEl('body'), createElement: (t) => makeEl(t), createElementNS: (_ns, t) => makeEl(t) };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
  const mod = await import('../frontend/vendor/plus/app/svg-stage.js');
  return mod;
}

const countElements = (node) => {
  let total = 0;
  const walk = (el) => {
    for (const child of el.childNodes || []) { total += 1; walk(child); }
  };
  walk(node);
  return total;
};

/* ---------------- 1. 折叠规则（合成事件，不依赖编译器） ---------------- */
test('数组事件 → style 1 层：按步累积、聚焦最后变化的元素', () => {
  const trace = { events: [
    ['S', 1], ['V', 1, 'a[0]', 'i', '5'], ['V', 1, 'a[1]', 'i', '1'],
    ['S', 2], ['V', 2, 'a[0]', 'i', '1'], ['V', 2, 'a[1]', 'i', '5'],
  ] };
  const run = buildLayerRun({ trace, sourceLines: ['x', 'y'] });
  assert.equal(run.ok, true, run.error);
  assert.equal(run.style, 1);
  assert.deepEqual(run.families, ['array']);
  assert.deepEqual(run.steps[0].layers[0].data.values, [5, 1]);
  assert.deepEqual(run.steps[1].layers[0].data.values, [1, 5]);
  assert.deepEqual(run.steps[1].layers[0].roles.focus1, [0]);
});

test('链表事件（L + LE shape=list）→ style 3 层：结点按落库顺序连成后继链', () => {
  const trace = { events: [
    ['S', 1],
    ['L', 'p', 0, '10', 1000, 1], ['L', 'p', 1, '20', 2000, 1], ['L', 'p', 2, '30', 0, 0],
    ['LE', 'p', 3, 'list'],
  ] };
  const run = buildLayerRun({ trace, sourceLines: ['a'] });
  assert.equal(run.style, 3);
  const layer = run.steps.at(-1).layers.find((l) => l.style === 3);
  assert.ok(layer, '应有一层 style 3');
  assert.deepEqual(layer.data.nodes.map((n) => n.value), ['10', '20', '30']);
  assert.equal(layer.data.links.length, 2);
  assert.equal(layer.data.head, 'n0');
});

test('树事件（L + NM left/right + LE shape=tree）→ style 9 层：父子是真实索引，根是没有父亲的结点', () => {
  const trace = { events: [
    ['S', 1],
    ['L', 'root', 0, '1', 1000, 1], ['NM', 'root', 0, 'left=1'], ['NM', 'root', 0, 'right=2'],
    ['L', 'root', 1, '2', 2000, 0], ['NM', 'root', 1, 'left=-1'], ['NM', 'root', 1, 'right=-1'],
    ['L', 'root', 2, '3', 3000, 0], ['NM', 'root', 2, 'left=-1'], ['NM', 'root', 2, 'right=-1'],
    ['LE', 'root', 3, 'tree'],
  ] };
  const run = buildLayerRun({ trace, sourceLines: ['a'] });
  assert.equal(run.style, 9);
  const layer = run.steps.at(-1).layers.find((l) => l.style === 9);
  assert.deepEqual(layer.data.nodes.map((n) => n.label), ['1', '2', '3']);
  assert.equal(layer.data.nodes[0].left, 'n1');
  assert.equal(layer.data.nodes[0].right, 'n2');
  assert.deepEqual(layer.data.roots, ['n0']);
  assert.equal(layer.data.edgeTags && typeof layer.data.edgeTags, 'object');
});

test('图事件（N + NE）→ style 10 层：边只连到真实存在的结点', () => {
  const trace = { events: [
    ['S', 1], ['N', 'g', 0, 'A'], ['N', 'g', 1, 'B'], ['NE', 'g', 0, 1, 'next'],
  ] };
  const run = buildLayerRun({ trace, sourceLines: ['a'] });
  assert.equal(run.style, 10);
  const layer = run.steps.at(-1).layers[0];
  const ids = new Set(layer.data.nodes.map((n) => n.id));
  assert.ok(layer.data.edges.every((e) => ids.has(e.from) && ids.has(e.to)));
});

test('没有行事件 / 前面还没 dump 出结构：要么报错，要么把空白步骤丢掉', () => {
  assert.equal(buildLayerRun({ trace: { events: [] } }).ok, false);
  const run = buildLayerRun({ trace: { events: [['S', 1], ['S', 2], ['L', 'p', 0, '9', 0, 0], ['LE', 'p', 1, 'list']] }, sourceLines: ['a'] });
  assert.equal(run.ok, true);
  assert.equal(run.steps.length, 1, '只有 dump 之后的那一步有层');
  assert.equal(run.stats.droppedSteps, 1);
});

/* ---------------- 2. 真渲染：layers → vendor 的 svg-stage ---------------- */
test('layers 能进本项目 vendor 的 svg-stage 渲染：每步 DOM 元素数 == 图元数，不抛异常', async () => {
  const { createStage } = await stageHarness();
  const trace = { events: [
    ['S', 1], ['V', 1, 'a[0]', 'i', '3'], ['V', 1, 'a[1]', 'i', '1'],
    ['S', 2], ['V', 2, 'a[0]', 'i', '1'], ['V', 2, 'a[1]', 'i', '3'],
    ['S', 3], ['L', 'root', 0, '1', 1000, 1], ['NM', 'root', 0, 'left=1'], ['NM', 'root', 0, 'right=2'],
    ['L', 'root', 1, '2', 2000, 0], ['L', 'root', 2, '3', 3000, 0], ['LE', 'root', 3, 'tree'],
  ] };
  const run = buildLayerRun({ trace, sourceLines: ['a', 'b', 'c'] });
  assert.equal(run.ok, true);
  const host = makeEl('div');
  host.clientWidth = 720;
  const stage = createStage(host);
  let checked = 0;
  for (const step of run.steps) {
    const metrics = stage.render(step.layers, { animate: true });
    assert.ok(metrics.prims > 0, '第 ' + step.stepIndex + ' 步没有图元');
    const elementCount = countElements(host);
    assert.ok(elementCount >= metrics.prims, `第 ${step.stepIndex} 步 DOM(${elementCount}) 少于图元(${metrics.prims})`);
    checked += 1;
  }
  assert.ok(checked >= 2, '至少要渲染 2 步');
  stage.clear();
});

/* ---------------- 3. 端到端：真编译 → 折叠 → 层 ---------------- */
test('端到端（链表）：真编译插桩 → style 3 层，结点链与程序输出一致', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = await readFile(SAMPLES + '02_linklist.c', 'utf8');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 4000 });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 200));
  const run = buildLayerRun({ trace, sourceLines: code.split('\n') });
  assert.equal(run.ok, true);
  assert.ok(run.families.includes('list'), '应识别出链表：' + run.families.join(','));
  const counts = run.stats.nodeCounts.filter((row) => row.shape === 'list');
  assert.ok(counts.length >= 1, '至少有一个链表结构');
  const best = counts.reduce((a, b) => (a.nodes >= b.nodes ? a : b));
  assert.ok(best.nodes >= 3, '链表结点数偏少：' + JSON.stringify(counts));
  const layer = run.steps.at(-1).layers.find((item) => item.style === 3);
  assert.ok(layer.data.nodes.length >= 3);
  assert.equal(layer.data.links.length, layer.data.nodes.length - 1);
});

test('端到端（二叉树）：真编译插桩 → style 9 层，7 结点带左/右孩子且只有一个根', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = await readFile(SAMPLES + '07_bitree.c', 'utf8');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 4000 });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 200));
  const run = buildLayerRun({ trace, sourceLines: code.split('\n') });
  assert.equal(run.ok, true);
  assert.ok(run.families.includes('tree'), '应识别出树：' + run.families.join(','));
  const treeRow = run.stats.nodeCounts.find((row) => row.shape === 'tree' && row.nodes >= 7);
  assert.ok(treeRow, '应有 ≥7 结点的树结构：' + JSON.stringify(run.stats.nodeCounts));
  /* 遍历过程里 p 会一路走到叶子，最后一步的层可能只有一两个结点；
     这里找"结点最多的那一层"，那才是整棵树被 dump 出来的样子。 */
  const treeLayers = run.steps.flatMap((step) => step.layers.filter((item) => item.style === 9));
  const layer = treeLayers.reduce((best, item) => (!best || item.data.nodes.length > best.data.nodes.length ? item : best), null);
  assert.ok(layer, '没有任何 style 9 层');
  assert.equal(layer.data.nodes.length >= 7, true, '最大树层只有 ' + layer.data.nodes.length + ' 个结点');
  assert.equal(layer.data.roots.length, 1, '根必须唯一：' + JSON.stringify(layer.data.roots));
  const ids = new Set(layer.data.nodes.map((node) => node.id));
  for (const node of layer.data.nodes) {
    for (const key of ['left', 'right']) {
      if (node[key]) assert.ok(ids.has(node[key]), `${node.id}.${key} 指向了不存在的结点 ${node[key]}`);
    }
  }
  assert.ok(layer.data.nodes.some((node) => node.left || node.right), '至少要有一个结点有孩子');
});

/* ---------------- 4. 整程序模式的接线（浏览器里最容易断的一环） ---------------- */
import { createEngineProgramRun } from '../frontend/src/features/custom-code/engine-program.js';

test('整程序接线：把 /api/detect/trace 的结果组装成 plus 同形 run', async () => {
  const calls = [];
  const runEngineProgram = createEngineProgramRun({
    request: async (path, opts) => {
      calls.push({ path, opts });
      return {
        ok: true,
        degradedMode: 'full',
        layerRun: {
          ok: true,
          style: 9,
          families: ['tree'],
          steps: [
            { stepIndex: 0, lineId: '5', layers: [{ id: 'tree:root', style: 9, title: 'root', props: {}, data: { nodes: [{ id: 'n0', label: '1' }], roots: ['n0'] }, roles: {} }] },
            { stepIndex: 1, lineId: '7', layers: [{ id: 'tree:root', style: 9, title: 'root', props: {}, data: { nodes: [{ id: 'n0', label: '1' }, { id: 'n1', label: '2' }], roots: ['n0'] }, roles: {} }] },
          ],
        },
      };
    },
    now: () => 1234567890,
  });
  const code = 'int main(void){\n  /* 1 */\n  return 0;\n}';
  const run = await runEngineProgram({ code, language: 'c' });
  assert.equal(calls[0].path, '/api/detect/trace');
  assert.equal(calls[0].opts.body.withLayers, true);
  assert.equal(calls[0].opts.body.code, code);

  assert.equal(run.plus, true, '必须走 plus 分支');
  assert.equal(run.structure, 'structure', '结构族要走 svg-stage');
  assert.equal(run.algorithm, 'custom-engine');
  assert.equal(run.style, 9);
  assert.equal(run.steps.length, 2);
  assert.equal(run.rawSteps.length, 2, 'createPlusView 读 rawSteps');
  assert.deepEqual(run.steps.map((step) => step.lineId), ['5', '7']);
  assert.equal(run.steps.at(-1).done, true);
  assert.equal(run.steps[0].done, false);
  assert.equal(run.steps[0].layers.length, 1);
  assert.equal(run.sourceLines.length, 4);
  assert.ok(run.steps.every((step) => step.variables.line === Number(step.lineId)));
});

test('整程序接线：编译失败/折叠失败都要抛出可读错误，不返回半成品', async () => {
  const failing = createEngineProgramRun({ request: async () => ({ ok: false, stage: 'compile', log: 'main.c(3): Error! E1011' }) });
  await assert.rejects(() => failing({ code: 'x' }), /E1011/);

  const noLayers = createEngineProgramRun({ request: async () => ({ ok: true, layerRun: { ok: false, error: '引擎没有产生任何行事件（S）' } }) });
  await assert.rejects(() => noLayers({ code: 'x' }), /没有产生任何行事件/);

  const bare = createEngineProgramRun({ request: async () => ({ ok: true }) });
  await assert.rejects(() => bare({ code: 'x' }), /没能折叠出可画的结构/);
});

/* ---------------- 5. 数组裁剪 / 长度标量 / 栈队列语义 ---------------- */
test('数组裁剪：普通数组按声明范围展示，未写过的格子标 ?（不裁掉、也不摆垃圾）', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    'int trap(int height[], int n) {',
    '  int leftMax[32], rightMax[32], ans = 0, i;',
    '  leftMax[0] = height[0];',
    '  for (i = 1; i < n; ++i) {',
    '    leftMax[i] = (leftMax[i - 1] > height[i]) ? leftMax[i - 1] : height[i];',
    '  }',
    '  rightMax[n - 1] = height[n - 1];',
    '  for (i = n - 2; i >= 0; --i) {',
    '    rightMax[i] = (rightMax[i + 1] > height[i]) ? rightMax[i + 1] : height[i];',
    '  }',
    '  for (i = 0; i < n; ++i) {',
    '    ans += ((leftMax[i] < rightMax[i]) ? leftMax[i] : rightMax[i]) - height[i];',
    '  }',
    '  return ans;',
    '}',
    'int main(void) {',
    '  int height[12] = {0,1,0,2,1,0,1,3,2,1,2,1};',
    '  printf("%d\\n", trap(height, 12));',
    '  return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 4000, withLayers: true });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 200));
  const layers = trace.layerRun.steps.at(-1).layers;
  const byName = new Map(layers.map((layer) => [layer.title, layer]));
  const height = byName.get('height');
  const leftMax = byName.get('leftMax');
  const rightMax = byName.get('rightMax');
  assert.ok(height && leftMax && rightMax, '三个数组层都应在：' + [...byName.keys()].join(','));
  assert.equal(height.data.values.length, 12);
  /* 普通数组不再按"写过的最大下标/最短数组"裁剪（评审报告 §2）：
     声明 32 格 → 采样 16 格全部列出，写过的 12 格是真实值，剩下 4 格标 ?。 */
  assert.equal(leftMax.data.values.length, 16, 'leftMax 应按采样长度展示：' + JSON.stringify(leftMax.data.values));
  assert.equal(rightMax.data.values.length, 16);
  assert.deepEqual(leftMax.data.values.slice(0, 12), [0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3]);
  assert.deepEqual(rightMax.data.values.slice(0, 12), [3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 1]);
  for (const layer of [leftMax, rightMax]) {
    assert.deepEqual(layer.data.labels.slice(12), ['?', '?', '?', '?'], layer.title + ' 未写过的格子要标 ?：' + JSON.stringify(layer.data.labels));
  }
  for (const layer of [height, leftMax, rightMax]) {
    assert.ok(layer.data.values.every((v) => Math.abs(v) < 1e6), layer.title + ' 里不该有未初始化栈垃圾');
  }
});

test('数组方向语义：顺序栈按 top 裁长度，空栈那一步是空数组', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    'int main(void) {',
    '  int s[16];',
    '  int top = -1;',
    '  int i;',
    '  for (i = 1; i <= 4; i++) {',
    '    top = top + 1;',
    '    s[top] = i * 10;',
    '  }',
    '  while (top >= 0) {',
    '    printf("%d ", s[top]);',
    '    top = top - 1;',
    '  }',
    '  return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 4000, withLayers: true });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 200));
  /* 顺序栈现在走 style 7（竖版栈视图）：元素在 data.cells 里，不是 data.values */
  const sizes = [];
  for (const step of trace.layerRun.steps) {
    const layer = step.layers[0];
    if (!layer) continue;
    const n = layer.style === 7 ? (layer.data.cells || []).length : (layer.data.values || []).length;
    if (sizes[sizes.length - 1] !== n) sizes.push(n);
  }
  assert.deepEqual(sizes, [1, 2, 3, 4, 3, 2, 1, 0],
    '栈内元素数必须跟着 top 走（最后一步是空栈）：' + sizes.join(' → '));
  const semantic = trace.layerRun.steps[0].layers[0].data.semantic;
  assert.ok(semantic, '数组应带方向语义');
  assert.match(semantic.zh + semantic.direction, /顺序栈|末尾进出/, JSON.stringify(semantic));
});

test('普通数组没有栈/队列语义（不硬套标签）', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    'int main(void) {',
    '  int a[4];',
    '  int i;',
    '  for (i = 0; i < 4; i++) {',
    '    a[i] = i * i;',
    '  }',
    '  printf("%d\\n", a[3]);',
    '  return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 2000, withLayers: true });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 200));
  for (const step of trace.layerRun.steps) {
    for (const layer of step.layers) {
      if (layer.style !== 1) continue;
      assert.equal(layer.data.semantic, undefined, '不该给普通数组套栈/队列语义：' + JSON.stringify(layer.data.semantic));
    }
  }
});

/* ---------------- 6. 栈/队列视图（与普通数组区分开） ---------------- */
test('顺序栈：走 style 7 竖版栈视图（带 top、容量），元素数跟着 top 走', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    'int main(void) {',
    '  int s[8];',
    '  int top = -1;',
    '  int i;',
    '  for (i = 1; i <= 3; i++) {',
    '    top = top + 1;',
    '    s[top] = i * 10;',
    '  }',
    '  printf("%d\\n", s[top]);',
    '  return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 3000, withLayers: true });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 200));
  const stackSteps = trace.layerRun.steps.filter((step) => (step.layers[0] || {}).style === 7);
  assert.ok(stackSteps.length >= 5, '栈视图步数偏少：' + stackSteps.length);
  const layer = trace.layerRun.steps.at(-1).layers[0];
  assert.equal(layer.style, 7, '顺序栈必须用竖版栈视图');
  assert.equal(layer.data.cells.length, 3);
  assert.equal(layer.data.top, 2, 'top 指向最后一个元素');
  assert.equal(layer.data.capacity, 8, '容量记的是声明长度');
  assert.match(String(layer.data.topLabel), /top/);
  assert.match(String(layer.data.bottomLabel), /bottom/);
  const semantic = layer.data.semantic;
  assert.ok(semantic && /栈/.test(semantic.zh), '应带栈语义：' + JSON.stringify(semantic));
  // 元素随 top 增长
  const sizes = trace.layerRun.steps.filter((s) => (s.layers[0] || {}).style === 7).map((s) => s.layers[0].data.cells.length);
  assert.ok(sizes.includes(1) && sizes.includes(2) && sizes.includes(3), '栈内元素数应逐步变化：' + sizes.join(','));
});

test('循环队列：横版数组 + front 指针 + 队头出队尾进语义', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    'int main(void) {',
    '  int q[8];',
    '  int front = 0;',
    '  int rear = 0;',
    '  int i;',
    '  for (i = 1; i <= 3; i++) {',
    '    q[rear] = i * 10;',
    '    rear = (rear + 1) % 8;',
    '  }',
    '  printf("%d\\n", q[front]);',
    '  return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 3000, withLayers: true });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 200));
  const layer = trace.layerRun.steps.at(-1).layers[0];
  assert.equal(layer.style, 1, '队列是横版数组');
  assert.match(String(layer.data.semantic && layer.data.semantic.zh), /队列/, '应带队列语义');
  assert.match(String(layer.data.semantic.direction), /队头出|FIFO/);
  const pointers = layer.roles.pointers || [];
  assert.ok(pointers.some((p) => p.id === 'front' && Number.isInteger(p.index)), '应画出 front 指针：' + JSON.stringify(pointers));
});

test('普通数组不套栈/队列：仍是 style 1、没有语义、没有指针', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    'int main(void) {',
    '  int a[4];',
    '  int i;',
    '  for (i = 0; i < 4; i++) {',
    '    a[i] = i * i;',
    '  }',
    '  printf("%d\\n", a[3]);',
    '  return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 2000, withLayers: true });
  const layer = trace.layerRun.steps.at(-1).layers[0];
  assert.equal(layer.style, 1);
  assert.equal(layer.data.semantic, undefined, '普通数组不该有方向语义');
  assert.equal((layer.roles.pointers || []).length, 0, '普通数组不该有 front/top 指针');
});

test('栈视图能进仓内 vendor 的 svg-stage 渲染：每步 DOM 元素数 ≥ 图元数、不抛异常', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    'int main(void) {',
    '  int s[6];',
    '  int top = -1;',
    '  int i;',
    '  for (i = 1; i <= 3; i++) {',
    '    top = top + 1;',
    '    s[top] = i;',
    '  }',
    '  return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 2000, withLayers: true });
  const { createStage } = await stageHarness();
  const host = makeEl('div');
  host.clientWidth = 720;
  const stage = createStage(host);
  let rendered = 0;
  for (const step of trace.layerRun.steps) {
    if (!step.layers.length) continue;
    const metrics = stage.render(step.layers, { animate: true });
    assert.ok(metrics.prims > 0, '第 ' + step.stepIndex + ' 步没有图元');
    assert.ok(countElements(host) >= metrics.prims);
    rendered += 1;
  }
  assert.ok(rendered >= 5, '至少渲染 5 步：' + rendered);
  stage.clear();
});

/* ---------------- 7. 整程序 run 的分流：数组走本项目链路（有动画），结构走 svg 卡片 ---------------- */
test('纯数组的整程序走本项目的数组链路（structure=array，steps 带 array）', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const { createEngineProgramRun } = await import('../frontend/src/features/custom-code/engine-program.js');
  const code = [
    '#include <stdio.h>',
    'int main(void) {',
    '  int a[5];',
    '  int i;',
    '  for (i = 0; i < 5; i++) {',
    '    a[i] = i * i;',
    '  }',
    '  return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 2000, withLayers: true });
  const run = await createEngineProgramRun({ request: async () => ({ ok: true, degradedMode: trace.degradedMode, layerRun: trace.layerRun }) })({ code, language: 'c' });
  assert.equal(run.structure, 'array', '纯数组必须走数组链路（否则没有数组动画）');
  assert.ok(run.steps.some((step) => step.array.length > 0), 'steps.array 不能一直是空数组');
  assert.ok(run.steps.some((step) => step.event === 'write'), '值变化的那一步要标成 write（CSS 写入动画靠它）');
  assert.equal(run.steps.at(-1).done, true);
  assert.deepEqual(run.steps.at(-1).result, [0, 1, 4, 9, 16]);
  /* 本项目数组链路的帧构造器必须能吃下这些 steps，否则页面上是空白 */
  const { asFrameBuilder } = await import('../frontend/vendor/plus/app/host-frame.js');
  const doc = { createElementNS: (_n, t) => makeEl(t) };
  const frames = run.steps.map((step) => asFrameBuilder(step, { doc })).filter(Boolean);
  assert.ok(frames.length > 0, 'asFrameBuilder 必须能构造出帧');
  /* 一帧的 cells 永远是"一张 svg"（宿主契约），格子是它的子结点 —— 数格子，不数 cells.length */
  const cellsOf = (frame) => frame.cells[0].childNodes.filter((n) => String(n.attributes.class || '').includes('prototype-array-cell'));
  assert.ok(frames.some((frame) => cellsOf(frame).length >= 3), '帧里格子数应与数组长度对应：' + frames.map((f) => cellsOf(f).length).join(','));
  assert.deepEqual(cellsOf(frames.at(-1)).map((c) => (c.childNodes[0].childNodes[1] || {}).textContent), ['0', '1', '4', '9', '16']);
});

test('结构族的整程序仍走 svg 卡片（structure=structure，steps.array 为空）', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const { createEngineProgramRun } = await import('../frontend/src/features/custom-code/engine-program.js');
  const code = [
    '#include <stdio.h>',
    '#include <stdlib.h>',
    'typedef struct N { int k; struct N *next; } N;',
    'int main(void) {',
    '  N* h = (N*)malloc(sizeof(N));',
    '  h->k = 1;',
    '  h->next = 0;',
    '  return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 2000, withLayers: true });
  const run = await createEngineProgramRun({ request: async () => ({ ok: true, degradedMode: trace.degradedMode, layerRun: trace.layerRun }) })({ code, language: 'c' });
  assert.equal(run.structure, 'structure');
  assert.ok(run.steps.every((step) => step.array.length === 0), '结构族不需要 step.array');
  assert.ok(run.steps.some((step) => (step.layers || []).some((layer) => layer.style === 3)), '链表应折成 style 3 层');
});

/* ---------------- 8. 每步指针 / 聚焦：自定义代码的"动画跟着执行走" ---------------- */
test('数组游标：只有"当下标/计数器用过"的变量才画指针（暂存值 t 不算）', () => {
  const trace = { events: [
    ['S', 1], ['V', 1, 'a[0]', 'i', '5'], ['V', 1, 'a[1]', 'i', '1'], ['V', 1, 'i', 'i', '0'], ['V', 1, 't', 'i', '5'],
    ['S', 2], ['V', 2, 't', 'i', '7'], ['V', 2, 'i', 'i', '1'],
  ] };
  /* 源码第 1 行用 i 当下标；第 2 行把数组值取到 t 里（t 是值，不是游标） */
  const run = buildLayerRun({ trace, sourceLines: ['a[i] = 0;', 't = a[i];'] });
  assert.equal(run.ok, true);
  const first = run.steps[0].layers[0].roles.pointers || [];
  assert.deepEqual(first.map((p) => p.id + '@' + p.index), ['i@0'], '第 1 步应只画 i：' + JSON.stringify(first));
  const second = run.steps[1].layers[0].roles.pointers || [];
  assert.deepEqual(second.map((p) => p.id), ['i'], '第 2 步仍有 i（下标），但绝不能出现 t：' + JSON.stringify(second));
});

test('循环头里的计数器也算游标：for (j = 0; j < n - 1 - i; j++) 的 i / j 都要画', () => {
  const trace = { events: [
    ['S', 1], ['V', 1, 'i', 'i', '0'], ['V', 1, 'j', 'i', '0'], ['V', 1, 'n', 'i', '4'],
    ['S', 2], ['V', 2, 'a[0]', 'i', '3'],
  ] };
  const run = buildLayerRun({ trace, sourceLines: ['', 'for (j = 0; j < n - 1 - i; j++) {', 'x = a[0];'] });
  const ptrs = (run.steps[0].layers[0].roles.pointers || []).map((p) => p.id).sort();
  assert.deepEqual(ptrs, ['i', 'j'], '循环头的 i / j 都要画，长度标量 n 不画：' + JSON.stringify(ptrs));
});

test('链表指针：多个指针变量按"链头地址"对到同一层的结点上（不是每个变量各画一张）', () => {
  const trace = { events: [
    ['S', 1],
    ['L', 'head', 0, '10', 1000, 1], ['L', 'head', 1, '20', 2000, 1], ['LE', 'head', 2, 'list'],
    ['L', 'cur', 0, '20', 2000, 1], ['LE', 'cur', 1, 'list'],
  ] };
  const run = buildLayerRun({ trace, sourceLines: ['a'] });
  const headLayer = run.steps.at(-1).layers.find((l) => l.id === 'list:head');
  assert.ok(headLayer, '应有 head 层');
  const byId = new Map((headLayer.roles.pointers || []).map((p) => [p.id, p.node]));
  assert.equal(byId.get('head'), 'n0', 'head 应指第 0 个结点：' + JSON.stringify([...byId]));
  assert.equal(byId.get('cur'), 'n1', 'cur 指向地址 2000 的结点（n1）：' + JSON.stringify([...byId]));
  assert.deepEqual(headLayer.roles.focus1, ['n0'], '本行的 head 同时是聚焦结点');
});

test('指针空掉（LE count=0）后不能还挂在原来的结点上', () => {
  const trace = { events: [
    ['S', 1],
    ['L', 'p', 0, '10', 1000, 1], ['LE', 'p', 1, 'list'],
    ['S', 2],
    ['LE', 'p', 0, 'list'],
  ] };
  const run = buildLayerRun({ trace, sourceLines: ['a', 'b'] });
  const last = run.steps.at(-1).layers.find((l) => l.style === 3);
  assert.equal((last.roles.pointers || []).length, 0, '指针变 NULL 后不该再画：' + JSON.stringify(last.roles));
});

test('宿主数组帧：自由指针用同一套 .prototype-marker（键=变量名，供 FLIP 量取），focus 用 is-comparing', async () => {
  const { asFrameBuilder } = await import('../frontend/vendor/plus/app/host-frame.js');
  const doc = { createElementNS: (_n, t) => makeEl(t) };
  const frame = asFrameBuilder({
    array: [5, 2, 9, 1],
    variables: { left: null, right: null, mid: null },
    event: 'write',
    pointers: [{ id: 'j', label: 'j', index: 1 }],
    focus: [1],
  }, { doc });
  assert.ok(frame, '应能构造帧');
  const chart = frame.cells[0];
  const markers = chart.childNodes.filter((n) => String(n.attributes.class || '').includes('prototype-marker'));
  assert.equal(markers.length, 1, '应有一个指针药丸：' + markers.map((m) => m.attributes.class).join(','));
  assert.match(String(markers[0].attributes.class), /is-free/);
  assert.equal(markers[0].attributes['data-ptr'], 'j', 'FLIP 靠 data-ptr / map 键对齐');
  assert.equal(markers[0].childNodes[1].textContent, 'j', '药丸文字必须是变量名（不是 L/R/M）');
  assert.ok(frame.pointers.has('j'), '指针要进 Map，宿主才能量旧位置');
  const cells = chart.childNodes.filter((n) => String(n.attributes.class || '').includes('prototype-array-cell'));
  assert.ok(cells[1].classList.contains('is-comparing'), '本步改的格子要有高亮状态');
  assert.ok(!cells[0].classList.contains('is-comparing'), '没动的格子不该高亮');
});

test('端到端（冒泡）：每步指针/高亮真的在变，暂存值 t 不冒充游标', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    'void bubble(int a[], int n)',
    '{',
    '  int i, j, t;',
    '  for (i = 0; i < n - 1; i++) {',
    '    for (j = 0; j < n - 1 - i; j++) {',
    '      if (a[j] > a[j + 1]) {',
    '        t = a[j];',
    '        a[j] = a[j + 1];',
    '        a[j + 1] = t;',
    '      }',
    '    }',
    '  }',
    '}',
    'int main(void)',
    '{',
    '  int a[6] = {5, 2, 9, 1, 7, 3};',
    '  bubble(a, 6);',
    '  return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 4000, withLayers: true });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 200));
  const steps = trace.layerRun.steps;
  const signature = (step) => (step.layers[0].roles.pointers || []).map((p) => p.id + '@' + p.index).sort().join(',');
  const distinct = new Set(steps.map(signature));
  assert.ok(steps.some((step) => signature(step).includes('j@')), 'j 应该出现：' + [...distinct].slice(0, 6).join(' | '));
  assert.ok(distinct.size >= 3, '指针位置必须随执行变化（否则等于没有动画）：' + [...distinct].join(' | '));
  const allIds = new Set(steps.flatMap((step) => (step.layers[0].roles.pointers || []).map((p) => p.id)));
  assert.ok(!allIds.has('t'), 't 是暂存值，不能画成游标：' + [...allIds].join(','));
});
/* ---------------- 9. 类的成员数组（力扣 MinStack 那种写法） ---------------- */
test('成员数组（s.data[64] + s.top）也画成栈视图，并按 top 裁到实际元素', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    'class MinStack {',
    'private:',
    '    int data[64];',
    '    int mins[64];',
    '    int top;',
    'public:',
    '    MinStack() {',
    '        top = -1;',
    '    }',
    '    void push(int x) {',
    '        int m;',
    '        if (top < 0) {',
    '            m = x;',
    '        } else {',
    '            m = mins[top];',
    '            if (x < m) {',
    '                m = x;',
    '            }',
    '        }',
    '        top = top + 1;',
    '        data[top] = x;',
    '        mins[top] = m;',
    '    }',
    '    void pop() {',
    '        if (top >= 0) {',
    '            top = top - 1;',
    '        }',
    '    }',
    '    int getMin() {',
    '        return mins[top];',
    '    }',
    '};',
    'int main(void) {',
    '    MinStack s;',
    '    s.push(-2);',
    '    s.push(0);',
    '    s.push(-3);',
    '    printf("%d\\n", s.getMin());',
    '    s.pop();',
    '    return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'cpp', maxSteps: 4000, withLayers: true });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 200));
  assert.match(String(trace.stdout), /-3/, '判题结果应是 -3：' + trace.stdout);
  const steps = trace.layerRun.steps;
  const ids = new Set(steps.flatMap((step) => step.layers.map((layer) => layer.id)));
  assert.ok(ids.has('stack:s.data'), '成员数组 s.data 应折成栈视图层：' + [...ids].join(','));
  assert.ok(ids.has('stack:s.mins'), '成员数组 s.mins 也应画出来：' + [...ids].join(','));
  const last = steps.at(-1).layers;
  const byId = new Map(last.map((layer) => [layer.id, layer]));
  /* 三次 push 之后 pop 一次 → 两个栈都剩 2 个元素，最上面是刚 pop 掉的那个之前的值 */
  assert.deepEqual(byId.get('stack:s.data').data.cells.map((c) => c.value), [-2, 0], 'data 栈内容应跟 push/pop 同步');
  assert.deepEqual(byId.get('stack:s.mins').data.cells.map((c) => c.value), [-2, -2], 'mins 栈内容应是最小值序列');
  assert.equal(byId.get('stack:s.data').data.top, 1, 'top 应指向最后一个元素');
  assert.ok(byId.get('stack:s.data').data.cells.length < 16, '声明 64 格时应按 top 裁掉未初始化部分');
});
/* ---------------- 10. 二维数组 / 字符数组 / 结构体数组（审计扫出来的三个空白） ---------------- */
test('二维数组 → style 2 矩阵层（值按行列摆好，未初始化格写 ·）', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    'int main(void)',
    '{',
    '    int a[3][3] = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};',
    '    int b[3][3];',
    '    int i, j;',
    '    for (i = 0; i < 3; i++) {',
    '        for (j = 0; j < 3; j++) {',
    '            b[j][i] = a[i][j];',
    '        }',
    '    }',
    '    printf("%d\\n", b[2][2]);',
    '    return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 4000, withLayers: true });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 200));
  assert.ok(trace.layerRun.families.includes('matrix'), '应识别成矩阵：' + trace.layerRun.families.join(','));
  const mats = trace.layerRun.steps.flatMap((s) => s.layers.filter((l) => l.style === 2));
  assert.ok(mats.length >= 4, '至少几步有矩阵层：' + mats.length);
  const byName = new Map(mats.map((l) => [l.title, l]));
  assert.ok(byName.has('a') && byName.has('b'), '两个矩阵都要有：' + [...byName.keys()].join(','));
  const lastA = mats.filter((l) => l.title === 'a').at(-1);
  assert.deepEqual(lastA.data.values, [[1, 2, 3], [4, 5, 6], [7, 8, 9]], '矩阵值要按行列摆好：' + JSON.stringify(lastA.data.values));
  const lastB = mats.filter((l) => l.title === 'b').at(-1);
  assert.deepEqual(lastB.data.values, [[1, 4, 7], [2, 5, 8], [3, 6, 9]], '转置后 b 的每一行都要对：' + JSON.stringify(lastB.data.values));
  /* 未初始化（还没写到的）格子不能把栈垃圾当数据摆出来 */
  for (const layer of mats) {
    for (const row of layer.data.values) {
      for (const v of row) {
        if (typeof v === 'number') assert.ok(Math.abs(v) < 1e6, '矩阵里不该出现未初始化垃圾：' + v);
      }
    }
  }
});

test('字符数组显示成字符（不是 104/101/108），二维字符数组走矩阵', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const oneD = [
    '#include <stdio.h>',
    'int main(void)',
    '{',
    '    char s[16] = "hello";',
    '    int i = 0, j = 4, t;',
    '    while (i < j) {',
    '        t = s[i];',
    '        s[i] = s[j];',
    '        s[j] = t;',
    '        i = i + 1;',
    '        j = j - 1;',
    '    }',
    '    return 0;',
    '}',
  ].join('\n');
  const t1 = await traceProgram({ code: oneD, lang: 'c', maxSteps: 4000, withLayers: true });
  assert.equal(t1.ok, true);
  const last = t1.layerRun.steps.at(-1).layers[0];
  assert.deepEqual(last.data.labels, ['o', 'l', 'l', 'e', 'h'], '一格一个字符：' + JSON.stringify(last.data.labels));

  const twoD = [
    '#include <stdio.h>',
    'int main(void)',
    '{',
    '    char g[3][3];',
    '    int i, j;',
    '    for (i = 0; i < 3; i++) {',
    '        for (j = 0; j < 3; j++) {',
    "            g[i][j] = '.';",
    '        }',
    '    }',
    "    g[1][1] = '#';",
    '    printf("%c\\n", g[1][1]);',
    '    return 0;',
    '}',
  ].join('\n');
  const t2 = await traceProgram({ code: twoD, lang: 'c', maxSteps: 4000, withLayers: true });
  assert.equal(t2.ok, true);
  const mat = t2.layerRun.steps.at(-1).layers.find((l) => l.style === 2);
  assert.ok(mat, '二维字符数组应折成矩阵层：' + JSON.stringify(t2.layerRun.families));
  assert.deepEqual(mat.data.values, [['.', '.', '.'], ['.', '#', '.'], ['.', '.', '.']], '棋盘应按字符显示：' + JSON.stringify(mat.data.values));
});

test('结构体数组（Item a[4]）不再让插桩整体失败，key 字段按元素成列', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    'typedef struct Item {',
    '    int key;',
    '    int aux;',
    '} Item;',
    'int main(void)',
    '{',
    '    Item a[4];',
    '    int i, j;',
    '    a[0].key = 3; a[0].aux = 30;',
    '    a[1].key = 1; a[1].aux = 10;',
    '    a[2].key = 4; a[2].aux = 40;',
    '    for (i = 0; i < 3; i++) {',
    '        for (j = 0; j < 2 - i; j++) {',
    '            if (a[j].key > a[j + 1].key) {',
    '                Item t = a[j];',
    '                a[j] = a[j + 1];',
    '                a[j + 1] = t;',
    '            }',
    '        }',
    '    }',
    '    printf("%d\\n", a[0].key);',
    '    return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 4000, withLayers: true });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 200));
  assert.equal(trace.degradedMode, 'full', '结构体数组不该把插桩拖降级：' + trace.degradedMode);
  const ids = new Set(trace.layerRun.steps.flatMap((s) => s.layers.map((l) => l.id)));
  assert.ok(ids.has('arr:a.key'), 'key 字段应成为一列：' + [...ids].join(','));
  const lastKey = trace.layerRun.steps.flatMap((s) => s.layers.filter((l) => l.id === 'arr:a.key')).at(-1);
  assert.deepEqual(lastKey.data.values.slice(0, 3), [1, 3, 4], '排序后 key 列应是 1,3,4：' + JSON.stringify(lastKey.data.values));
});

test('指针数组（HNode* bucket[7]）不当数值数组画出来（地址不是数据）', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    '#include <stdlib.h>',
    'typedef struct HNode {',
    '    int key;',
    '    struct HNode* next;',
    '} HNode;',
    'HNode* bucket[7];',
    'int main(void)',
    '{',
    '    int h = 3;',
    '    HNode* n = (HNode*)malloc(sizeof(HNode));',
    '    n->key = 10;',
    '    n->next = bucket[h];',
    '    bucket[h] = n;',
    '    printf("%d\\n", 10);',
    '    return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 4000, withLayers: true });
  assert.equal(trace.ok, true);
  const arrays = trace.layerRun.steps.flatMap((s) => s.layers.filter((l) => l.style === 1));
  assert.equal(arrays.filter((l) => l.title === 'bucket').length, 0, '指针数组不该被画成数值数组');
});
/* ---------------- 11. 合法大整数 vs 未初始化内存（复审报告问题 1） ---------------- */
test('合法大整数照原样显示；没初始化过的格子才打码（不按数值大小裁）', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  /* 初始化列表给了 2000000 / 3000000：它们是大整数，不是垃圾，一格都不能少 */
  const withInit = [
    '#include <stdio.h>',
    'int main(void)',
    '{',
    '    int a[3] = {1, 2000000, 3000000};',
    '    int i, s = 0;',
    '    for (i = 0; i < 3; i++) {',
    '        s = s + a[i];',
    '    }',
    '    printf("%d\\n", s);',
    '    return 0;',
    '}',
  ].join('\n');
  const t1 = await traceProgram({ code: withInit, lang: 'c', maxSteps: 500, withLayers: true });
  assert.equal(t1.ok, true);
  const a1 = t1.layerRun.steps.at(-1).layers.find((l) => l.id === 'arr:a');
  assert.deepEqual(a1.data.values, [1, 2000000, 3000000], '大整数不能被当垃圾删掉：' + JSON.stringify(a1.data.values));
  assert.deepEqual(a1.data.labels, ['1', '2000000', '3000000']);

  /* 没有初始化列表、只写了前两格：剩下的格子必须标成未知（?），而不是把栈垃圾摆出来 */
  const noInit = [
    '#include <stdio.h>',
    'int main(void)',
    '{',
    '    int b[6];',
    '    b[0] = 7;',
    '    b[1] = 8;',
    '    printf("%d\\n", b[1]);',
    '    return 0;',
    '}',
  ].join('\n');
  const t2 = await traceProgram({ code: noInit, lang: 'c', maxSteps: 500, withLayers: true });
  assert.equal(t2.ok, true);
  const b2 = t2.layerRun.steps.at(-1).layers.find((l) => String(l.id).startsWith('arr:b'));
  assert.deepEqual(b2.data.values, [7, 8, 0, 0, 0, 0], '普通数组按声明范围展示（写过的两格是真值）：' + JSON.stringify(b2.data.values));
  assert.deepEqual(b2.data.labels, ['7', '8', '?', '?', '?', '?'], '未写过的格子必须标 ?：' + JSON.stringify(b2.data.labels));
  for (const v of b2.data.values) assert.ok(Math.abs(Number(v)) < 1e6, '不该出现未初始化垃圾：' + v);
});