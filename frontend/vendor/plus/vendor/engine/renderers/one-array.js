/**
 * style 1 / 5 —— 一维数组渲染器（TOneArrayForm 复原）
 *
 * 02_ARRAY_1D.md 的真实形态空间 = Shape{0 矩形框, 1 点} × ShowGrid × ShowLine = 8 种，
 * 三个开关互相独立（不是枚举成员）。这里逐一复原：
 *   · 坐标系：X/Y 轴 + 箭头（两段 3×5 像素短线）+ 刻度与刻度值（下标）；
 *   · Shape=0：一格一个矩形框，值写在框内；Shape=1：在轴上画点，值标在点旁；
 *   · ShowGrid：竖直网格线；ShowLine：把各元素值连成折线（排序/查找的"走势"）；
 *   · 双焦点：ArrOneFocus1（当前项）/ ArrOneFocus2（比较项）两色共存，
 *     对应排序演示里"当前元素"与"被比较元素"分开高亮。
 */

import { ARRAY, UI } from '../theme.js';
import { P } from '../prims.js';
import { norm, stateOf, styleOf, fitRow, cellRect, borderWidth, toneFor } from './_shared.js';

/* 值文本自适应：格子窄、数字长的时候，早期是"字号按格宽算"然后让文本溢出格子在隔壁字上叠着，
   屏幕上一片糊。这里按"可用宽度 / 字符数"反推字号，最小 9px；还放不下就截断加省略号。 */
function fitLabel(label, cellW, maxSize = 20, minSize = 9) {
  const text = String(label ?? '');
  const usable = Math.max(8, cellW - 6);
  let size = Math.min(maxSize, Math.max(minSize, usable / 2.6));
  const charW = 0.62;
  if (!text.length) return { text, size };
  while (size > minSize && text.length * size * charW > usable) size -= 1;
  const maxChars = Math.max(1, Math.floor(usable / (size * charW)));
  const shown = text.length > maxChars ? text.slice(0, Math.max(1, maxChars - 1)) + '…' : text;
  return { text: shown, size };
}

export const STYLES = [1, 5];

export function layout(layer, rect, env = {}) {
  const { data, props } = layer;
  const roles = norm(layer.roles);
  const values = data.values || [];
  const n = values.length;
  const prims = [];
  const nodes = new Map();
  const shape = props.shape ?? 0;
  const showGrid = !!props.showGrid;
  const showLine = !!props.showLine;
  const showValues = props.showValues !== false;
  const base = data.indexBase ?? 0;

  if (data.name) {
    prims.push(P.text('name', rect.x + 16, rect.y + 16, data.name, { align: 'left', fill: ARRAY.ArrName, size: 12 }));
  }
  if (n === 0) {
    // 注意：dash 必须是数字数组（曾经写成 dash: true，浏览器 setLineDash 会抛
    // TypeError: cannot be converted to a sequence，整帧中断 → 表现为"渲染失败"）
    prims.push(P.rect('empty', rect.x + rect.w / 2 - 90, rect.y + rect.h / 2 - 26, 180, 52, { r: 10, fill: '#fbfcfe', stroke: UI.border, dash: [6, 4] }));
    prims.push(P.text('empty-t', rect.x + rect.w / 2, rect.y + rect.h / 2, '空表 / 空数组', { fill: UI.textMuted, size: 12 }));
    return { prims, nodes };
  }

  const fit = fitRow(rect, n, { cellH: (props.cellH ?? 0) || undefined, maxW: props.maxCellW ?? 100 });
  const axisY = fit.y0 + fit.cellH + 34;
  const maxV = Math.max(1, ...values.map((v) => Math.abs(Number(v) || 0)));

  // ---- X 轴 + 箭头（复原 02_ARRAY_1D.md §2.1 的固定绘制顺序）
  const x0 = fit.x0 - 12;
  const x1 = fit.x0 + fit.totalW + 12;
  prims.push(P.line('axis-x', x0, axisY, x1, axisY, { stroke: ARRAY.ArrOneCoor, sw: 1.4, arrow: 'end' }));
  prims.push(P.text('axis-x-label', x1 - 2, axisY - 14, 'X', { fill: ARRAY.ArrOneCoor, size: 11 }));

  // ---- Y 轴 + 箭头
  const yTop = fit.y0 - 18;
  prims.push(P.line('axis-y', x0, axisY, x0, yTop, { stroke: ARRAY.ArrOneCoor, sw: 1.4, arrow: 'end' }));
  prims.push(P.text('axis-y-label', x0 + 12, yTop + 2, 'Y', { fill: ARRAY.ArrOneCoor, size: 11 }));

  // ---- 竖直网格
  if (showGrid) {
    for (let i = 0; i < n; i++) {
      const c = cellRect(fit, i);
      prims.push(P.line(`grid-${i}`, c.x + c.w / 2, yTop + 10, c.x + c.w / 2, axisY, { stroke: ARRAY.ArrOneGrid, sw: 1 }));
    }
  }

  // ---- 元素本体
  const linePts = [];
  for (let i = 0; i < n; i++) {
    const key = base + i;
    const c = cellRect(fit, i);
    const st = stateOf(roles, key);
    const s = styleOf(st);
    const v = values[i];
    const label = data.labels ? data.labels[i] : String(v);
    const hRatio = Math.abs(Number(v) || 0) / maxV;
    nodes.set(`cell:${key}`, { x: c.x + c.w / 2, y: c.y + c.h / 2 });

    if (shape === 1) {
      // Shape=1：点
      const py = fit.y0 + fit.cellH - fit.cellH * hRatio * 0.92;
      prims.push(P.circle(`pt-${i}`, c.x + c.w / 2, py, 7, { fill: s.stroke, stroke: '#ffffff', sw: 2, opacity: s.opacity }));
      if (showValues) { const fitTxt = fitLabel(label, c.w * 1.4); prims.push(P.text(`ptv-${i}`, c.x + c.w / 2, py - 18, fitTxt.text, { fill: s.text, size: Math.min(12, fitTxt.size), opacity: s.opacity })); }
      linePts.push([c.x + c.w / 2, py]);
    } else {
      prims.push(P.rect(`cell-${i}`, c.x, c.y, c.w, c.h, { r: 10, fill: s.fill, stroke: s.stroke, sw: borderWidth(st), opacity: s.opacity }));
      // 值条：把数值大小可视化（不替代数字，数字永远在框内）
      prims.push(P.rect(`bar-${i}`, c.x + 6, c.y + c.h - 6 - Math.max(2, (c.h - 26) * hRatio), c.w - 12, Math.max(2, (c.h - 26) * hRatio), { r: 4, fill: s.stroke, opacity: 0.14 * s.opacity, z: -1 }));
      if (showValues) { const fitTxt = fitLabel(label, c.w); prims.push(P.text(`val-${i}`, c.x + c.w / 2, c.y + c.h / 2 - 2, fitTxt.text, { fill: s.text, size: fitTxt.size, opacity: s.opacity })); }
      linePts.push([c.x + c.w / 2, c.y + c.h * (1 - hRatio * 0.85)]);
    }
    prims.push(P.text(`idx-${i}`, c.x + c.w / 2, axisY + 14, String(key), { fill: UI.textMuted, size: 11, opacity: s.opacity }));
  }

  // ---- 连线（ShowLine）：元素值的走势折线
  if (showLine && linePts.length > 1) {
    prims.push(P.poly('line-series', linePts, { stroke: ARRAY.ArrOneLine, sw: 1.6, dash: [4, 3], opacity: 0.85 }));
  }

  // ---- 指针（L/R/M 之类游标）：颜色只是辅助，文字一定在
  roles.pointers.forEach((p, i) => {
    if (p.index == null) return;
    const idx = p.index - base;
    if (idx < 0 || idx >= n) return;
    const c = cellRect(fit, idx);
    const tone = toneFor(i);
    const py = c.y - 14;
    prims.push(P.chip(`ptr-${p.id}`, c.x + c.w / 2, py, p.label, { ...tone }));
    prims.push(P.line(`ptr-line-${p.id}`, c.x + c.w / 2, py + 9, c.x + c.w / 2, c.y - 1, { stroke: tone.stroke, sw: 1, dash: [3, 2] }));
    nodes.set(`ptr:${p.id}`, { x: c.x + c.w / 2, y: py });
  });

  // ---- 区间标记（例如 [lo,hi] 或 [l,r]）
  const marks = roles.marks || {};
  if (marks.range && marks.range.length === 2) {
    const [a, b] = marks.range;
    const ca = cellRect(fit, Math.max(0, a - base));
    const cb = cellRect(fit, Math.min(n - 1, b - base));
    const x = ca.x - 3;
    const w = cb.x + cb.w - ca.x + 6;
    prims.push(P.rect('range', x, fit.y0 - 6, w, fit.cellH + 12, { r: 12, fill: 'none', stroke: '#3b6fbf', sw: 1.4, dash: [6, 4], opacity: 0.9 }));
    if (marks.rangeLabel) prims.push(P.text('range-label', x + w / 2, fit.y0 + fit.cellH + 34, marks.rangeLabel, { fill: '#3b6fbf', size: 11 }));
  }

  return { prims, nodes };
}
