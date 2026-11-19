/**
 * tools/playback-test.mjs -- 播放/暂停 + 卡片高度（防棘轮 / 防裁切 / 防 ResizeObserver 回环）
 *
 * 覆盖点：
 *   ① 播放键是**开关**（窗口只发 `play`，main.js 必须解释成 toggle）
 *   ② 高度**稳定**：连续渲染 / 连续步 / 反复重排，卡高恒定（栈/堆格高随高度变，曾每按一次 +14px）
 *   ③ 高度必须**装得下内容**（收短不许裁内容）
 *   ④ **ResizeObserver 回环**：同宽度下反复 `resize()+render()`，高度不得漂移
 *   ⑤ 一帧只画一次：动画类不被"回退重画"冲成 move
 *
 * 用法：node tools/playback-test.mjs
 */
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
let pass = 0;
let fail = 0;
const ok = (s, cond, extra) => {
  if (cond) { pass += 1; console.log('  ✓ ' + s); }
  else { fail += 1; console.log('  ✗ ' + s + (extra ? '  → ' + extra : '')); }
};

/* ---------------- ① 静态检查 ---------------- */
console.log('\n① 播放/暂停开关');
{
  const main = readFileSync(join(ROOT, 'app/main.js'), 'utf8');
  ok("onTransport 的 'play' 分支走 togglePlay()", /action === 'play'\)\s*togglePlay\(\)/.test(main));
  ok("'pause' 分支走 stop()", /action === 'pause'\)\s*stop\(\)/.test(main));
  const vw = readFileSync(join(ROOT, 'app/viz-window.js'), 'utf8');
  ok('ResizeObserver 只在宽度变化时重排（避免自回环）', /roLastW/.test(vw) && /if \(w === roLastW\) return;/.test(vw));
  const svg = readFileSync(join(ROOT, 'app/svg-stage.js'), 'utf8');
  ok('探针固定在 CARD_CANVAS_HEIGHT 上量（不再按当前高度量）', /probePrims\(to, \{ x: 0, y: 0, w, h: CARD_CANVAS_HEIGHT \}\)/.test(svg));
  ok('探针函数签名是 (layer, rect)（防参数错位）', /function probePrims\(layer, rect\)/.test(svg));
}

/* ---------------- 假 DOM ---------------- */
let CARD_W = 685;
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), className: '', textContent: '', dataset: {}, style: {}, attributes: {}, childNodes: [],
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
    },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] ?? null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { this.childNodes.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); return c; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { x: 0, y: 0, width: CARD_W, height: 300 }; },
  };
  return el;
}
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
globalThis.document = { body: makeEl('body'), createElement: (t) => makeEl(t), createElementNS: (ns, t) => makeEl(t) };
globalThis.matchMedia = () => ({ matches: false });

const { createStage, CARD_CANVAS_HEIGHT, CARD_MIN_HEIGHT } = await import(pathToFileURL(join(ROOT, 'app/svg-stage.js')).href);
const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const { dispatch } = await import(pathToFileURL(join(ROOT, 'vendor/engine/dispatch.js')).href);
const { polishLayout } = await import(pathToFileURL(join(ROOT, 'app/canvas-stage.js')).href);
const { primBox, profileOf } = await import(pathToFileURL(join(ROOT, 'app/layout-policy.js')).href);

/** 独立复算：某层在给定尺寸下内容的下边界（不信 stage 的自述，防止"自己验证自己"） */
function bottomAt(layer, w, h) {
  const rect = { x: 0, y: 0, w, h };
  const prims = dispatch(layer.style).instance.layout(layer, rect, { bg: '#ffffff' }).prims || [];
  polishLayout(prims, rect, layer.style, layer);
  const P = profileOf(layer.style).policy;
  let b = 0;
  for (const p of prims) { const bb = primBox(p, P); if (bb) b = Math.max(b, bb.y + bb.h); }
  return b;
}

const CASES = ['f/bracket-matching', 'c/replacement-selection', 'a/insertion-sort', 'd/avl-tree', 'g/huffman-coding', 'b/floyd'];
const traces = new Map();
for (const uid of CASES) {
  const it = ITEMS.find((i) => i.uid === uid);
  const mod = await import(pathToFileURL(join(ROOT, 'vendor', it.path)).href);
  traces.set(uid, mod.run('v1', (mod.samples?.[0] || {}).input || {}));
}

/* ---------------- ② 高度稳定 + ③ 不裁内容 ---------------- */
console.log('\n② 同一步幂等（反复渲染高度不变）　③ 高度装得下内容（不裁）');
for (const uid of CASES) {
  const trace = traces.get(uid);
  CARD_W = 685;
  const host = makeEl('div');
  host.clientWidth = CARD_W;
  const stage = createStage(host);
  const lid = (trace.steps[0].layers[0] || {}).id || 'layer0';
  let drift = 0;
  let clipped = 0;
  let outOfRange = 0;
  let maxH = 0;
  for (let i = 0; i < 10; i++) {
    const layers = trace.steps[Math.min(i, trace.steps.length - 1)].layers;
    stage.render(layers, { animate: true });
    const h1 = stage.snapshot(lid).height;
    stage.render(layers, { animate: true });           // 同一步再画一次
    const h2 = stage.snapshot(lid).height;
    if (h1 !== h2) drift += 1;
    if (h2 < CARD_MIN_HEIGHT || h2 > CARD_CANVAS_HEIGHT) outOfRange += 1;
    const bottom = bottomAt(layers[0], CARD_W, h2);
    if (bottom + 1 > h2) clipped += 1;
    maxH = Math.max(maxH, h2);
  }
  ok(`${uid}：同一步反复渲染高度不变（不棘轮）`, drift === 0, 'drift=' + drift + ' 步');
  ok(`${uid}：卡高在 [${CARD_MIN_HEIGHT}, ${CARD_CANVAS_HEIGHT}]`, outOfRange === 0, 'outOfRange=' + outOfRange);
  ok(`${uid}：内容没被裁掉（最大高 ${maxH}）`, clipped === 0, 'clipped=' + clipped + ' 步');
}

/* ---------------- ④ ResizeObserver 回环（同宽度反复重排） ---------------- */
console.log('\n④ 同宽度反复重排（模拟 ResizeObserver 触发）：高度不得漂移');
for (const uid of CASES) {
  const trace = traces.get(uid);
  CARD_W = 685;
  const host = makeEl('div');
  host.clientWidth = CARD_W;
  const stage = createStage(host);
  const lid = (trace.steps[0].layers[0] || {}).id || 'layer0';
  const layers = trace.steps[Math.min(3, trace.steps.length - 1)].layers;
  const hs = [];
  stage.render(layers, { animate: true });
  for (let i = 0; i < 15; i++) {
    stage.resize();                                    // 等价于窗口 relayout() 里的那一步
    stage.render(layers, { animate: false });
    hs.push(stage.snapshot(lid).height);
  }
  ok(`${uid}：15 次"重排 + 重绘"高度不变`, new Set(hs).size === 1, [...new Set(hs)].join(','));
}

/* ---------------- ④b 宽度变化：允许变，但要收敛且装得下 ---------------- */
console.log('\n④b 宽度 685 → 900 → 685：高度允许变，但必须收敛且不裁');
for (const uid of ['f/bracket-matching', 'c/replacement-selection']) {
  const trace = traces.get(uid);
  const host = makeEl('div');
  const stage = createStage(host);
  const lid = (trace.steps[0].layers[0] || {}).id || 'layer0';
  const layers = trace.steps[Math.min(3, trace.steps.length - 1)].layers;
  const seen = [];
  for (const w of [685, 685, 900, 900, 685, 685]) {
    CARD_W = w;
    host.clientWidth = w;
    stage.resize();
    stage.render(layers, { animate: false });
    const snap = stage.snapshot(lid);
    seen.push(w + ':' + snap.height + (bottomAt(layers[0], w, snap.height) + 1 > snap.height ? '(裁!)' : ''));
  }
  ok(`${uid}：同宽度重复时高度一致，且都不裁内容`, seen[0] === seen[1] && seen[2] === seen[3] && seen[4] === seen[5] && seen.every((s) => !s.includes('裁')), seen.join(' '));
}

/* ---------------- ⑤ 一帧只画一次 ---------------- */
console.log('\n⑤ 一帧只画一次（动画类不被冲掉）');
{
  const trace = traces.get('a/insertion-sort');
  CARD_W = 685;
  const host = makeEl('div');
  host.clientWidth = CARD_W;
  const stage = createStage(host);
  const layers = trace.steps[2].layers;
  const m1 = stage.render(layers, { animate: true });
  ok('首帧全部 enter、没有 move 混入', m1.anim.enter > 0 && m1.anim.move === 0, JSON.stringify(m1.anim));
  const m2 = stage.render(layers, { animate: true });
  ok('同一步重绘：不新建元素', m2.created === 0, 'created=' + m2.created);
  ok('同一步重绘：也不产生 enter', m2.anim.enter === 0, JSON.stringify(m2.anim));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
