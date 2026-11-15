/**
 * tools/host-frame-test.mjs -- 证明"用 plus01&02 的内容替换宿主前端逻辑、而它的样式/动画零改动"可行
 *
 * 做法：用 `app/host-frame.js` 把一个 **plus01&02 的真实层**（style 1：数组 + 区间 + 指针）
 * 转成宿主的帧结构 `{ cells: [<svg class="prototype-array">], pointers: Map }`，然后断言：
 *   ① 帧结构与宿主 `prototype-array.js` 的产物一致（svg/class/data-index/子元素类别）
 *   ② 状态类与该步语义一致（is-excluded / is-mid / is-found）
 *   ③ 指针药丸是 `.prototype-marker.is-{left|right|mid}` 且带 `data-ptr`（宿主 FLIP 靠它量位置）
 *   ④ **我输出的每一个类名都能在宿主的 visualization.css 里找到**
 *      ⇒ 它的样式与动画一个字节都不用改
 *
 * 用法：node tools/host-frame-test.mjs
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

/* 假 DOM（只要 createElementNS + setAttribute/appendChild/classList 这四样） */
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), textContent: '', childNodes: [], attributes: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
      get value() { return [...this._s].join(' '); },
    },
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') { if (this.classList) for (const c of String(v).split(/\s+/).filter(Boolean)) this.classList.add(c); } },
    getAttribute(k) { return this.attributes[k] ?? null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { this.childNodes.push(c); c.parentNode = this; return c; },
    append(...cs) { cs.forEach((c) => this.appendChild(c)); return this; },
    querySelector() { return null; }, querySelectorAll() { return []; },
  };
  return el;
}
globalThis.document = { createElement: (t) => makeEl(t), createElementNS: (ns, t) => makeEl(t) };

const { buildArrayFrame, asFrameBuilder } = await import(pathToFileURL(join(ROOT, 'app/host-frame.js')).href);
const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);

/* 找一个"数组 + 区间 + 指针"的真实层 */
let pick = null;
for (const it of ITEMS) {
  let mod;
  try { mod = await import(pathToFileURL(join(ROOT, 'vendor', it.path)).href); } catch { continue; }
  const input = (mod.samples?.[0] || {}).input || {};
  let trace;
  try { trace = mod.run('v1', input); } catch { continue; }
  for (const [si, st] of (trace.steps || []).entries()) {
    for (const layer of st.layers || []) {
      const r = layer.roles || {};
      const marks = r.marks || {};
      const ptrs = r.pointers || [];
      if ([1, 5, 6].includes(layer.style) && Array.isArray((layer.data || {}).values) && Array.isArray(marks.range) && ptrs.length) {
        pick = { it, layer, step: st, si };
        break;
      }
    }
    if (pick) break;
  }
  if (pick) break;
}

console.log('=== 帧契约适配器（用 plus01&02 的内容喂宿主的 frameBuilder）===');
if (!pick) {
  ok('找到可用的真实层', false);
} else {
  console.log(`  用 ${pick.it.uid} 第 ${pick.si} 步（style ${pick.layer.style}，values=${JSON.stringify(pick.layer.data.values)}）`);
  const frame = buildArrayFrame(pick.layer);

  console.log('\n① 帧结构与宿主 buildPrototypeArrayFrame 一致');
  ok('返回 { cells:[svg], pointers:Map }', !!frame && Array.isArray(frame.cells) && frame.cells.length === 1 && frame.pointers instanceof Map);
  const chart = frame.cells[0];
  ok('根是 <svg class="prototype-array">', chart.tagName === 'SVG' && chart.classList.contains('prototype-array'));
  ok('带 width/height/viewBox（宿主按它缩放）', !!chart.getAttribute('width') && !!chart.getAttribute('height') && /^0 0 \d+ \d+$/.test(chart.getAttribute('viewBox')));
  const cells = chart.childNodes.filter((n) => n.classList && n.classList.contains('prototype-array-cell'));
  ok('格子数 = 数组长度，且带 data-index', cells.length === pick.layer.data.values.length && cells.every((c, i) => c.getAttribute('data-index') === String(i)),
    `cells=${cells.length} values=${pick.layer.data.values.length}`);
  const hasValue = (node) => {
    if (node.classList && node.classList.contains('prototype-array-value')) return true;
    return (node.childNodes || []).some(hasValue);
  };
  ok('每格有 .prototype-array-value（柱顶数值，与宿主同在 <g> 里）', cells.every(hasValue));
  ok('有坐标轴 path（.prototype-array-axis）', chart.childNodes.some((n) => n.classList && n.classList.contains('prototype-array-axis')));

  console.log('\n② 状态类与该步语义一致');
  const marks = (pick.layer.roles || {}).marks || {};
  const [lo, hi] = marks.range || [null, null];
  const cls = (c) => [...c.classList._s];
  const excludedOk = cells.every((c, i) => cls(c).includes('is-excluded') === (i < Math.min(lo, hi) || i > Math.max(lo, hi)));
  ok('is-excluded 与区间一致', excludedOk);
  const ptrs = (pick.layer.roles || {}).pointers || [];
  const hasMid = ptrs.some((p) => /^(m|mid|middle)$/i.test(String(p.id)));
  ok('is-mid 与"是否有 mid 指针"一致', cells.some((c) => cls(c).includes('is-mid')) === hasMid);

  console.log('\n③ 指针药丸符合宿主 FLIP 的选择器');
  const markers = chart.childNodes.filter((n) => n.classList && n.classList.contains('prototype-marker'));
  ok('指针是 .prototype-marker.is-{left|right|mid}', markers.length > 0 && markers.every((m) => ['is-left', 'is-right', 'is-mid'].some((k) => m.classList.contains(k))), `markers=${markers.length}`);
  ok('带 data-ptr（宿主靠它量旧/新位置做 FLIP）', markers.every((m) => !!m.getAttribute('data-ptr')));
  ok('pointers Map 也给出了（与宿主返回一致）', frame.pointers.size === markers.length);

  console.log('\n④ 我输出的类名全部存在于宿主的 visualization.css（⇒ 样式动画零改动）');
  if (!existsSync(HOST_CSS)) {
    console.log('  ⚠ 宿主 CSS 不在本机路径，跳过：' + HOST_CSS);
  } else {
    const css = readFileSync(HOST_CSS, 'utf8');
    const used = new Set();
    const walk = (n) => {
      if (n.classList) for (const c of n.classList._s) used.add(c);
      for (const c of n.childNodes || []) walk(c);
    };
    walk(chart);
    // 宿主用 `prototype-marker is-${key}` 生成侧类：is-right / is-mid 有专门规则，is-left 走 `.prototype-marker` 基础规则
    const markerSides = ['is-left', 'is-right', 'is-mid'];
    const missing = [...used].filter((c) => markerSides.indexOf(c) < 0 &&
      !new RegExp('\\.' + c.replace(/[-.]/g, (m) => '\\' + m) + '(?![\\w-])').test(css));
    ok('类名全部命中宿主 CSS（marker 侧类按宿主模板规则豁免）', missing.length === 0, missing.join(','));
    console.log('   （用到的类：' + [...used].sort().join(', ') + '）');
  }

  console.log('\n⑤ 也能直接吃 Step v1（宿主 frameBuilder 的入参形状）');
  const stepV1 = {
    array: pick.layer.data.values.slice(),
    variables: { left: lo, right: hi, mid: hasMid ? (ptrs.find((p) => /^(m|mid)$/i.test(String(p.id))) || {}).index ?? null : null },
    event: pick.step.event, result: null,
  };
  const frame2 = buildArrayFrame(stepV1);
  ok('Step v1 入参同样产出合法帧', !!frame2 && frame2.cells.length === 1 && frame2.cells[0].childNodes.filter((n) => n.classList && n.classList.contains('prototype-array-cell')).length === stepV1.array.length);
  ok('asFrameBuilder 就是宿主签名（可直接赋值给 frameBuilder）', typeof asFrameBuilder === 'function' && !!asFrameBuilder(stepV1));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
