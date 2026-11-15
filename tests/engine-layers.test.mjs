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
