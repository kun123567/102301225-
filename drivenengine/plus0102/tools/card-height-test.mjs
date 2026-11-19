/**
 * tools/card-height-test.mjs -- 验证"卡片高度跟着内容走"
 *
 * 截图里 `内存工作区 WA`（2 个格子）占满 300px、底下留一大片空白。这里断言：
 *   ① 内容少的层（style 8 的两格工作区）→ 卡高明显小于 300，且内容下边界装得下
 *   ② 内容多的层（一维数组 6 格）→ 卡高仍用满 300
 *   ③ 同一层换到内容更多的步时能自动长回来（不会一直缩着）
 *
 * 用法：node tools/card-height-test.mjs
 */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
let pass = 0;
let fail = 0;
const ok = (s, cond, extra) => {
  if (cond) { pass += 1; console.log('  ✓ ' + s); }
  else { fail += 1; console.log('  ✗ ' + s + (extra ? '  → ' + extra : '')); }
};

/* ---------------- 极简假 DOM ---------------- */
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    className: '', textContent: '', dataset: {}, style: {}, children: [],
    classList: { _s: new Set(), add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    remove() { const p = this.parentNode; if (p && p.removeChild) p.removeChild(this); },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
    querySelector() { return null; },
    getBoundingClientRect() { return { width: 900, height: parseFloat(this.style.height) || 300 }; },
    getContext() { return globalThis.__ctx; },
  };
  return el;
}
const { strictCtx } = await import(pathToFileURL(join(ROOT, 'vendor/tools/fake-ctx.mjs')).href);
globalThis.__ctx = strictCtx('card-height');
globalThis.__ctx.setTransform = () => {};
globalThis.__ctx.save = () => {};
globalThis.__ctx.restore = () => {};
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
globalThis.document = { body: makeEl('body'), createElement: (t) => makeEl(t), createElementNS: (ns, t) => makeEl(t) };

const { createStage, CARD_CANVAS_HEIGHT } = await import(pathToFileURL(join(ROOT, 'app/canvas-stage.js')).href);
const { primBox } = await import(pathToFileURL(join(ROOT, 'app/layout-policy.js')).href);
const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const { adaptStepLayers } = await import(pathToFileURL(join(ROOT, 'vendor/app/adapt.js')).href);

const host = makeEl('div');
host.clientWidth = 900;
const stage = createStage(host);
const cardOf = (layerId) => stage.host.children.find((c) => c.dataset && c.dataset.layer === layerId);
const canvasOf = (layerId) => {
  const card = cardOf(layerId);
  return card ? card.children[1] : null;
};
const heightOf = (layerId) => {
  const cv = canvasOf(layerId);
  return cv ? parseFloat(cv.style.height) : NaN;
};

/* ---------------- ① 内容少的层（style 8 两格工作区） ---------------- */
const rs = ITEMS.find((i) => i.uid === 'c/replacement-selection');
const rsMod = await import(pathToFileURL(join(ROOT, 'vendor', rs.path)).href);
const rsTrace = rsMod.run('v1', (rsMod.samples?.[0] || {}).input || {});
const waStep = rsTrace.steps[2];
const waLayers = adaptStepLayers(waStep, 8, { props: {} }).layers;
const wa = waLayers.find((l) => l.id === 'wa');
stage.render([wa]);

console.log('\n① 内容少：style 8 的"2 格工作区"');
const h1 = heightOf('wa');
ok('卡高小于 300（不再是一大片空白）', h1 < CARD_CANVAS_HEIGHT - 40, `height=${h1}`);
ok('卡高不小于下限 130', h1 >= 130, `height=${h1}`);

/* 内容下边界必须装得下 */
const { dispatch } = await import(pathToFileURL(join(ROOT, 'vendor/engine/dispatch.js')).href);
const { polishLayout } = await import(pathToFileURL(join(ROOT, 'app/canvas-stage.js')).href);
const cv = canvasOf('wa');
const rect = { x: 0, y: 0, w: cv.width, h: h1 };
const prims = dispatch(wa.style).instance.layout(wa, rect, { bg: '#fff' }).prims;
polishLayout(prims, rect, wa.style);
const bottom = Math.max(...prims.map((p) => { const b = primBox(p); return b ? b.y + b.h : 0; }));
ok('内容下边界不超过卡高', bottom <= h1, `bottom=${Math.round(bottom)} h=${h1}`);

/* ---------------- ② 内容多的层（一维数组 6 格） ---------------- */
console.log('\n② 内容多：一维数组 6 格');
const arr = ITEMS.find((i) => i.uid === 'a/insertion-sort');
const arrMod = await import(pathToFileURL(join(ROOT, 'vendor', arr.path)).href);
const arrTrace = arrMod.run('v1', (arrMod.samples?.[0] || {}).input || {});
const arrStep = arrTrace.steps[Math.min(5, arrTrace.steps.length - 1)];
const arrLayer = arrStep.layers[0];
stage.render([arrLayer]);
const h2 = heightOf(arrLayer.id || 'layer0');
const cv2 = canvasOf(arrLayer.id || 'layer0');
const rect2 = { x: 0, y: 0, w: cv2.width, h: h2 };
const prims2 = dispatch(arrLayer.style).instance.layout(arrLayer, rect2, { bg: '#fff' }).prims;
polishLayout(prims2, rect2, arrLayer.style);
const bottom2 = Math.max(...prims2.map((p) => { const b = primBox(p); return b ? b.y + b.h : 0; }));
ok('卡高在 [130, 300] 之间', h2 >= 130 && h2 <= 300, `height=${h2}`);
ok('内容装得下', bottom2 <= h2, `bottom=${Math.round(bottom2)} h=${h2}`);

/* ---------------- ③ 同一张卡：内容变多时会自动长回来 ---------------- */
console.log('\n③ 同一张卡：内容变多能长回来');
const later = rsTrace.steps[rsTrace.steps.length - 1];
const laterWa = adaptStepLayers(later, 8, { props: {} }).layers.find((l) => l.id === 'wa');
stage.render([laterWa]);
const h3 = heightOf('wa');
ok('换到内容更多的步后卡高变大（不会一直缩着）', h3 >= h1, `before=${h1} after=${h3}`);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
