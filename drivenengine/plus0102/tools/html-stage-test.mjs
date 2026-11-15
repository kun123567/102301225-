/**
 * tools/html-stage-test.mjs -- 验证 html-stage 真的按 raw/datastructure-agent 的 DOM 契约输出
 *
 * 断言：
 *   ① 数组族：`.bsviz > .bsviz-track > .bsviz-cell`（**div**）＋ `.bsviz-value` / `.bsviz-idx`
 *   ② 指针：`.bsviz-ptrs > .bsviz-ptr-row > .bsviz-ptr.bsviz-ptr-left|right|mid`
 *   ③ 状态类：is-in-range / is-excluded / is-range-start / is-range-end / is-mid / is-found
 *   ④ 动画挂载点：`track[data-anim]` = 映射后的事件名；入场 `bsviz-enter-<i%8>`；指针位移走 FLIP(`element.animate`)
 *   ⑤ **这些类名在宿主的 visualization.css 里都存在**（= 宿主的 CSS 不用改就能生效）
 *   ⑥ 其它族：新增原型 `.bsviz-x` + `.bsviz-x-el`（样式在 app/bsviz-extra.css，且该文件不重定义宿主类）
 *
 * 用法：node tools/html-stage-test.mjs
 */
import { join, resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const HOST_CSS = 'D:\\.FZU\\03Software\\04\\raw\\datastructure-agent\\frontend\\src\\features\\visualization\\visualization.css';
let pass = 0;
let fail = 0;
const ok = (s, cond, extra) => {
  if (cond) { pass += 1; console.log('  ✓ ' + s); }
  else { fail += 1; console.log('  ✗ ' + s + (extra ? '  → ' + extra : '')); }
};

/* ---------------- 假 DOM（含 FLIP 探针） ---------------- */
let flipCalls = 0;
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), className: '', textContent: '', dataset: {}, style: {}, attributes: {}, childNodes: [],
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
      toggle(c, on) { on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (on ? this._s.add(c) : this._s.delete(c)); },
    },
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'data-anim') this.dataset.anim = String(v); },
    getAttribute(k) { return this.attributes[k] ?? null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { this.childNodes.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); return c; },
    replaceChildren(...cs) { this.childNodes = []; cs.forEach((c) => this.appendChild(c)); },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 96, height: 60 }; },
    animate() { flipCalls += 1; },
  };
  return el;
}
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
globalThis.document = { body: makeEl('body'), createElement: (t) => makeEl(t), createElementNS: (ns, t) => makeEl(t) };
globalThis.matchMedia = () => ({ matches: false });

const { createStage, CARD_CANVAS_HEIGHT } = await import(pathToFileURL(join(ROOT, 'app/html-stage.js')).href);
const { HOST_BSVIZ } = await import(pathToFileURL(join(ROOT, 'app/host-profile.js')).href);
const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);

/* ---------------- 找一个"数组族 + 区间 + 指针"的真实案例 ---------------- */
let pick = null;
for (const it of ITEMS) {
  let mod;
  try { mod = await import(pathToFileURL(join(ROOT, 'vendor', it.path)).href); } catch { continue; }
  const input = (mod.samples?.[0] || {}).input || {};
  let trace;
  try { trace = mod.run('v1', input); } catch { continue; }
  for (const [si, st] of (trace.steps || []).entries()) {
    for (const layer of st.layers || []) {
      const d = layer.data || {};
      const ptrs = (layer.roles || {}).pointers || [];
      const marks = (layer.roles && layer.roles.marks) || d.marks || {};
      if ([1, 5, 6].includes(layer.style) && Array.isArray(d.values) && d.values.length && Array.isArray(marks.range) && ptrs.length) {
        pick = { it, layer, step: st, si, steps: trace.steps };
        break;
      }
    }
    if (pick) break;
  }
  if (pick) break;
}

console.log('\n① 数组族：宿主的 .bsviz-cell 契约（div，不是 svg）');
if (!pick) {
  ok('找到"数组族 + 区间 + 指针"的真实案例', false, '目录里没找到符合条件的层');
} else {
  console.log(`  用 ${pick.it.uid} 第 ${pick.si} 步（style ${pick.layer.style}）`);
  const host = makeEl('div');
  host.clientWidth = 900;
  const stage = createStage(host);
  const m = stage.render([pick.layer], { event: pick.step.event, animate: true });
  const card = host.childNodes[0];
  const wrap = card.childNodes.find((c) => c.className === 'bsviz-wrap');
  const root = wrap && wrap.childNodes[0];
  const track = root && root.childNodes.find((c) => c.className === 'bsviz-track');
  const ptrs = root && root.childNodes.find((c) => c.className === 'bsviz-ptrs');
  ok('根是 .bsviz', !!root && root.classList.contains('bsviz'));
  ok('轨道是 .bsviz-track（div）', !!track && track.tagName === 'DIV');
  const cells = track ? track.childNodes : [];
  ok('格子是 .bsviz-cell（div）且数量 = 数组长度', cells.length === pick.layer.data.values.length && cells.every((c) => c.classList.contains('bsviz-cell') && c.tagName === 'DIV'),
    `cells=${cells.length} values=${pick.layer.data.values.length}`);
  ok('每格有 .bsviz-value 与 .bsviz-idx', cells.every((c) => {
    const kids = c.childNodes || [];
    return kids.some((k) => k.classList && k.classList.contains('bsviz-value')) && kids.some((k) => k.classList && k.classList.contains('bsviz-idx'));
  }));

  console.log('\n② 指针：.bsviz-ptrs > .bsviz-ptr-row > .bsviz-ptr.bsviz-ptr-*');
  ok('有 .bsviz-ptrs 容器', !!ptrs);
  const rows = ptrs ? ptrs.childNodes : [];
  ok('指针行是 .bsviz-ptr-row', rows.length > 0 && rows.every((r) => r.classList.contains('bsviz-ptr-row')), `rows=${rows.length}`);
  const chips = rows.map((r) => (r.childNodes || [])[0]).filter(Boolean);
  ok('指针是 .bsviz-ptr + bsviz-ptr-{left|right|mid}', chips.length > 0 && chips.every((c) => c.classList.contains('bsviz-ptr') &&
    (c.classList.contains('bsviz-ptr-left') || c.classList.contains('bsviz-ptr-right') || c.classList.contains('bsviz-ptr-mid'))));

  console.log('\n③ 状态类（宿主 CSS 里 is-* 才有配色）');
  const allCells = cells.map((c) => [...c.classList._s]);
  const flat = allCells.flat();
  ok('区间内/外标记存在', flat.includes('is-in-range') && flat.includes('is-excluded'), flat.join(','));
  ok('区间起止标记存在', flat.includes('is-range-start') && flat.includes('is-range-end'));
  const expectMid = chips.some((c) => c.classList.contains('bsviz-ptr-mid'));
  ok('is-mid 与该步"是否存在 mid 指针"一致', flat.includes('is-mid') === expectMid, 'expectMid=' + expectMid + ' has=' + flat.includes('is-mid'));
  ok('is-found 只在该步事件为 found 时出现', flat.includes('is-found') === (HOST_BSVIZ.mapEvent(pick.step.event) === 'found'),
    'event=' + pick.step.event + ' has=' + flat.includes('is-found'));

  console.log('\n④ 动画挂载点：track[data-anim] + 入场错峰 + FLIP');
  const expectEvent = HOST_BSVIZ.mapEvent(pick.step.event);
  ok('track[data-anim] = 映射后的事件名', track.getAttribute('data-anim') === expectEvent, `${track.getAttribute('data-anim')} vs ${expectEvent}`);
  ok('首帧格子带 bsviz-enter-<i%8>', allCells.some((cs) => cs.some((c) => /^bsviz-enter-[0-7]$/.test(c))));
  const m2 = stage.render([pick.layer], { event: 'compare', animate: true });
  ok('第二帧事件变化会重设 data-anim', track.getAttribute('data-anim') === HOST_BSVIZ.mapEvent('compare'));
  console.log(` （FLIP 调用次数：${flipCalls}；prims=${m.prims} cells=${m.cells} pointers=${m.pointers}）`);
  void m2;

  console.log('\n⑤ 这些类名在宿主 visualization.css 里都存在（= 宿主 CSS 不用改）');
  if (!existsSync(HOST_CSS)) {
    console.log('  ⚠ 宿主 CSS 不在本机路径，跳过交叉校验：' + HOST_CSS);
  } else {
    const css = readFileSync(HOST_CSS, 'utf8');
    const used = new Set();
    for (const cs of allCells) cs.forEach((c) => { if (c.startsWith('bsviz-') || c.startsWith('is-')) used.add(c); });
    for (const c of chips) (c.classList._s ? [...c.classList._s] : []).forEach((x) => used.add(x));
    for (const c of ['bsviz', 'bsviz-track', 'bsviz-cell', 'bsviz-value', 'bsviz-idx', 'bsviz-ptrs', 'bsviz-ptr-row', 'bsviz-ptr', 'bsviz-ptr-left', 'bsviz-ptr-right', 'bsviz-ptr-mid']) used.add(c);
    const missing = [...used].filter((c) => !new RegExp('\\.' + c.replace(/[-]/g, '\\-') + '(?![\\w-])').test(css));
    ok('用到的宿主类名全部存在于它的 CSS', missing.length === 0, missing.join(','));
  }
}

console.log('\n⑥ 其它族：新增原型 .bsviz-x（新 CSS，不重定义宿主类）');
{
  const tree = ITEMS.find((i) => i.uid === 'd/avl-tree');
  const mod = await import(pathToFileURL(join(ROOT, 'vendor', tree.path)).href);
  const trace = mod.run('v1', (mod.samples?.[0] || {}).input || {});
  const layer = trace.steps[10].layers.find((l) => l.style === 9) || trace.steps[10].layers[0];
  const host = makeEl('div');
  host.clientWidth = 900;
  const stage = createStage(host);
  const m = stage.render([layer], { event: 'init', animate: true });
  const wrap = host.childNodes[0].childNodes.find((c) => c.className === 'bsviz-wrap');
  const root = wrap.childNodes[0];
  ok('根同时带 bsviz 与 bsviz-x', root.classList.contains('bsviz') && root.classList.contains('bsviz-x'), root.className);
  const trackEl = root.childNodes.find((c) => String(c.className).indexOf('bsviz-track') >= 0);
  const els = (trackEl && trackEl.childNodes) || [];
  ok('图元都成了 .bsviz-x-el', els.length > 0 && els.every((e) => e.classList.contains('bsviz-x-el')));
  ok('带 data-bsviz-kind 与 inline 几何', els.every((e) => e.getAttribute('data-bsviz-kind') && /px$/.test(String(e.style.left)) && /px$/.test(String(e.style.top))));
  const extra = readFileSync(join(ROOT, 'app/bsviz-extra.css'), 'utf8');
  ok('bsviz-extra.css 定义了 .bsviz-x-el 与 .bsviz-x', extra.includes('.bsviz-x-el') && extra.includes('.bsviz-x '));
  const hostDefined = ['bsviz-cell', 'bsviz-ptr', 'bsviz-track', 'bsviz-value'];
  const extraCode = extra.replace(/\/\*[\s\S]*?\*\//g, '');   // 注释里提到类名不算"重定义"
  ok('bsviz-extra.css **没有**重定义宿主已有的类', hostDefined.every((c) => !new RegExp('\\.' + c + '(?![\\w-])').test(extraCode)));
  console.log(`  （generic 层：prims=${m.prims} cells=${m.cells}）`);
}


console.log('\n⑦ 独立预览必须有"能看见"的基础样式（否则数组格子无宽高 = 不可显示）');
{
  const base = readFileSync(join(ROOT, 'app/bsviz-base.css'), 'utf8');
  const need = ['bsviz-cell', 'bsviz-track', 'bsviz-value', 'bsviz-idx', 'bsviz-ptr', 'bsviz-ptr-row', 'bsviz-ptrs',
    'is-in-range', 'is-excluded', 'is-mid', 'is-found', 'bsviz-enter-0'];
  const miss = need.filter((c) => base.indexOf('.' + c) < 0);
  ok('bsviz-base.css 定义了 html 模式用到的宿主类', miss.length === 0, miss.join(','));
  ok('格子给了明确宽度（flex:0 0 auto + width）', /\.bsviz-cell\s*\{[\s\S]*?width:\s*\d+px/.test(base));
}

console.log('\n⑧ 通用族按图元类型渲染（线段不再是盒子）');
{
  const tree = ITEMS.find((i) => i.uid === 'd/avl-tree');
  const mod = await import(pathToFileURL(join(ROOT, 'vendor', tree.path)).href);
  const trace = mod.run('v1', (mod.samples?.[0] || {}).input || {});
  const layer = trace.steps[10].layers.find((l) => l.style === 9) || trace.steps[10].layers[0];
  const host = makeEl('div');
  host.clientWidth = 900;
  const stage = createStage(host);
  stage.render([layer], { event: 'init', animate: true });
  const wrap = host.childNodes[0].childNodes.find((c) => c.className === 'bsviz-wrap');
  const trackEl = wrap.childNodes[0].childNodes.find((c) => String(c.className).indexOf('bsviz-track') >= 0);
  const els = trackEl.childNodes || [];
  const lines = els.filter((e) => e.classList.contains('bsviz-x-line'));
  const texts = els.filter((e) => e.classList.contains('bsviz-x-text'));
  const circles = els.filter((e) => e.getAttribute('data-bsviz-kind') === 'circle');
  ok('线段元素带 bsviz-x-line 且用 rotate 定位', lines.length > 0 && lines.every((e) => /rotate\(/.test(String(e.style.transform))), 'lines=' + lines.length);
  ok('文字元素无边框（bsviz-x-text 类）', texts.length > 0 && texts.every((e) => e.style.borderColor === 'transparent'));
  ok('圆元素用 50% 圆角', circles.length > 0 && circles.every((e) => String(e.style.borderRadius) === '50%'), 'circles=' + circles.length);
}

console.log('\n⑨ 默认机制仍然是 svg（html 是实验态，需 ?render=html）');
{
  const vw = readFileSync(join(ROOT, 'app/viz-window.js'), 'utf8');
  ok("viz-window 默认回落到 'svg'", /return m === 'canvas' \|\| m === 'html' \? m : 'svg'/.test(vw));
}
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
