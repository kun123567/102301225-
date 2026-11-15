/**
 * anyview.ini 复原（10_COLOR_INI.md）
 *
 * AnyviewC 把全部配色/开关键写死在一个 82 行 ini 里，段名直接对应渲染器族。
 * 这里一一对应成 JS 常量：改主题 = 改这一张表，渲染器不写死颜色。
 * 样式（形状/圆角/字号/间距）取 datastructure-agent-main 的浅色设计语言。
 */

/** [Memory] 段 —— 单元格配色（08_MEMORY_CELL.md §2） */
export const MEMORY = {
  MemBkg: '#f7f8fc',
  MemFrame: '#3b6fbf',
  MemNode: '#fff5cc',
  MemEmpty: '#ffffff',
  MemInvalid: '#e9ecf3',
  MemFocus: '#d94b4b',
  MemLabelWidth: 70,
  MemNameWidth: 70,
  MemValueWidth: 70,
  MemAddrWidth: 35,
};

/** [Array] 段 —— 数组两族（02_ARRAY_1D.md / 03_ARRAY_2D.md） */
export const ARRAY = {
  ArrBkg: '#ffffff',
  ArrName: '#b0197f',
  ArrBracket: '#3b6fbf',
  ArrValue: '#d94b4b',
  ArrOneBkg: '#ffffff',
  ArrOneCoor: '#3b6fbf',
  ArrOneFocus1: '#d94b4b',
  ArrOneFocus2: '#b0197f',
  ArrOneGrid: '#e3e7f0',
  ArrOneLine: '#b0197f',
  // 三个独立开关：Shape{0 矩形框,1 点} × ShowGrid × ShowLine = 8 种真实形态
  ArrOneShape: 0,
  ArrOneShowGrid: true,
  ArrOneShowLine: false,
  // 本项目追加的两个语义色（沿用 datastructure-agent-main 的"已完成/已排除"语汇）
  ArrOneDone: '#0a6b4a',
  ArrOneMuted: '#c7d0de',
  ArrTwoShape: 1,
  ArrTwoBkg: '#ffffff',
};

/** [Link] 段 —— 链表面板（04_LINK_2D.md §3） */
export const LINK = {
  LinkBkg: '#ffffff',
  LinkHead: '#d94b4b',
  LinkHeadLine: '#d94b4b',
  LinkRefHead: '#b0197f',
  LinkRefHeadLine: '#b0197f',
  LinkHeadText: '#3b6fbf',
  LinkNodeFrame: '#3b6fbf',
  LinkNode: '#eef4ff',
  LinkNodeLine: '#7c8aa5',
  LinkDot: '#8a93a5',
  LinkNodeText: '#172033',
  LinkNodeFocus: '#fdf1e0',
  LinkNodeFocusEdge: '#8a4b00',
  LinkNodeDone: '#e9f8ef',
  LinkNodeDoneEdge: '#0a6b4a',
  LinkEquateTree: false,
  LinkLinkFirst: false,
  LinkRoundShape: false,
};

/** 通用界面色（datastructure-agent-main 设计语言） */
export const UI = {
  accent: '#6650cf',
  accentSoft: '#efebfd',
  text: '#172033',
  textMuted: '#5a6678',
  border: '#dce2ec',
  surface: '#ffffff',
  surfaceAlt: '#f7f9fc',
  font: 'system-ui, "Microsoft YaHei", sans-serif',
  mono: 'Consolas, "Cascadia Mono", monospace',
  /** 角色色：焦点永远同时带文字标签，不只用颜色区分（可访问性） */
  codeRunLine: '#efebfd',
  codeRunLineText: '#533cb7',
  codeErrLine: '#ffe6e6',
};

/** [Main] 段 —— 动画节奏（10_COLOR_INI.md §[Main]） */
export const MAIN = {
  MinTime: 50,
  MaxTime: 2000,
  SpeedIndex: 4,
  MaxMemory: 10000,
  MaxStrLen: 256,
};

/**
 * 速度档 1..5 → 单步时长（ms）。
 * AnyviewC 用 MinTime/MaxTime/SpeedIndex 三档并存来应对"每帧重建式重绘"，
 * 这里保持同一语义：元素越多，单步最长不超过 MaxTime。
 */
export function stepDuration(speedIndex = MAIN.SpeedIndex, elementCount = 0) {
  const s = Math.min(5, Math.max(1, speedIndex));
  const t = (s - 1) / 4; // 0..1
  const base = MAIN.MaxTime * (1 - t) + MAIN.MinTime * t;
  // 规模补偿：元素多时按 √n 拉长，但截到 MaxTime
  const scale = elementCount > 24 ? Math.min(2.2, Math.sqrt(elementCount / 24)) : 1;
  return Math.min(MAIN.MaxTime, Math.round(base * scale));
}

export const THEME = { MEMORY, ARRAY, LINK, UI, MAIN };

/** 阶段/事件 → 语义色（说明条与时间轴用） */
export const EVENT_TONE = {
  done: 'found',
  ok: 'found',
  hit: 'found',
  found: 'found',
  mismatch: 'error',
  error: 'error',
  invalid: 'error',
  cycle: 'error',
  exhausted: 'error',
  miss: 'muted',
  reject: 'muted',
  duplicate: 'muted',
  unreachable: 'muted',
  disconnected: 'muted',
};

export function toneOf(event) {
  return EVENT_TONE[event] || 'info';
}
