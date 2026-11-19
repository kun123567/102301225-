/** 渲染器共用小工具：角色 → 样式、尺寸适配、折线箭头。 */

import { ARRAY, LINK, UI } from '../theme.js';
import { norm } from '../model.js';

export const STATE_STYLE = {
  idle: { fill: '#ffffff', stroke: UI.border, text: UI.text, opacity: 1 },
  f1: { fill: '#fdeaea', stroke: ARRAY.ArrOneFocus1, text: '#8f2020', opacity: 1 },
  f2: { fill: '#fdeff8', stroke: ARRAY.ArrOneFocus2, text: '#8b1570', opacity: 1 },
  swap: { fill: '#fdf1e0', stroke: '#8a4b00', text: '#6b3a00', opacity: 1 },
  done: { fill: '#e9f8ef', stroke: '#0a6b4a', text: '#0a4c36', opacity: 1 },
  added: { fill: '#e7f1fd', stroke: '#0b5cad', text: '#0b3f75', opacity: 1 },
  excluded: { fill: '#f7f8fc', stroke: ARRAY.ArrOneMuted, text: '#8a93a5', opacity: 0.42 },
  muted: { fill: '#f7f8fc', stroke: ARRAY.ArrOneMuted, text: '#8a93a5', opacity: 0.6 },
};

/** 单元格状态：f1 > f2 > swap > done > added > excluded */
export function stateOf(roles, key) {
  if (roles.f1.has(key)) return 'f1';
  if (roles.f2.has(key)) return 'f2';
  if (roles.swap.has(key)) return 'swap';
  if (roles.done.has(key)) return 'done';
  if (roles.added.has(key)) return 'added';
  if (roles.excl.has(key)) return 'excluded';
  return 'idle';
}

export function styleOf(state) {
  return STATE_STYLE[state] || STATE_STYLE.idle;
}

export { norm };

/** 边框按状态加重 */
export function borderWidth(state) {
  return state === 'idle' || state === 'excluded' ? 1 : 2;
}

/** 把 n 个格子铺进 rect，返回每个格子的几何 */
export function fitRow(rect, n, opt = {}) {
  const gap0 = opt.gap ?? Math.max(4, Math.min(14, 260 / Math.max(n, 1)));
  const pad = opt.pad ?? 16;
  const inner = Math.max(40, rect.w - pad * 2);
  // 先把 gap 算出来；元素很多时 gap 也要跟着缩，否则整体会溢出面板右侧（被裁掉看不见）
  let gap = gap0;
  let cellW = (inner - gap * Math.max(0, n - 1)) / Math.max(n, 1);
  if (cellW < (opt.minW ?? 34)) {
    const squeezed = Math.max(2, Math.min(8, 220 / Math.max(n, 1)));
    if (squeezed < gap) gap = squeezed;
    cellW = (inner - gap * Math.max(0, n - 1)) / Math.max(n, 1);
  }
  // 兜底：无论 n 多大都必须落在面板内（最小 10px），必要时继续压 gap
  if (cellW < 10) {
    gap = 1;
    cellW = Math.max(4, (inner - (n - 1)) / Math.max(n, 1));
  }
  cellW = Math.min(opt.maxW ?? 100, cellW);
  const totalW = cellW * n + gap * Math.max(0, n - 1);
  const x0 = rect.x + pad + Math.max(0, (inner - totalW) / 2);
  const cellH = opt.cellH ?? Math.max(46, Math.min(78, rect.h * (opt.heightRatio ?? 0.44)));
  const y0 = rect.y + pad + (opt.topOffset ?? 24);
  return { gap, cellW, cellH, x0, y0, totalW, inner };
}

export function cellRect(fit, i) {
  return { x: fit.x0 + i * (fit.cellW + fit.gap), y: fit.y0, w: fit.cellW, h: fit.cellH };
}

/** 直角折线（AnyviewC 的边是"先竖后横"的折线，不是直线+贝塞尔） */
export function elbow(x1, y1, x2, y2, axis = 'h') {
  if (axis === 'h') {
    const mx = (x1 + x2) / 2;
    return [[x1, y1], [mx, y1], [mx, y2], [x2, y2]];
  }
  const my = (y1 + y2) / 2;
  return [[x1, y1], [x1, my], [x2, my], [x2, y2]];
}

/** 指针 chip 的颜色（沿用 datastructure-agent-main 的 L/R/M 语汇：颜色只是辅助，必须带文字） */
export const POINTER_TONES = [
  { fill: '#e7f1fd', stroke: '#0b5cad', color: '#0b3f75' },
  { fill: '#fdf1e0', stroke: '#8a4b00', color: '#6b3a00' },
  { fill: '#e6f6ef', stroke: '#0a6b4a', color: '#0a4c36' },
  { fill: '#f3eafd', stroke: '#6b3fa0', color: '#4a2872' },
];

export function toneFor(i) {
  return POINTER_TONES[i % POINTER_TONES.length];
}

export function nodeBase(id, label, value, extra = {}) {
  return { id, label: label ?? String(value ?? ''), value, ...extra };
}

/**
 * 同一图层内 key 必须唯一：
 *   · 补间是按 key 匹配的，重名会让两个图元互相插值，位置乱跳；
 *   · paint2D 里后画的会盖住先画的，重名等于丢了一笔。
 * 图数据里出现平行边（同一个 from→to 两条）或同名指针是正常的，
 * 所以这里统一分配：第一次用原名，之后加 #2 / #3 后缀。
 */
export function uniqueKeyer() {
  const seen = new Map();
  return (base) => {
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  };
}

/** 角色值宽容化：数组原样、Set 展开、单值包成数组、空值给 []（渲染器不该因为角色写法不整齐就崩） */
export function listOf(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (value instanceof Set) return [...value];
  return [value];
}
