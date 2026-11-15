/**
 * host-frame.js -- **帧契约适配器**：把 plus01&02 的层数据，输出成
 * `raw/datastructure-agent` 里 `frameBuilder` 期望的东西
 *
 * 他们的契约（`frontend/src/features/visualization/index.js:352`）：
 *     const frame = frameBuilder(step, options) ?? buildFrame(step, options);
 *     track.replaceChildren(...frame.cells);          // ← 只要给我 { cells: [Element] }
 * 默认实现是 `buildPrototypeArrayFrame`（`prototype-array.js`），返回：
 *     { cells: [<svg class="prototype-array">…], pointers: new Map() }
 *
 * 所以"用 plus01&02 的内容替换它的前端逻辑、而它的样式/动画一个都不变"的**最后一公里**就是：
 * 用我的层数据，产出**同样的 SVG 帧结构 + 同样的类名**（这些类名全部定义在它的
 * visualization.css 里：`.prototype-array*`、`.prototype-marker*`、`is-excluded/is-mid/is-found/is-comparing`）。
 *
 * 本文件不依赖 plus01&02 的任何 CSS —— 颜色/字号/动效全部由宿主的样式表决定。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(doc, name, attrs, text) {
  const node = doc.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = String(text);
  return node;
}

/** 指针三行在宿主里的固定 y（取自它的 MARKERS 常量语义：左/右在上，中在下） */
const MARKER_Y = { left: 46, right: 46, mid: 26 };
const MARKER_LABEL = { left: 'L', right: 'R', mid: 'M' };

/** 从 plus01&02 的层里取"数组 + 区间 + 指针"；也接受已经是 Step v1 形状的入参 */
function normalize(input) {
  if (!input) return null;
  // ① Step v1（{array, variables:{left,right}, event}）
  if (Array.isArray(input.array)) {
    return {
      array: input.array,
      left: input.variables ? input.variables.left : null,
      right: input.variables ? input.variables.right : null,
      mid: input.variables ? input.variables.mid : null,
      event: input.event || 'none',
      result: input.result == null ? null : input.result,
      pointers: [],
    };
  }
  // ② plus01&02 的 layer（data.values + roles.marks/pointers）
  const d = input.data || {};
  const r = input.roles || {};
  const values = Array.isArray(d.values) ? d.values : (Array.isArray(d.cells) ? d.cells.map((c) => (c && c.value)) : []);
  const marks = r.marks || d.marks || {};
  const range = Array.isArray(marks.range) ? marks.range : null;
  const pointers = (r.pointers || []).map((p) => ({ id: p.id, label: p.label, index: p.index }));
  const found = (r.done && r.done.length) || false;
  return {
    array: values,
    left: range ? Math.min(range[0], range[1]) : null,
    right: range ? Math.max(range[0], range[1]) : null,
    mid: typeof marks.pointer === 'number' ? marks.pointer : (pointers.find((p) => /^(m|mid|middle)$/i.test(String(p.id))) || {}).index ?? null,
    event: found ? 'found' : (input.event || (d && d.event) || 'probe'),
    result: found ? (pointers[0] && pointers[0].index) ?? null : null,
    pointers,
  };
}

/** 指针 → 宿主的三条行（与 host-profile.js 的规则一致，这里独立一份，避免宿主侧多依赖） */
function sideOf(p) {
  const id = String((p && (p.id || p.label)) || '');
  if (/^(l|lo|left|low|begin|start)$/i.test(id)) return 'left';
  if (/^(r|hi|right|high|end|last)$/i.test(id)) return 'right';
  if (/^(m|mid|middle|center|pivot|probe)$/i.test(id)) return 'mid';
  return null;
}

/**
 * buildArrayFrame -- 产出与宿主 `buildPrototypeArrayFrame` **同结构**的帧
 *
 * 几何完全照它的实现（spacing 26~56、padLeft 34、height 202、top 64 / bottom 158、index 文本 y=187），
 * 这样它的 `.prototype-array*` 样式与 `.prototype-marker*` 药丸/配色原样生效。
 *
 * @param {object} input plus01&02 的 layer，或 Step v1
 * @param {{doc?:Document, width?:number, height?:number}} [opts]
 * @returns {{cells: Element[], pointers: Map<string, Element>}|null}
 */
export function buildArrayFrame(input, opts = {}) {
  const doc = opts.doc || (globalThis.document);
  const st = normalize(input);
  if (!st || !st.array || !st.array.length) return null;

  const count = st.array.length;
  const spacing = Math.max(26, Math.min(56, Math.floor(640 / count)));
  const padLeft = 34;
  const width = opts.width || (padLeft + spacing * count + 18);
  const height = opts.height || 202;
  const top = 64;
  const bottom = 158;

  const min = Math.min(0, ...st.array);
  const max = Math.max(0, ...st.array);
  const yFor = (v) => bottom - ((v - min) / (max - min || 1)) * (bottom - top);
  const zero = yFor(0);
  const center = (i) => padLeft + (i + 0.5) * spacing;

  const chart = svgEl(doc, 'svg', { class: 'prototype-array', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' });
  const xEnd = width - 10;
  chart.appendChild(svgEl(doc, 'path', {
    class: 'prototype-array-axis',
    d: `M ${padLeft} ${zero} H ${xEnd} m -4 -4 l 4 4 -4 4 M ${padLeft} ${bottom} V ${top - 6} m -4 4 l 4 -4 4 4`,
  }));
  chart.appendChild(svgEl(doc, 'text', { x: xEnd - 4, y: zero - 9 }, 'X'));
  chart.appendChild(svgEl(doc, 'text', { x: padLeft - 10, y: top - 2 }, 'Y'));

  const barWidth = spacing * 0.6;
  const midIndex = st.mid;
  const foundIndex = st.event === 'found' ? st.result : null;

  st.array.forEach((value, index) => {
    const x = center(index);
    const y = yFor(value);
    const excluded = st.left != null && (index < st.left || index > st.right);

    const cell = svgEl(doc, 'g', { class: 'prototype-array-cell', 'data-index': index });
    if (excluded) cell.classList.add('is-excluded');            // ← 宿主的 .prototype-array-cell.is-excluded
    if (midIndex != null && index === midIndex) cell.classList.add('is-mid');
    if (foundIndex != null && index === foundIndex) cell.classList.add('is-found');

    const label = String(value);
    const valueLabel = svgEl(doc, 'text', { class: 'prototype-array-value', x, y: value < 0 ? y + 13 : y - 6 }, label);
    if (label.length > Math.floor((spacing - 4) / 6)) {
      valueLabel.setAttribute('textLength', String(spacing - 4));
      valueLabel.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
    const mark = svgEl(doc, 'g', {});
    mark.appendChild(svgEl(doc, 'rect', {
      x: x - barWidth / 2,
      y: value === 0 ? zero - 2 : Math.min(y, zero),
      width: barWidth,
      height: Math.max(2, Math.abs(zero - y)),
      rx: 2,
    }));
    mark.appendChild(valueLabel);
    cell.appendChild(mark);
    cell.appendChild(svgEl(doc, 'path', { class: 'prototype-array-axis', d: `M ${x} ${zero} v 4` }));
    cell.appendChild(svgEl(doc, 'text', { x, y: 187 }, index));
    chart.appendChild(cell);
  });

  // 指针药丸（宿主的 .prototype-marker.is-left/right/mid + data-ptr 用于 FLIP 量取）
  const pointers = new Map();
  const seen = new Set();
  for (const p of st.pointers) {
    const side = sideOf(p);
    if (!side || seen.has(side)) continue;
    if (p.index == null) continue;
    seen.add(side);
    const x = center(Number(p.index));
    const y = MARKER_Y[side];
    const marker = svgEl(doc, 'g', { class: `prototype-marker is-${side}`, 'data-ptr': side });
    marker.appendChild(svgEl(doc, 'rect', { x: x - 8, y: y - 9, width: 16, height: 16, rx: 4 }));
    marker.appendChild(svgEl(doc, 'text', { x, y: y + 2 }, MARKER_LABEL[side]));
    chart.appendChild(marker);
    pointers.set(side, marker);
  }

  return { cells: [chart], pointers };
}

/** 宿主 frameBuilder 签名适配：buildPrototypeArrayFrame(step, {previous, enter, reduced}) */
export function asFrameBuilder(input, opts = {}) {
  return buildArrayFrame(input, opts);
}
