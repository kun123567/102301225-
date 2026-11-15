import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CUSTOM_SAMPLES, customSample, loadCustomSample } from '../frontend/src/features/custom-code/samples.js';
import { engineHealth, traceProgram } from '../backend/src/custom-code/detect-engine.js';
import { buildLayerRun } from '../backend/src/custom-code/engine-layers.js';
import { runCustomCodeWithEngine } from '../backend/src/custom-code/runner.js';

// 步骤4：网上取的真实自定义代码样例 —— 元数据、原样性（sha256）、端到端（编译→插桩→折叠→渲染）。

const compilerReady = () => {
  try { return engineHealth().ok; } catch { return false; }
};
const SAMPLE_FILE = new URL('../frontend/samples/ll-iitg.c', import.meta.url);
const WEB = customSample('web-ll-iitg');

test('示例库：每条示例都有 id/标题/语言/模式，网上样例带来源与 sha256', () => {
  assert.ok(CUSTOM_SAMPLES.length >= 2);
  for (const sample of CUSTOM_SAMPLES) {
    assert.ok(sample.id && sample.title, '示例缺 id/标题');
    assert.ok(sample.language === 'c' || sample.language === 'cpp');
    assert.ok(sample.mode === 'program' || sample.mode === 'function');
    assert.ok(sample.expect && Array.isArray(sample.expect.families) && sample.expect.minSteps > 0);
  }
  assert.equal(WEB.mode, 'program');
  assert.match(WEB.source, /^https:\/\//, '网上样例必须写来源');
  assert.match(WEB.sha256, /^[0-9a-f]{64}$/);
});

test('网上样例是**原样**的：文件存在、无 BOM、sha256 与记录一致、含 main', async () => {
  const bytes = await readFile(SAMPLE_FILE);
  assert.notEqual(bytes[0], 0xEF, '文件不该带 UTF-8 BOM');
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash, WEB.sha256, '样例文件被改过了（sha256 不一致）');
  const text = bytes.toString('utf8');
  assert.match(text, /\bint\s+main\s*\(/, '网上样例应是整程序');
  assert.match(text, /typedef struct Node/, '样例应定义链表结点');
  assert.ok(text.split('\n').length >= 100, '样例行数偏少：' + text.split('\n').length);
});

test('loadCustomSample：整程序读本地文件、函数示例用内联代码、未知 id 报错', async () => {
  const program = await loadCustomSample('web-ll-iitg', async (path) => {
    assert.equal(path, WEB.path);
    return { ok: true, text: async () => 'int main(void){return 0;}' };
  });
  assert.equal(program.code, 'int main(void){return 0;}');
  assert.equal(program.mode, 'program');

  const inline = await loadCustomSample('builtin-bubble');
  assert.match(inline.code, /void sort\(int a\[\], int n\)/);
  assert.equal(inline.mode, 'function');

  await assert.rejects(() => loadCustomSample('nope'), /没有这个自定义代码示例/);
});

test('端到端：网上样例（未改动）→ 真编译 + 插桩 → 折叠出链表层 → 能进 svg-stage 渲染', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = await readFile(SAMPLE_FILE, 'utf8');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 4000, withLayers: true });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 240));
  assert.equal(trace.degradedMode, 'full', '应完整插桩，不该降级：' + trace.degradedMode);
  assert.ok(trace.steps >= WEB.expect.minSteps, `步数偏少：${trace.steps}`);
  assert.ok(trace.events.length > 200, '事件偏少：' + trace.events.length);

  const layerRun = trace.layerRun;
  assert.ok(layerRun && layerRun.ok === true, '折叠失败：' + (layerRun && layerRun.error));
  for (const family of WEB.expect.families) assert.ok(layerRun.families.includes(family), `没识别出 ${family}：` + layerRun.families.join(','));
  assert.ok(layerRun.style === 3, '链表样例的主画法应是 style 3：' + layerRun.style);
  const counts = layerRun.stats.nodeCounts.filter((row) => row.shape === 'list');
  assert.ok(counts.length >= 1 && counts.every((row) => row.nodes <= 32), '结点数应在上限内：' + JSON.stringify(counts));

  /* 真渲染一遍：每步 DOM 元素数不少于图元数，且不抛异常 */
  const { createStage } = await stageHarness();
  const host = makeEl('div');
  host.clientWidth = 720;
  const stage = createStage(host);
  let rendered = 0;
  for (const step of layerRun.steps.slice(0, 40)) {
    const metrics = stage.render(step.layers, { animate: true });
    assert.ok(metrics.prims > 0, '第 ' + step.stepIndex + ' 步没有图元');
    assert.ok(countElements(host) >= metrics.prims);
    rendered += 1;
  }
  assert.ok(rendered >= 10, '至少渲染 10 步，实际 ' + rendered);
  stage.clear();
});

test('端到端：函数体示例走夹具链路，数组排好且每轮出步', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const sample = await loadCustomSample('builtin-bubble');
  const run = await runCustomCodeWithEngine({ language: sample.language, source: sample.code, array: [5, 1, 4, 2] });
  assert.deepEqual(run.result, [1, 2, 4, 5]);
  assert.ok(run.steps.length >= sample.expect.minSteps);
  const innerLoop = run.steps.filter((step) => step.lineId === '4').length;
  assert.ok(innerLoop >= 3, '内层循环应每轮出步：' + innerLoop);
});

/* ---------------- 假 DOM（与 engine-layers.test.mjs 同一套最小面） ---------------- */
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
  return import('../frontend/vendor/plus/app/svg-stage.js');
}
const countElements = (node) => {
  let total = 0;
  const walk = (el) => { for (const child of el.childNodes || []) { total += 1; walk(child); } };
  walk(node);
  return total;
};
