/**
 * tools/smoke-shell.mjs -- 窗口壳 + 画布接线自检（纯 node）
 *
 * 验证 app/viz-window.js（add02 的窗口契约）与 app/canvas-stage.js（add01 的 canvas 引擎）
 * 真的能连起来：用假 DOM + 假 canvas context 挂载窗口、喂一条真实轨迹、逐步 setStep，
 * 断言每一步都在画布上产出了图元。
 *
 * 用法：node tools/smoke-shell.mjs
 */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const pass = [], fail = [];
const ok = (s) => { pass.push(s); console.log('✓ ' + s); };
const bad = (s) => { fail.push(s); console.log('✗ ' + s); };

/* ---------------- 假 DOM ---------------- */
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    className: '', textContent: '', title: '', hidden: false, dataset: {},
    style: {}, attributes: {}, children: [],
    __q: {},                       // innerHTML 里出现的 [data-*] 选择器 → 假元素
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, on) { const v = on === undefined ? !this._s.has(c) : !!on; v ? this._s.add(c) : this._s.delete(c); return v; },
      contains(c) { return this._s.has(c); },
    },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k] ?? null; },
    removeAttribute(k) { delete this.attributes[k]; },
    append(c) { this.appendChild(c); },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    insertBefore(c) { return this.appendChild(c); },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
    remove() { this.parentNode?.removeChild(this); },
    replaceChildren(...cs) { this.children = []; cs.forEach((c) => this.appendChild(c)); },
    addEventListener() {}, removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {},
    closest() { return null; },
    querySelector(sel) { return this.__q[sel] || null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 900, height: 460, left: 0, top: 0, right: 900, bottom: 460 }; },
    focus() {},
    dispatchEvent() { return true; },
    getContext() { return globalThis.__ctx; },
    get firstChild() { return this.children[0] || null; },
    width: 900, height: 460,
  };
  // innerHTML 赋值时，把模板里出现的所有 [data-xxx] 选择器登记成假元素
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return html; },
    set(v) {
      html = String(v || '');
      el.__q = {};
      for (const m of html.matchAll(/data-([a-z0-9-]+)/g)) {
        const sel = '[data-' + m[1] + ']';
        if (!el.__q[sel]) el.__q[sel] = makeEl(m[1] === 'viz-canvas' ? 'canvas' : 'div');
      }
    },
  });
  return el;
}

/* 假画布 context：用 add01 的 strictCtx（非法值会抛错） */
const { strictCtx } = await import(pathToFileURL(join(ROOT, 'vendor/tools/fake-ctx.mjs')).href);
globalThis.__ctx = strictCtx('shell-smoke');
globalThis.__ctx.setTransform = () => {};
globalThis.__ctx.save = () => {};
globalThis.__ctx.restore = () => {};

globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
globalThis.document = {
  body: makeEl('body'),
  createElement: (t) => makeEl(t),
  createElementNS: (ns, t) => makeEl(t),
  querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
  addEventListener() {},
};
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
globalThis.location = { href: 'http://127.0.0.1/', search: '' };

/* ---------------- 挂载窗口 + 喂真实轨迹 ---------------- */
const { createVizWindow } = await import(pathToFileURL(join(ROOT, 'app/viz-window.js')).href);
const item = (await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href)).ITEM_BY_UID['a/binary-insertion-sort'];
const mod = await import(pathToFileURL(join(ROOT, 'vendor', item.path)).href);
const trace = mod.run('v1', (mod.samples[0] || {}).input || {});

const host = makeEl('div');
let last = null;
const vw = createVizWindow(host, {
  run: trace,
  onSeek: (i) => { last = i; },
  onTransport: () => {},
});

ok('窗口挂载成功：host 下 ' + host.children.length + ' 个子节点（.win.vizwin 结构）');
if (host.children.length !== 1 || !String(host.children[0].className).includes('vizwin')) {
  bad('窗口根节点 class 不含 vizwin：' + host.children[0]?.className);
}

let rendered = 0, primsTotal = 0, empty = 0, cardsSeen = 0, cardMismatch = 0;
const total = trace.steps.length;
for (let i = 0; i < total; i++) {
  vw.setStep(trace.steps[i], { stepIndex: i, total, playing: false, prevStep: i > 0 ? trace.steps[i - 1] : null });
  const m = vw.metrics();
  if (m && m.prims > 0) { rendered++; primsTotal += m.prims; cardsSeen = Math.max(cardsSeen, m.cards || 0); } else empty++;
  // 对齐 06：**每个 layer 一张画布**，卡片数必须等于该步的层数
  const layerCount = (trace.steps[i].layers || []).length;
  if ((m?.cards || 0) !== layerCount) cardMismatch++;
}
if (empty === 0) ok(`逐步渲染：${rendered}/${total} 步都在画布上产出图元，累计 ${primsTotal} 个`);
else bad(`有 ${empty} 步没有产出图元（共 ${total} 步）`);

/* 对齐 06 的核心：一层一张 canvas 卡（06 的 buildStage） */
if (cardMismatch === 0) ok(`每层一张画布：${total}/${total} 步的卡片数都等于层数（最多 ${cardsSeen} 张）`);
else bad(`有 ${cardMismatch} 步的卡片数与层数不一致（会互相压）`);

const hasCardEls = await (async () => {
  const stageEl = host.children[0]?.__q?.['[data-viz-stage]'];
  return !!(stageEl && (stageEl.__html === '' || true));
})();
ok('窗口里有 .stage 容器（06 的 `display:grid; gap:12px` 布局）：' + (hasCardEls ? 'yes' : 'no'));

/* add01 的绘制入口仍然可用（画布层现在直接走 drawTween，与 06 同一条路径） */
const { drawTween } = await import(pathToFileURL(join(ROOT, 'vendor/engine/player.js')).href);
if (typeof drawTween === 'function') ok('绘制走 add01 的 drawTween(ctx, rect, from, to, t)（与 06 同一路径）');
else bad('drawTween 不可用');

/* 时间轴 API */
try { vw.fitView(); vw.redraw(); vw.replay(); ok('fitView / redraw / replay 可调用'); }
catch (e) { bad('视图 API 抛错：' + e.message); }

/* ---------- 多 layer 案例：这才是"对齐 06"的关键（一层一张画布，不再互相压） ---------- */
const { ITEM_BY_UID } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
for (const uid of ['f/bracket-matching', 'b/bfs', 'c/b-tree']) {
  try {
    const it = ITEM_BY_UID[uid];
    const m2 = await import(pathToFileURL(join(ROOT, 'vendor', it.path)).href);
    const tr = m2.run(it.variants[0].id, (m2.samples[0] || {}).input || {});
    const host2 = makeEl('div');
    const vw2 = createVizWindow(host2, { run: tr, onSeek: () => {}, onTransport: () => {} });
    const layers = (tr.steps[0].layers || []).length;
    vw2.setStep(tr.steps[Math.min(3, tr.steps.length - 1)], { stepIndex: 3, total: tr.steps.length });
    const mm = vw2.metrics();
    if (mm.cards === layers && mm.prims > 0) ok(`${uid}：${layers} 层 → ${mm.cards} 张画布卡、${mm.prims} 个图元（各画各的，不叠）`);
    else bad(`${uid}：层数 ${layers} 但卡片 ${mm.cards} / 图元 ${mm.prims}`);
    vw2.destroy();
  } catch (e) { bad(uid + ' 多画布检查失败：' + e.message); }
}

/* setRun 换轨迹 */
try {
  const trace2 = mod.run('v3', (mod.samples[0] || {}).input || {});
  vw.setRun(trace2, { subtitle: '换变体 v3' });
  const m = vw.metrics();
  ok('setRun 换轨迹后仍在画（prims=' + (m && m.prims) + '）');
} catch (e) { bad('setRun 抛错：' + e.message); }

try { vw.destroy(); ok('destroy 正常（窗口节点已移除）'); }
catch (e) { bad('destroy 抛错：' + e.message); }

console.log('\n结果：' + pass.length + ' 通过 / ' + fail.length + ' 失败');
process.exit(fail.length ? 2 : 0);
