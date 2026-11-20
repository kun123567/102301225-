/**
 * html-stage.js -- **HTML div 渲染机制**，按 `raw/datastructure-agent` 的 DOM 契约输出
 *
 * 为什么还要这一层：上一轮的 `svg-stage` 是 SVG 图形，而他们的**外壳与数组帧**用的是
 * HTML `div` 盒子（`.bsviz-cell{flex:0 0 auto;width:96px;padding;border-radius;box-shadow}`），
 * `flex/padding/border-radius` 在 SVG 上全部无效 —— 想把我的引擎塞进他们的渲染层，
 * 必须输出他们那套 **div + .bsviz-\* 类名 + track[data-anim] + 指针 FLIP**。
 *
 * 两种输出：
 *   · 数组族（有 .bsviz-cell 契约）：`.bsviz > .bsviz-track > .bsviz-cell(.bsviz-value/.bsviz-idx)`
 *     + `.bsviz-ptrs > .bsviz-ptr-row > .bsviz-ptr.bsviz-ptr-left|right|mid`
 *     + 状态类 is-in-range/is-excluded/is-range-start/-end/is-mid/is-found
 *     + 错峰入场 bsviz-enter-<i%8>；指针位移用 FLIP（element.animate）
 *     —— **几何交给宿主的 CSS**（宽度/间距/圆角都不由我定），我只给语义，样式自然不变
 *   · 其它族（宿主没有结构）：新增原型 `.bsviz-x > .bsviz-x-el[data-bsviz-kind]`（样式见 bsviz-extra.css），
 *     几何用 inline left/top/width/height，动画仍走同一套 data-anim + 元素类 + FLIP
 *
 * 接口与 canvas-stage / svg-stage **一致**：createStage(host) -> { render, clear, resize, metrics, cardCount, host }
 */

import { dispatch } from '../vendor/engine/dispatch.js';
import { RENDERERS } from '../vendor/catalog/datastructures.js';
import { polishLayout } from './canvas-stage.js';
import { primBox, chipBox, profileOf } from './layout-policy.js';
import { HOST_BSVIZ } from './host-profile.js';

export const CARD_CANVAS_HEIGHT = 300;
export const CARD_MIN_HEIGHT = 130;
const ARRAY_STYLES = new Set([1, 5, 6]);          // 走宿主 .bsviz-cell 契约的画法
const FLIP_MS = 220;

export function layerHint(layer) {
  const d = (layer && layer.data) || {};
  if (Array.isArray(d.values)) {
    return Array.isArray(d.values[0]) ? ` · ${d.values.length}×${d.values[0].length}` : ` · ${d.values.length} 格`;
  }
  if (Array.isArray(d.cells)) return ` · ${d.cells.length} 格`;
  if (Array.isArray(d.nodes)) return ` · ${d.nodes.length} 结点`;
  return '';
}

const reduceMotion = () => {
  try { return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
};

/**
 * 从 roles 里取"区间 / 指针侧 / 是否命中"的语义（宿主状态类要用）
 * 真实结构（add01 的 array 族）：
 *   layer.roles.marks = { range:[a,b], rangeLabel }
 *   layer.roles.pointers = [{ id:'lo'|'hi'|'mid', label:'lo=0', index:0 }]   ← 用 index 指到格子
 */
function semanticsOf(layer) {
  const r = (layer && layer.roles) || {};
  const d = (layer && layer.data) || {};
  const marks = r.marks || d.marks || {};
  const range = Array.isArray(marks.range) ? marks.range : null;
  const pointers = r.pointers || [];
  const sides = {};
  let mid = typeof marks.pointer === 'number' ? marks.pointer : null;
  for (const p of pointers) {
    const side = HOST_BSVIZ.sideOf(p);
    if (!side) continue;
    if (p.index != null) sides[side] = String(p.index);
    else if (p.node != null) sides[side] = String(p.node);
    if (side === 'mid' && p.index != null) mid = Number(p.index);
  }
  // 命中：指针侧 index 落在区间内且只有一个候选时，用事件名兜底（见 paintArray 的 found 参数）
  return { range, mid, sides, done: Array.isArray(r.done) ? r.done.length > 0 : false };
}

export function createStage(host) {
  const doc = (host && host.ownerDocument) || globalThis.document;
  let cards = new Map();
  let lastMetrics = { cards: 0, prims: 0, styles: [], cells: 0, pointers: 0, flips: 0, anim: {} };

  const setClass = (n, cls) => {
    n.className = cls;
    if (n.classList) {
      for (const c of [...(n.classList._s || [])]) n.classList.remove(c);
      for (const c of String(cls).split(/\s+/).filter(Boolean)) n.classList.add(c);
    }
    return n;
  };
  const el = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) setClass(n, cls);
    if (text !== undefined) n.textContent = String(text);
    return n;
  };

  function makeCard(layer, index) {
    const card = el('div', 'canvas-card' + (index === 0 ? ' main' : ''));
    card.dataset.layer = layer.id;
    const header = el('header');
    const b = el('b', '', layer.title || layer.id || ('layer' + index));
    const span = el('span', '', (RENDERERS[layer.style]?.cls || '') + ' · style ' + layer.style + layerHint(layer));
    header.appendChild(b);
    header.appendChild(span);
    card.appendChild(header);

    const wrap = el('div', 'bsviz-wrap');
    const root = el('div', HOST_BSVIZ.name);                    // .bsviz
    const track = el('div', 'bsviz-track');                     // .bsviz-track[data-anim]
    const ptrs = el('div', 'bsviz-ptrs');                       // .bsviz-ptrs
    root.appendChild(track);
    root.appendChild(ptrs);
    wrap.appendChild(root);
    card.appendChild(wrap);
    host.appendChild(card);
    return { card, wrap, root, track, ptrs, byKey: new Map(), id: layer.id, height: CARD_CANVAS_HEIGHT, rects: new Map() };
  }

  function syncCards(layers) {
    const ids = (layers || []).map((l, i) => l.id || ('layer' + i));
    for (const [id, rec] of [...cards.entries()]) if (!ids.includes(id)) { rec.card.remove(); cards.delete(id); }
    (layers || []).forEach((layer, i) => {
      const id = ids[i];
      if (!cards.has(id)) cards.set(id, makeCard(layer, i));
      const rec = cards.get(id);
      const span = rec.card.querySelector('header span');
      if (span) span.textContent = (RENDERERS[layer.style]?.cls || '') + ' · style ' + layer.style + layerHint(layer);
    });
  }

  /* ---------------- 数组族：宿主的 .bsviz-cell 契约 ---------------- */
  function paintArray(rec, layer, anim, event) {
    const d = layer.data || {};
    const values = Array.isArray(d.values) ? d.values : (Array.isArray(d.cells) ? d.cells.map((c) => (c && c.value)) : []);
    const labels = Array.isArray(d.labels) ? d.labels : null;
    const sem = semanticsOf(layer);
    const { range, mid, sides } = sem;
    const found = event === 'found';                       // 宿主用 is-found 给命中配色
    const [lo, hi] = range && range.length === 2 ? [Math.min(range[0], range[1]), Math.max(range[0], range[1])] : [null, null];

    const cellEls = values.map((v, i) => {
      const cell = el('div', 'bsviz-cell');
      cell.setAttribute('data-index', String(i));
      const inRange = lo != null && i >= lo && i <= hi;
      if (lo != null) cell.classList.add(inRange ? 'is-in-range' : 'is-excluded');
      if (lo != null && i === lo) cell.classList.add('is-range-start');
      if (lo != null && i === hi) cell.classList.add('is-range-end');
      if (mid != null && i === mid) cell.classList.add('is-mid');
      if (found && (mid == null || i === mid)) cell.classList.add('is-found');
      cell.appendChild(el('span', 'bsviz-value', v == null ? '·' : String(v)));
      cell.appendChild(el('span', 'bsviz-idx', labels ? String(labels[i]) : String(i)));
      if (anim === 'enter') cell.classList.add('bsviz-enter-' + (i % HOST_BSVIZ.enterStagger));
      return cell;
    });

    // 指针：宿主的固定三行（left / right / mid）
    const rows = [];
    for (const side of ['left', 'right', 'mid']) {
      const nodeId = sides[side];
      if (nodeId == null) continue;
      const row = el('div', 'bsviz-ptr-row');
      const chip = el('span', 'bsviz-ptr bsviz-ptr-' + side, side === 'mid' ? 'M' : side === 'left' ? 'L' : 'R');
      chip.setAttribute('data-node', String(nodeId));
      row.appendChild(chip);
      rows.push({ row, chip, side, nodeId });
    }
    rec.track.replaceChildren(...cellEls);
    rec.ptrs.replaceChildren(...rows.map((r) => r.row));
    return { cells: cellEls.length, pointers: rows.length };
  }

  /* ---------------- 其它族：新增原型（.bsviz-x-el，几何用 inline style） ---------------- */
  function paintGeneric(rec, layer, rect, anim) {
    const P = profileOf(layer.style).policy;
    const res = dispatch(layer.style).instance.layout(layer, rect, { bg: '#ffffff' });
    const prims = polishLayout(res.prims, rect, layer.style, layer);
    const G = HOST_BSVIZ.generic;

    const ordered = prims.map((p, i) => ({ p, i })).sort((a, b) => ((a.p.z || 0) - (b.p.z || 0)) || (a.i - b.i)).map((o) => o.p);
    const seen = new Set();
    const nodes = [];
    for (const p of ordered) {
      const key = p.key || ('k' + seen.size);
      seen.add(key);
      const box = p.kind === 'chip' ? chipBox(p, P) : (primBox(p, P) || { x: 0, y: 0, w: 0, h: 0 });
      let node = rec.byKey.get(key);
      if (!node || !node.el) {
        node = { el: el('div', G.el), key };
        node.el.setAttribute('data-bsviz-key', key);
        rec.byKey.set(key, node);
      }
      const e = node.el;
      e.setAttribute('data-bsviz-kind', p.kind);
      setClass(e, G.el + (p.kind === 'chip' ? ' ' + G.chip : p.kind === 'text' ? ' ' + G.text : (p.kind === 'line' || p.kind === 'poly') ? ' ' + G.line : ''));
      e.style.left = Math.round(box.x) + 'px';
      e.style.top = Math.round(box.y) + 'px';
      e.style.width = Math.max(1, Math.round(box.w)) + 'px';
      e.style.height = Math.max(1, Math.round(box.h)) + 'px';
      e.style.opacity = p.opacity == null ? '1' : String(p.opacity);
      // 按图元类型分别渲染（不能一视同仁当"盒子"：线段/文字/圆各不相同）
      e.style.transform = '';
      e.style.borderStyle = 'solid';
      if (p.kind === 'chip') {
        e.textContent = String(p.text ?? '');
        e.style.borderColor = p.stroke || '#0b5cad';
        e.style.color = p.color || p.stroke || '#0b5cad';
        e.style.background = p.fill || '#e7f1fd';
        e.style.borderRadius = '999px';
      } else if (p.kind === 'text') {
        e.textContent = String(p.text ?? '');
        e.style.color = p.fill || '#172033';
        e.style.background = 'transparent';
        e.style.borderColor = 'transparent';
        e.style.fontSize = (parseInt(String(p.font || '').match(/(\d+)px/)?.[1] || '11', 10) + 1) + 'px';
        e.style.fontWeight = /600|700/.test(String(p.font || '')) ? '700' : '500';
      } else if (p.kind === 'line' || p.kind === 'poly') {
        // 线段/折线：细长条 + 绕左端旋转（SVG 的 line 在 DOM 里这样表达最接近）
        const a = p.kind === 'poly'
          ? { x1: p.pts?.[0]?.[0] ?? 0, y1: p.pts?.[0]?.[1] ?? 0, x2: p.pts?.[p.pts.length - 1]?.[0] ?? 0, y2: p.pts?.[p.pts.length - 1]?.[1] ?? 0 }
          : { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 };
        const len = Math.max(1, Math.hypot(a.x2 - a.x1, a.y2 - a.y1));
        const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1) * 180 / Math.PI;
        e.textContent = '';
        e.style.left = Math.round(Math.min(a.x1, a.x2)) + 'px';
        e.style.top = Math.round(Math.min(a.y1, a.y2)) + 'px';
        e.style.width = Math.round(len) + 'px';
        e.style.height = Math.max(1, Math.round(p.sw || 1.4)) + 'px';
        e.style.background = p.stroke || '#94a3b8';
        e.style.border = '0';
        e.style.transformOrigin = '0 50%';
        e.style.transform = 'rotate(' + ang.toFixed(2) + 'deg)';
        if (p.dash) e.style.background = 'repeating-linear-gradient(90deg, ' + (p.stroke || '#94a3b8') + ' 0 4px, transparent 4px 8px)';
      } else {
        // rect / circle：盒子；圆用 50% 圆角
        e.textContent = '';
        e.style.background = p.fill || 'transparent';
        e.style.borderColor = p.stroke || '#cbd5e1';
        e.style.borderRadius = p.kind === 'circle' ? '50%' : (p.r ? p.r + 'px' : '6px');
      }
      if (anim === 'enter') e.classList.add('bsviz-x-enter');
      nodes.push(e);
    }
    setClass(rec.root, 'bsviz ' + G.root);
    setClass(rec.track, 'bsviz-track bsviz-x-track');
    rec.track.replaceChildren(...nodes);
    rec.ptrs.replaceChildren();
    return { cells: nodes.length, pointers: 0 };
  }

  /** 指针 FLIP：量旧位置 → 重建 → 量新位置 → element.animate 滑过去（与宿主的做法一致） */
  function measurePointers(rec) {
    const out = new Map();
    for (const chip of rec.ptrs.childNodes || []) {
      const inner = (chip.childNodes && chip.childNodes[0]) || chip;
      if (!inner || typeof inner.getBoundingClientRect !== 'function') continue;
      const r = inner.getBoundingClientRect();
      const id = (inner.getAttribute && inner.getAttribute('data-node')) || inner.textContent;
      out.set(String(id), { x: r.left || r.x || 0, y: r.top || r.y || 0 });
    }
    return out;
  }
  function flipPointers(rec, before, reduced) {
    if (reduced || !before || !before.size) return 0;
    let n = 0;
    for (const row of rec.ptrs.childNodes || []) {
      const chip = (row.childNodes && row.childNodes[0]) || row;
      if (!chip || typeof chip.getBoundingClientRect !== 'function' || typeof chip.animate !== 'function') continue;
      const id = (chip.getAttribute && chip.getAttribute('data-node')) || chip.textContent;
      const prev = before.get(String(id));
      if (!prev) continue;
      const r = chip.getBoundingClientRect();
      const dx = prev.x - (r.left || r.x || 0);
      const dy = prev.y - (r.top || r.y || 0);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      chip.animate([{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` }, { transform: 'translate(0px, 0px)' }],
        { duration: FLIP_MS, easing: 'cubic-bezier(.22,.68,.32,1)' });
      n += 1;
    }
    return n;
  }

  function measure(rec) {
    const r = rec.card.getBoundingClientRect ? rec.card.getBoundingClientRect() : null;
    return { w: Math.max(320, Math.round((r && r.width) || host.clientWidth || 800)), h: rec.height };
  }
  function resize() {
    for (const rec of cards.values()) {
      rec.wrap.style.height = rec.height + 'px';
      rec.root.style.height = rec.height + 'px';
      rec.track.style.minHeight = (rec.height - 28) + 'px';
    }
  }

  function render(layers, opt = {}) {
    const list = (layers || []).filter(Boolean);
    syncCards(list);
    resize();
    let prims = 0;
    let cells = 0;
    let pointers = 0;
    let flips = 0;
    const styles = [];
    const anim = { enter: 0, exit: 0, flash: 0, dim: 0 };
    const reduced = reduceMotion() || opt.animate === false;

    for (const [id, rec] of cards.entries()) {
      const to = list.find((l) => (l.id || '') === id) || null;
      if (!to) continue;
      styles.push(to.style);
      const before = measurePointers(rec);
      const event = HOST_BSVIZ.mapEvent(opt.event != null ? opt.event : (to.event || (to.data && to.data.event) || 'none'));
      const animKind = before.size === 0 && !reduced ? 'enter' : 'none';
      try {
        const isArray = ARRAY_STYLES.has(to.style) && Array.isArray((to.data || {}).values);
        const r = isArray
          ? paintArray(rec, to, animKind, event)
          : paintGeneric(rec, to, { x: 0, y: 0, w: measure(rec).w, h: rec.height }, animKind);
        rec.track.setAttribute('data-anim', event);            // ← 宿主的动画挂载点（事件名）
        rec.track.dataset.anim = event;
        if (animKind === 'enter') anim.enter += 1;
        flips += flipPointers(rec, before, reduced);
        cells += r.cells;
        pointers += r.pointers;
        prims += r.cells + r.pointers;
      } catch (e) {
        const t = el('div', 'bsviz-error', '渲染失败：' + e.message);
        rec.track.replaceChildren(t);
      }
    }
    lastMetrics = { cards: cards.size, prims, styles, cells, pointers, flips, anim };
    return lastMetrics;
  }

  function clear() {
    for (const rec of cards.values()) rec.card.remove();
    cards = new Map();
    lastMetrics = { cards: 0, prims: 0, styles: [], cells: 0, pointers: 0, flips: 0, anim: {} };
  }

  return {
    render,
    clear,
    resize,
    metrics: () => lastMetrics,
    cardCount: () => cards.size,
    host,
    /** 测试/调试：某层当前 DOM 的类名与动画属性 */
    snapshot: (id) => {
      const rec = cards.get(id);
      if (!rec) return null;
      const classes = [];
      const walk = (node, depth) => {
        for (const c of node.childNodes || []) {
          classes.push({ depth, tag: c.tagName || '', cls: c.className || '', anim: (c.getAttribute && c.getAttribute('data-anim')) || null });
          if (depth < 4) walk(c, depth + 1);
        }
      };
      walk(rec.root, 0);
      return { trackAnim: rec.track.getAttribute('data-anim'), classes };
    },
  };
}
