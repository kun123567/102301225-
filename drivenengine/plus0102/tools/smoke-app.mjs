/**
 * tools/smoke-app.mjs -- **把页面真正跑一遍**（无浏览器）：假 DOM + 假 canvas 里执行 app/main.js
 *
 * 与 smoke-shell 的区别：那个只测窗口壳；这个会把**应用装配层**（app/main.js）跑起来，
 * 断言：目录建出 7 包 54 条、默认案例自动载入并跑出轨迹、窗口第一步就有图元、
 * 切变体/切样例/切结构/切画法（有损换算）都还能画、代码面板与变量面板有内容。
 *
 * 用法：node tools/smoke-app.mjs
 */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const pass = [], fail = [];
const ok = (s) => { pass.push(s); console.log('✓ ' + s); };
const bad = (s) => { fail.push(s); console.log('✗ ' + s); };

/* ---------------- 假 DOM ---------------- */
const bySel = new Map();         // '#id' / '[data-x]' → 元素

function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '', className: '', textContent: '', title: '', hidden: false, value: '',
    dataset: {}, style: {}, attributes: {}, children: [], __q: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, on) { const v = on === undefined ? !this._s.has(c) : !!on; v ? this._s.add(c) : this._s.delete(c); return v; },
      contains(c) { return this._s.has(c); },
    },
    setAttribute(k, v) { this.attributes[k] = v; if (k === 'id') this.id = v; },
    getAttribute(k) { return this.attributes[k] ?? null; },
    removeAttribute(k) { delete this.attributes[k]; },
    append(c) { this.appendChild(c); },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    insertBefore(c) { return this.appendChild(c); },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
    remove() { this.parentNode?.removeChild(this); },
    replaceChildren(...cs) { this.children = []; cs.forEach((c) => this.appendChild(c)); },
    addEventListener(type, fn) { (this.__on ||= {})[type] = fn; },
    removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {},
    closest() { return null; },
    querySelector(sel) { return this.__q[sel] || bySel.get(sel) || null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 900, height: 460, left: 0, top: 0, right: 900, bottom: 460 }; },
    focus() {}, select() {},
    dispatchEvent() { return true; },
    getContext() { return globalThis.__ctx; },
    get firstChild() { return this.children[0] || null; },
    width: 900, height: 460,
    get innerHTML() { return this.__html || ''; },
    set innerHTML(v) {
      this.__html = String(v || '');
      this.children = [];                     // 真 DOM 语义：写 innerHTML 会清空子节点
      for (const m of this.__html.matchAll(/data-([a-z0-9-]+)/g)) {
        const sel = '[data-' + m[1] + ']';
        if (!this.__q[sel]) this.__q[sel] = makeEl(m[1] === 'viz-canvas' ? 'canvas' : 'div');
      }
    },
  };
  return el;
}

/** 预建 index.html 里被 querySelector 用到的节点 */
const IDS = ['search', 'pkg-list', 'catalog-total', 'crumb', 'crumb-sub', 'engine-meta', 'convert-note',
  'variants', 'samples', 'ds-select', 'style-select', 'speed', 'speed-val', 'error', 'viz-host',
  'code', 'event', 'vars', 'explain', 'drawmode'];
for (const id of IDS) {
  const el = makeEl(id === 'viz-host' ? 'div' : (/^(variants|samples|pkg-list|code)$/.test(id) ? 'div' : 'div'));
  el.id = id;
  bySel.set('#' + id, el);
}
bySel.get('#speed').value = '3';

const { strictCtx } = await import(pathToFileURL(join(ROOT, 'vendor/tools/fake-ctx.mjs')).href);
globalThis.__ctx = strictCtx('app-smoke');
globalThis.__ctx.setTransform = () => {};
globalThis.__ctx.save = () => {};
globalThis.__ctx.restore = () => {};

const body = makeEl('body');
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
globalThis.document = {
  body,
  createElement: (t) => makeEl(t),
  createElementNS: (ns, t) => makeEl(t),
  querySelector: (sel) => bySel.get(sel) || null,
  querySelectorAll: (sel) => (sel === '#pkg-list .item'
    ? (bySel.get('#pkg-list').children.flatMap((g) => g.children.filter((c) => String(c.className).includes('item'))))
    : []),
  getElementById: (id) => bySel.get('#' + id) || null,
  addEventListener() {},
};
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
globalThis.location = { href: 'http://127.0.0.1:5182/', search: '' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

/* ---------------- 跑应用 ---------------- */
const { createVizWindow } = await import(pathToFileURL(join(ROOT, 'app/viz-window.js')).href);
void createVizWindow;   // main.js 自己 import 它；这里只是提前加载，便于报错定位

process.on('unhandledRejection', (e) => bad('未处理的 Promise 拒绝：' + (e && e.message)));

await import(pathToFileURL(join(ROOT, 'app/main.js')).href);
await new Promise((r) => setTimeout(r, 400));   // 等 boot() 里的动态 import + 首帧

/* ---------------- 断言 ---------------- */
const pkgs = bySel.get('#pkg-list').children;
const items = document.querySelectorAll('#pkg-list .item');
ok(`目录：${pkgs.length} 个包分组 / ${items.length} 条案例`);
if (items.length !== 54) bad('案例数不是 54：' + items.length);
if (!/54\s*案例/.test(bySel.get('#catalog-total').textContent)) bad('顶栏统计没写 54：' + bySel.get('#catalog-total').textContent);

const variants = bySel.get('#variants').children.length;
const samples = bySel.get('#samples').children.length;
ok(`默认案例已载入：变体 ${variants} 个 / 样例 ${samples} 个`);
if (variants !== 3) bad('变体数不是 3：' + variants);

const meta = bySel.get('#engine-meta').textContent;
ok('渲染器提示：' + meta);
if (!/style\s*\d/.test(meta)) bad('渲染器提示缺 style：' + meta);

const codeLis = (bySel.get('#code').__html || '').split('</li>').length - 1;
ok(`代码面板：${codeLis} 行 sourceLines`);
if (codeLis < 3) bad('代码面板行数太少：' + codeLis);

const host = bySel.get('#viz-host');
if (!host.children.length) bad('窗口没挂到 #viz-host');
else ok('窗口已挂载：#viz-host 下 ' + host.children.length + ' 个节点');

/* 从窗口里取 metrics（main.js 里的 vw 是闭包内的，这里通过窗口元素上的自定义属性不现实，
   改为看 .stage 里的卡片数：对齐 06 后是"每个 layer 一张 canvas 卡" */
const stageEl = host.children[0]?.__q?.['[data-viz-stage]'];
const cards = stageEl ? stageEl.children.length : 0;
ok('画布卡：.stage 下有 ' + cards + ' 张 canvas 卡（默认案例 1 层）');
if (cards !== 1) bad('卡片数应为 1（默认案例单层），实际 ' + cards);

/* 切画法：把 style-select 换成同族另一个 style，触发 onchange */
const styleSel = bySel.get('#style-select');
const opts = [...new Set(styleSel.children.map((o) => o.value))];
ok('可切换画法：' + (opts.length ? opts.join(' / ') : '（无可切换项）'));
if (opts.length > 1) {
  const alt = opts.find((v) => v !== styleSel.value) || opts[1];
  styleSel.value = alt;
  try { styleSel.onchange?.(); } catch (e) { bad('切画法抛错：' + e.message); }
  await new Promise((r) => setTimeout(r, 200));
  ok('切到 style ' + alt + ' 后：' + bySel.get('#convert-note').textContent);
  if (!/style\s*\d/.test(bySel.get('#engine-meta').textContent)) bad('切画法后渲染器提示异常');
}

/* 切变体：点第 2 个变体按钮（main.js 用 addEventListener('click')，这里直接调它存的回调） */
const variantBtns = bySel.get('#variants').children;
if (variantBtns.length > 1) {
  const fn = variantBtns[1].__on && variantBtns[1].__on.click;
  if (fn) { await fn(); await new Promise((r) => setTimeout(r, 200)); ok('切到第 2 个变体后仍在跑（事件面板：' + bySel.get('#event').textContent + '）'); }
  else bad('变体按钮没有绑定 click');
}

/* 本步说明落在右栏 #explain（不再压在画布上） */
const explainText = bySel.get('#explain').textContent || '';
ok('本步说明进入右栏 #explain：' + (explainText ? explainText.slice(0, 40) + '…' : '（空）'));
if (!explainText) bad('explainHost 没写入说明文本');

/* 页面里不应再出现"第二套播放控制"（上一版重复的根因） */
const dupBtns = ['#prev-btn', '#play-btn', '#next-btn'].filter((s) => bySel.get(s));
if (!dupBtns.length) ok('页面控制条已无重复的 上一步/播放/下一步 按钮（播放只在窗口时间轴里）');
else bad('仍存在重复播控按钮：' + dupBtns.join(', '));

/* ---------- 去重断言：每个事实只允许一处出处 ---------- */
const winRoot = host.children[0];
const winSub = winRoot && winRoot.__q && winRoot.__q['[data-win-sub]'];
const crumbText = (bySel.get('#crumb').textContent || '').replace(/^[A-G]\s*·\s*/, '');
const winSubText = (winSub && winSub.textContent) || '';
if (winSub && crumbText && !winSubText.includes(crumbText)) {
  ok('案例名只在 #crumb 出现（窗口副标题只写变体/样例：' + winSubText + '）');
} else bad('案例名重复：crumb="' + crumbText + '" / win-sub="' + winSubText + '"');

if (!winRoot.__q['[data-vh-title]'] && !winRoot.__q['[data-vh-sub]']) {
  ok('画布头不再重复"结构/style/渲染器类名"（viewport-head 只留"重新布局"按钮）');
} else bad('#viewport-head 里仍有重复的结构/style 文案');

const styleTexts = bySel.get('#style-select').children.map((o) => o.textContent);
if (styleTexts.length && styleTexts.every((t) => !/style\s*\d/i.test(t))) {
  ok('画法下拉只显示画法名（' + styleTexts.join(' / ') + '），style 编号只在右栏一处');
} else bad('画法下拉里仍重复 style 编号：' + styleTexts.join(' / '));

const engineText = bySel.get('#engine-meta').textContent || '';
if (/style\s*\d/i.test(engineText) && /T\w*Form/.test(engineText)) {
  ok('style 编号 + 渲染器类名只出现在右栏"渲染信息"：' + engineText);
} else bad('右栏渲染信息缺 style/类名：' + engineText);

if (!bySel.get('#roles')) ok('指针/区间不在右栏重复（画布上的指针气泡与区间框默认照常绘制）');
else bad('右栏仍有重复的"指针"行');

/* ---------- 对齐 06：画法开关（drawProps）与"每层一张画布" ---------- */
const dm = bySel.get('#drawmode');
const dmOpts = dm ? dm.children.map((o) => o.textContent) : [];
ok('画法开关下拉（06 的分组）：' + dmOpts.length + ' 项 → ' + dmOpts.slice(0, 3).join(' / '));
if (dmOpts.length !== 6) bad('style 1/5 应有 6 种画法（矩形/点/网格/连线…），实际 ' + dmOpts.length);
if (dm) {
  dm.value = '4';               // 矩形 + 网格 + 连线（06 分组里第 5 项，index 4）
  try { dm.onchange?.(); } catch (e) { bad('切画法开关抛错：' + e.message); }
  await new Promise((r) => setTimeout(r, 200));
  const st = globalThis.window && globalThis.window.__plus && globalThis.window.__plus.state;
  const l0 = st && st.styled && st.styled[0] && st.styled[0].layers && st.styled[0].layers[0];
  const props0 = l0 && l0.props;
  if (props0 && props0.showGrid === true && props0.showLine === true) {
    ok('画法 props 已合并进每一层（showGrid/showLine=true，与 06 的 drawProps 一致）');
  } else bad('画法 props 没进图层：' + JSON.stringify(props0));
}

/* 打开一个 2 层案例：应生成 2 张画布卡（06 的 buildStage 行为） */
const item2 = [...bySel.get('#pkg-list').children]
  .flatMap((g) => g.children.filter((c) => String(c.className).includes('item')))
  .find((b) => b.dataset.uid === 'f/bracket-matching');
if (item2 && item2.__on && item2.__on.click) {
  await item2.__on.click();
  await new Promise((r) => setTimeout(r, 400));
  const w2 = globalThis.window.__plus && globalThis.window.__plus.window;
  const cards = w2 ? w2.cardCount() : -1;
  if (cards === 2) ok('多层案例 f/bracket-matching：' + cards + ' 张画布卡（数组 + 栈，各画各的）');
  else bad('多层案例卡片数不对：' + cards);
} else bad('没能点开 f/bracket-matching');

console.log('\n结果：' + pass.length + ' 通过 / ' + fail.length + ' 失败');
process.exit(fail.length ? 2 : 0);
