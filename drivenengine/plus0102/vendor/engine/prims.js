/**
 * 后端层（00_PRINCIPLE_OVERVIEW.md §1 ④）：把「渲染器现算出的图元」画成像素。
 *
 * 本项目只做 **2D**（用户明确要求不做 3D），因此：
 *  · 后端只剩两种：`canvas`（TCanvas/GDI 复原）与 `treeview`（TTreeView 复原）；
 *  · 全部图元是 MoveTo/LineTo/FillRect 级原语，箭头是「两段 3×5 像素短线」（02_ARRAY_1D.md §2.1），
 *    这正是 AnyviewC 画布分支的真实画法，不是退化妥协；
 *  · 渲染器只产出图元，不做 DOM/SVG 场景图——"没有中间场景描述"这条原则保持不变；
 *  · 每步整幅重绘（不是增量），与 AnyviewC 的「重建式刷新」一致。
 */

import { UI } from './theme.js';

/* ------------------------------------------------------------------ 图元构造 */

/**
 * 填充/描边颜色归一化。
 *
 * 渲染器里用 `fill: 'none'` / `stroke: 'none'` 表示"不画这一层"，但 canvas 的规则是：
 *   · `ctx.fillStyle = 'none'` 是**非法值，赋值被静默忽略**，fillStyle 保留上一次的颜色；
 *   · 而 `if (p.fill)` 又把字符串 'none' 当成真值，于是照样 `ctx.fill()`。
 * 两者合起来就是：本该"只有虚线描边"的框，被上一笔的深色（例如文字色 #172033）整块填黑
 * —— 这就是「重叠变黑」的真实成因。这里统一把不可用作颜色的值归成 null，由绘制层跳过。
 */
export function paintOf(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v === 'none' || v === 'transparent') return null;
  return v;
}

/**
 * 虚线归一化。
 * 历史写法里出现过 `dash: true`、`dash: 6` 这种非数组值，而
 * `ctx.setLineDash()` 只接受「数字序列」，传 true 会直接抛
 *   TypeError: Failed to execute 'setLineDash' … cannot be converted to a sequence
 * 一抛整个渲染流程就中断，画面停在上一帧（看起来就是"渲染失败"）。
 * 所有入口统一走这里，坏值一律降级成合法数组或 null，不抛错。
 */
export function dashOf(dash) {
  if (!dash) return null;
  if (Array.isArray(dash)) {
    const nums = dash.filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
    return nums.length ? nums : null;
  }
  if (dash === true) return [5, 4];
  if (typeof dash === 'number' && Number.isFinite(dash) && dash >= 0) return [dash, dash];
  return null;
}

export const P = {
  rect(key, x, y, w, h, opt = {}) {
    return { kind: 'rect', key, x, y, w, h, r: opt.r ?? 8, fill: paintOf(opt.fill), stroke: paintOf(opt.stroke), sw: opt.sw ?? 1, dash: dashOf(opt.dash), opacity: opt.opacity ?? 1, z: opt.z ?? 0, meta: opt.meta };
  },
  text(key, x, y, text, opt = {}) {
    return { kind: 'text', key, x, y, text: String(text), fill: paintOf(opt.fill) || UI.text, font: opt.font || `600 ${opt.size || 13}px ${UI.font}`, align: opt.align || 'center', baseline: opt.baseline || 'middle', opacity: opt.opacity ?? 1, z: opt.z ?? 2, meta: opt.meta };
  },
  line(key, x1, y1, x2, y2, opt = {}) {
    return { kind: 'line', key, x1, y1, x2, y2, stroke: paintOf(opt.stroke) || UI.textMuted, sw: opt.sw ?? 1.5, dash: dashOf(opt.dash), arrow: opt.arrow || null, opacity: opt.opacity ?? 1, z: opt.z ?? 1, meta: opt.meta };
  },
  poly(key, pts, opt = {}) {
    return { kind: 'poly', key, pts, closed: !!opt.closed, fill: paintOf(opt.fill), stroke: paintOf(opt.stroke) || UI.textMuted, sw: opt.sw ?? 1.5, dash: dashOf(opt.dash), arrow: opt.arrow || null, opacity: opt.opacity ?? 1, z: opt.z ?? 1, meta: opt.meta };
  },
  chip(key, x, y, text, opt = {}) {
    return { kind: 'chip', key, x, y, text, fill: paintOf(opt.fill) || '#e7f1fd', stroke: paintOf(opt.stroke) || '#0b5cad', color: paintOf(opt.color) || '#0b5cad', size: opt.size || 11, opacity: opt.opacity ?? 1, z: opt.z ?? 3, meta: opt.meta };
  },
  circle(key, cx, cy, r, opt = {}) {
    return { kind: 'circle', key, cx, cy, r, fill: paintOf(opt.fill), stroke: paintOf(opt.stroke), sw: opt.sw ?? 1.5, opacity: opt.opacity ?? 1, z: opt.z ?? 1, meta: opt.meta };
  },
  /** 圆头条 / 圆柱的 2D 表达（二维数组 DrawMode=0） */
  pill(key, x, y, w, h, opt = {}) {
    return { kind: 'rect', key, x, y, w, h, r: Math.min(w, h) / 2, fill: paintOf(opt.fill), stroke: paintOf(opt.stroke), sw: opt.sw ?? 1, dash: dashOf(opt.dash), opacity: opt.opacity ?? 1, z: opt.z ?? 0, meta: opt.meta };
  },
};

/* ------------------------------------------------------------------ 2D 画笔 */

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 复原「两段 3×5 像素短线」箭头（02_ARRAY_1D.md §2.1） */
export function drawArrowHead(ctx, x1, y1, x2, y2, color, size = 5) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(a - 0.45), y2 - size * Math.sin(a - 0.45));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(a + 0.45), y2 - size * Math.sin(a + 0.45));
  ctx.stroke();
}

export function paint2D(ctx, prims) {
  const list = prims.filter((p) => p).sort((a, b) => (a.z || 0) - (b.z || 0));
  for (const p of list) {
    ctx.save();
    ctx.globalAlpha = p.opacity ?? 1;
    // 再兜一层：图元可能不是经 P.* 造的
    //   dash 坏值 → 降级成合法数组，绝不抛错中断整帧
    //   fill/stroke 为 'none' / 非法 → 归成 null，绝不用"上一笔残留的深色"去填
    const dash = dashOf(p.dash);
    const fill = paintOf(p.fill);
    const stroke = paintOf(p.stroke);
    if (p.kind === 'rect') {
      roundRectPath(ctx, p.x, p.y, p.w, p.h, p.r);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = p.sw ?? 1;
        if (dash) ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (p.kind === 'text') {
      ctx.fillStyle = fill || UI.text;
      ctx.font = p.font;
      ctx.textAlign = p.align;
      ctx.textBaseline = p.baseline;
      ctx.fillText(p.text, p.x, p.y);
    } else if (p.kind === 'line') {
      ctx.strokeStyle = stroke || UI.textMuted;
      ctx.lineWidth = p.sw ?? 1.5;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y1);
      ctx.lineTo(p.x2, p.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (p.arrow) drawArrowHead(ctx, p.x1, p.y1, p.x2, p.y2, stroke || UI.textMuted);
    } else if (p.kind === 'poly') {
      ctx.beginPath();
      p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (p.closed) ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = stroke || UI.textMuted;
      ctx.lineWidth = p.sw ?? 1.5;
      if (dash) ctx.setLineDash(dash);
      ctx.stroke();
      ctx.setLineDash([]);
      if (p.arrow === 'end' && p.pts.length > 1) {
        const n = p.pts.length;
        drawArrowHead(ctx, p.pts[n - 2][0], p.pts[n - 2][1], p.pts[n - 1][0], p.pts[n - 1][1], stroke || UI.textMuted);
      }
    } else if (p.kind === 'circle') {
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = p.sw ?? 1.5;
        ctx.stroke();
      }
    } else if (p.kind === 'chip') {
      ctx.font = `600 ${p.size}px ${UI.font}`;
      const w = ctx.measureText(p.text).width + 14;
      const h = p.size + 10;
      roundRectPath(ctx, p.x - w / 2, p.y - h / 2, w, h, h / 2);
      ctx.fillStyle = fill || '#e7f1fd';
      ctx.fill();
      ctx.strokeStyle = stroke || '#0b5cad';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = paintOf(p.color) || '#0b5cad';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text, p.x, p.y + 0.5);
    }
    ctx.restore();
  }
  return list;
}

/** 清屏（复原"整幅重绘"而不是增量） */
export function clearAll(ctx, rect, bg) {
  ctx.save();
  ctx.fillStyle = bg || '#ffffff';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/** 把图元里带 key 的几何抽出来，供播放器做「同 key 位移补间」（FLIP 的画布版） */
export function collectNodes(prims) {
  const map = new Map();
  for (const p of prims) {
    if (!p.key) continue;
    if (p.kind === 'rect') map.set(p.key, { x: p.x + p.w / 2, y: p.y + p.h / 2 });
    else if (p.kind === 'circle') map.set(p.key, { x: p.cx, y: p.cy });
    else if (p.kind === 'chip') map.set(p.key, { x: p.x, y: p.y });
    else if (p.kind === 'text') map.set(p.key, { x: p.x, y: p.y });
  }
  return map;
}
