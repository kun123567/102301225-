/**
 * host-profile.js -- 宿主契约档案（把"我的引擎"输出成"宿主认识的 DOM"）
 *
 * 目的：让 plus01&02 的引擎能按 **raw/datastructure-agent** 的 DOM 契约输出，从而
 * **它的 CSS 与动画一个字节都不用改**（这些类名全部来自它的 visualization.css）：
 *
 *   .bsviz > .bsviz-track > .bsviz-cell > .bsviz-value / .bsviz-idx
 *   .bsviz-ptrs > .bsviz-ptr-row > .bsviz-ptr.bsviz-ptr-left / -right / -mid
 *   状态类：is-in-range / is-excluded / is-range-start / is-range-end / is-mid / is-found
 *   动画：track[data-anim] = <事件名>；格子错峰入场 bsviz-enter-0..7；bsviz-anim-dim / restore / range
 *
 * 非数组族：宿主没有对应结构 → 走**新增原型**（前缀同为 bsviz-，由 app/bsviz-extra.css 定义），
 * 仍然复用同一套动画挂载点（data-anim + 元素类 + FLIP）。
 */

const BSVIZ_CLASSES = [
  'bsviz', 'bsviz-track', 'bsviz-cell', 'bsviz-value', 'bsviz-idx',
  'bsviz-ptrs', 'bsviz-ptr-row', 'bsviz-ptr', 'bsviz-ptr-left', 'bsviz-ptr-right', 'bsviz-ptr-mid',
  'is-in-range', 'is-excluded', 'is-range-start', 'is-range-end', 'is-mid', 'is-found',
  'bsviz-enter-0', 'bsviz-enter-1', 'bsviz-enter-2', 'bsviz-enter-3',
  'bsviz-enter-4', 'bsviz-enter-5', 'bsviz-enter-6', 'bsviz-enter-7',
  'bsviz-anim-dim', 'bsviz-anim-restore', 'bsviz-anim-range',
];

/** 事件名映射：我的 trace 事件 → 宿主的 data-anim 取值（宿主 CSS 只认这几个） */
const EVENT_MAP = {
  init: 'init',
  probe: 'probe', compare: 'probe', visit: 'probe', read: 'probe', check: 'probe',
  mid: 'probe', compute: 'probe',
  'move-left': 'move-left', left: 'move-left', lo: 'move-left',
  'move-right': 'move-right', right: 'move-right', hi: 'move-right',
  found: 'found', hit: 'found', match: 'found',
  'not-found': 'not-found', miss: 'not-found', fail: 'not-found',
};

/** 指针 → 宿主的三条行（left / right / mid）：按 id 与 label 关键词判断（数据驱动，不写死案例） */
const SIDE_RULES = [
  { side: 'left', re: /^(l|lo|left|low|begin|start)$/i },
  { side: 'right', re: /^(r|hi|right|high|end|last)$/i },
  { side: 'mid', re: /^(m|mid|middle|center|pivot|probe)$/i },
];

export const HOST_BSVIZ = Object.freeze({
  name: 'bsviz',
  classes: Object.freeze(BSVIZ_CLASSES),
  enterStagger: 8,
  mapEvent: (event) => EVENT_MAP[String(event || '').toLowerCase()] || String(event || 'none'),
  sideOf: (pointer) => {
    const id = String((pointer && (pointer.id || pointer.label)) || '');
    for (const r of SIDE_RULES) if (r.re.test(id)) return r.side;
    return null;
  },
  /** 非数组族的新增原型类名（由 app/bsviz-extra.css 提供样式） */
  generic: {
    root: 'bsviz-x',
    el: 'bsviz-x-el',
    chip: 'bsviz-x-chip',
    cell: 'bsviz-x-cell',
    node: 'bsviz-x-node',
    text: 'bsviz-x-text',
    line: 'bsviz-x-line',
    line: 'bsviz-x-line',
  },
});

/** 兼容旧引用：默认宿主档案 */
export const HOST_DEFAULT = { name: 'avc', classes: [], enterStagger: 0, mapEvent: (e) => String(e || 'none'), sideOf: () => null };
