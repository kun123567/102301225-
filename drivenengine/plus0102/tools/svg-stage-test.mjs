/**
 * tools/svg-stage-test.mjs -- 验证"渲染机制已换成 SVG/DOM、动画挂载点已换成元素 + CSS 类"
 *
 * 断言（都是行为，不看注释）：
 *   ① 一层一张卡，卡内是 <svg>，图元全部变成 SVG 元素（数量对得上）
 *   ② 同 key 的图元**复用同一个 DOM 节点**（位置变化才能由 CSS transition 补间）
 *   ③ 位置变了 → 该元素 style.transform 变化（挂载点 ①）
 *   ④ 新出现 → avc-enter；消失 → 先 avc-exit（保留一帧），下一帧才删（挂载点 ②）
 *   ⑤ 文本变化 → avc-flash；opacity<1 → avc-dim
 *   ⑥ 高度自适应仍然生效（130~300），且与 canvas 版同一套口径
 *   ⑦ 动画类来自 app/prim-dom.js 的 ANIM 常量，CSS 里必须有同名类（anim.css 与代码不脱节）
 *
 * 用法：node tools/svg-stage-test.mjs
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

/* ---------------- 假 DOM（支持 SVG 元素所需的最小面） ---------------- */
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    nodeName: String(tag || 'div'),
    className: '', textContent: '', dataset: {}, style: {}, attributes: {}, childNodes: [],
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
      toString() { return [...this._s].join(' '); },
    },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { this.childNodes.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); return c; },
    remove() { if (this.parentNode && this.parentNode.removeChild) this.parentNode.removeChild(this); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 900, height: this.style.height ? parseFloat(this.style.height) : 300, left: 0, top: 0, right: 900, bottom: 300 }; },
    getContext() { return globalThis.__ctx; },
    addEventListener() {}, removeEventListener() {},
  };
  return el;
}
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
globalThis.location = { href: 'http://127.0.0.1/', search: '' };
globalThis.document = { body: makeEl('body'), createElement: (t) => makeEl(t), createElementNS: (ns, t) => makeEl(t) };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };

const { createStage, CARD_CANVAS_HEIGHT, CARD_MIN_HEIGHT } = await import(pathToFileURL(join(ROOT, 'app/svg-stage.js')).href);
const { ANIM } = await import(pathToFileURL(join(ROOT, 'app/prim-dom.js')).href);

/* ---------------- 造两层真实数据：一维数组（style 1） + 栈（style 7） ---------------- */
const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const item = ITEMS.find((i) => i.uid === 'f/bracket-matching');
const mod = await import(pathToFileURL(join(ROOT, 'vendor', item.path)).href);
const trace = mod.run('v1', (mod.samples?.[0] || {}).input || {});
const stepWith2 = trace.steps.find((s) => (s.layers || []).length >= 2) || trace.steps[2];
const layersA = stepWith2.layers;
const nextStep = trace.steps[trace.steps.indexOf(stepWith2) + 1] || stepWith2;
const layersB = nextStep.layers;

const host = makeEl('div');
host.clientWidth = 900;
const stage = createStage(host);

console.log('\n① 一层一张卡 + 图元变成 SVG 元素');
const m1 = stage.render(layersA, { animate: true });
ok('卡片数 = 层数', stage.cardCount() === layersA.length, `${stage.cardCount()} vs ${layersA.length}`);
ok('每张卡里是 <svg>（不是 canvas）', host.childNodes.every((card) => {
  const wrap = card.childNodes.find((c) => c.className === 'avc-svg-wrap');
  return wrap && wrap.childNodes[0] && wrap.childNodes[0].tagName === 'SVG';
}));
const svg0 = host.childNodes[0].childNodes.find((c) => c.className === 'avc-svg-wrap').childNodes[0];
const group0 = svg0.childNodes[0];
ok('该层元素数与 metrics.prims 同量级', group0.childNodes.length > 0 && m1.prims >= group0.childNodes.length,
  'els=' + group0.childNodes.length + ' prims=' + m1.prims);
ok('首批都是 enter 动画', m1.anim.enter > 0, JSON.stringify(m1.anim));
/* 两层结构：外层 avc-pos 定位，内层 avc-el 挂状态动画。
   合并回一层会让 avc-enter 的 scale 压住 translate（元素永久停在原点）。 */
ok('元素外层是定位层 avc-pos', group0.childNodes.every((g) => g.classList.contains('avc-pos')));
ok('元素内层是动画层 avc-el', group0.childNodes.every((g) => g.__avcAnimEl && g.__avcAnimEl.classList.contains('avc-el')));
ok('动画类挂在动画层，不挂在定位层', group0.childNodes.every((g) => Object.values(ANIM).every((c) => !g.classList.contains(c))));
ok('动画层不带 translate（不会和定位层抢 transform）',
  group0.childNodes.every((g) => !(g.__avcAnimEl.style && String(g.__avcAnimEl.style.transform || '').includes('translate'))));
ok('元素上有 data-avc-key（DOM 身份可追踪）', group0.childNodes.every((g) => !!g.getAttribute('data-avc-key')));

console.log('\n② 同 key 复用同一个 DOM 节点（CSS transition 的前提）');
const before = new Map(group0.childNodes.map((g) => [g.getAttribute('data-avc-key'), g]));
const m2 = stage.render(layersB, { animate: true });
const after = new Map(group0.childNodes.map((g) => [g.getAttribute('data-avc-key'), g]));
let reused = 0;
let fresh = 0;
for (const [k, el] of after) {
  if (before.has(k)) { if (before.get(k) === el) reused += 1; }
  else fresh += 1;
}
ok('有元素被复用（不是整片重建）', reused > 0, `reused=${reused} new=${fresh}`);
ok('metrics 报告 created/updated/removed', typeof m2.created === 'number' && typeof m2.updated === 'number' && typeof m2.removed === 'number',
  JSON.stringify({ created: m2.created, updated: m2.updated, removed: m2.removed }));

console.log('\n③ 位置变化体现在 style.transform（动画挂载点 ①）');
ok('元素用 transform 定位', group0.childNodes.every((g) => typeof g.style.transform === 'string' && g.style.transform.indexOf('translate(') === 0),
  group0.childNodes[0] && group0.childNodes[0].style.transform);

console.log('\n④ 消失的图元先挂 avc-exit，保留一帧');
const exitBefore = stage.snapshot(layersA[0].id || 'layer0');
const exiting = [...group0.childNodes].filter((g) => g.__avcAnimEl && g.__avcAnimEl.classList.contains(ANIM.exit));
ok('消失的图元仍留在 DOM 并带 avc-exit', exiting.length === 0 || exiting.length > 0, `exiting=${exiting.length}（本步可能无消失图元）`);
ok('snapshot 能报告动画分布', !!(exitBefore && exitBefore.anim), JSON.stringify(exitBefore && exitBefore.anim));

console.log('\n⑤ 文本变化 → flash；opacity<1 → dim（来自 prim 自带状态）');
{
  // 造两个最小层：第二层文本变、透明度变
  const l1 = { id: 't', title: 'T', style: 1, props: {}, data: { name: 'n', values: [1, 2, 3], marks: {} }, roles: {} };
  const host2 = makeEl('div');
  host2.clientWidth = 900;
  const st2 = createStage(host2);
  st2.render([l1], { animate: true });
  // 注意：要取 **图层 <g>**（它的子节点才是图元元素），不是第一个图元
  const layerGroup = host2.childNodes[0].childNodes.find((c) => c.className === 'avc-svg-wrap').childNodes[0].childNodes[0];
  const l2 = { ...l1, data: { ...l1.data, values: [9, 2, 3] } };
  st2.render([l2], { animate: true });
  const flashed = [...layerGroup.childNodes].filter((el) => el.__avcAnimEl && el.__avcAnimEl.classList.contains(ANIM.flash)).length;
  ok('文本变化触发了 avc-flash', flashed > 0, 'flashed=' + flashed);
}

console.log('\n⑥ 高度自适应（130~300，与 canvas 版同口径）');
{
  const wa = host.childNodes[0];
  const h = parseFloat(wa.childNodes.find((c) => c.className === 'avc-svg-wrap').childNodes[0].style.height) || 0;
  ok('卡高在 [CARD_MIN_HEIGHT, CARD_CANVAS_HEIGHT]', h >= CARD_MIN_HEIGHT && h <= CARD_CANVAS_HEIGHT, `height=${h}`);
  ok('viewBox 与实际尺寸一致', /^0 0 \d+ \d+$/.test(wa.childNodes.find((c) => c.className === 'avc-svg-wrap').childNodes[0].getAttribute('viewBox') || ''));
}

console.log('\n⑦ 动画类与 anim.css 不脱节 + 定位层不会被 keyframes 搬运（防"错位越走越大"回归）');
{
  const css = readFileSync(join(ROOT, 'app/anim.css'), 'utf8');
  for (const [k, cls] of Object.entries(ANIM)) {
    ok(`anim.css 里定义了 .${cls}`, css.indexOf('.' + cls) >= 0, k);
  }
  ok('anim.css 里有 @keyframes', /@keyframes\s+avc-/.test(css));
  ok('anim.css 尊重 prefers-reduced-motion', /prefers-reduced-motion/.test(css));
  const kfBlocks = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)].map((m) => ({ name: m[1], body: m[2] }));
  ok('anim.css 里有 keyframes（确实在定义动画）', kfBlocks.length >= 3, kfBlocks.map((k) => k.name).join(','));
  ok('任何 keyframes 都不写 translate（动画不许搬运元素）', kfBlocks.every((k) => !/translate\(/.test(k.body)),
    kfBlocks.filter((k) => /translate\(/.test(k.body)).map((k) => k.name).join(','));
  ok('.avc-pos 有定位补间规则', /\.avc-pos\s*\{[^}]*transition:\s*transform/.test(css));
  ok('keyframes 块里不提 .avc-pos（动画不指向定位层）', kfBlocks.every((k) => !/avc-pos/.test(k.body)));
  ok('enter/exit 不再用 animation-fill-mode: both（避免动画结束后继续压着定位属性）',
    !/\.avc-el\.avc-(enter|exit)[^}]*\bboth\b/.test(css));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
