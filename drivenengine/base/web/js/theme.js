/**
 * theme.js -- 配色与外观参数（M3 先手，M5 扩展为完整面板）
 *
 * 键名严格沿用 anyview.ini（见 .bench/10_viz_principles/10_COLOR_INI.md）。
 * ini 里的 TColor 是 Delphi 的 0x00BBGGRR（BGR），这里统一转成 CSS。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  /** Delphi TColor(BGR 十进制) → #rrggbb */
  function bgr(n) {
    const v = (n >>> 0) & 0xFFFFFF;
    const r = v & 0xFF, g = (v >> 8) & 0xFF, b = (v >> 16) & 0xFF;
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  // 默认值直接取自 anyview.ini（BGR 区）
  const INI = {
    // [Main]
    MinTime: 50, MaxTime: 2000, SpeedIndex: 4, MaxMemory: 10000, MaxStrLen: 256,
    // [Memory]
    MemBkg: -2147483643, MemFrame: 16711680, MemNode: 16776960,
    MemEmpty: 16777215, MemInvalid: -2147483633, MemFocus: 255,
    MemLabelWidth: 70, MemNameWidth: 70, MemValueWidth: 70, MemAddrWidth: 35,
    // [Array]
    ArrBkg: -2147483643, ArrName: 16711935, ArrBracket: 16711680, ArrValue: 255,
    ArrOneCoor: 16711680, ArrOneFocus1: 255, ArrOneFocus2: 16711935,
    ArrOneGrid: 8421504, ArrOneLine: 16711935,
    ArrOneShape: 0, ArrOneShowGrid: 1, ArrOneShowLine: 0, ArrTwoShape: 1,
    // [Link]
    LinkBkg: -2147483643, LinkHead: 255, LinkHeadLine: 255, LinkHeadText: 16711680,
    LinkRefHead: 16711935, LinkRefHeadLine: 16711935,
    LinkNodeFrame: 16711680, LinkNode: 16776960, LinkNodeLine: 16711935,
    LinkDot: 8421504, LinkNodeText: 0, LinkRoundShape: 0, LinkLinkFirst: 0,
    // [Syntax]（三套行底色）
    SyntaxRunLineBkg: 8388608, SyntaxErrLineBkg: 128, SyntaxBreadPointBkg: 255,
  };

  const SYS = { '-2147483643': '#ffffff', '-2147483633': '#f0f0f0', '-2147483640': '#000000' };

  const state = Object.assign({}, INI);

  function css(key) {
    const v = state[key];
    if (v === undefined) return '#000000';
    if (typeof v === 'string') return v;
    const s = SYS[String(v)];
    return s || bgr(v);
  }

  function get(key) { return state[key]; }

  function set(key, value) {
    state[key] = value;
    apply();
  }

  /** 把当前配色写成 CSS 变量，供 app.css / SVG 使用 */
  function apply(root) {
    if (typeof document === 'undefined') return;
    const el = root || document.documentElement;
    const map = {
      '--mem-bkg': css('MemBkg'), '--mem-frame': css('MemFrame'),
      '--mem-node': css('MemNode'), '--mem-empty': css('MemEmpty'),
      '--mem-invalid': css('MemInvalid'), '--mem-focus': css('MemFocus'),
      '--arr-name': css('ArrName'), '--arr-bracket': css('ArrBracket'),
      '--arr-value': css('ArrValue'), '--arr-coor': css('ArrOneCoor'),
      '--arr-focus1': css('ArrOneFocus1'), '--arr-focus2': css('ArrOneFocus2'),
      '--arr-grid': css('ArrOneGrid'), '--arr-line': css('ArrOneLine'),
      '--link-node': css('LinkNode'), '--link-frame': css('LinkNodeFrame'),
      '--link-line': css('LinkNodeLine'), '--link-dot': css('LinkDot'),
      '--link-head': css('LinkHead'), '--link-headtext': css('LinkHeadText'),
      '--link-text': css('LinkNodeText'),
      '--runline-bkg': css('SyntaxRunLineBkg'),
      '--errline-bkg': css('SyntaxErrLineBkg'),
      '--bpline-bkg': css('SyntaxBreadPointBkg'),
    };
    for (const k in map) el.style.setProperty(k, map[k]);
  }

  /** 一维数组外观三开关（对齐 ArrOneShape/ShowGrid/ShowLine 三个独立键） */
  const arr1 = {
    shape: () => Number(state.ArrOneShape) || 0,       // 0=矩形框 1=点
    showGrid: () => Number(state.ArrOneShowGrid) ? true : false,
    showLine: () => Number(state.ArrOneShowLine) ? true : false,
    setShape: (v) => { state.ArrOneShape = v ? 1 : 0; },
    toggleGrid: () => { state.ArrOneShowGrid = Number(state.ArrOneShowGrid) ? 0 : 1; },
    toggleLine: () => { state.ArrOneShowLine = Number(state.ArrOneShowLine) ? 0 : 1; },
  };

  /** 速度三档 → 帧间隔毫秒（对齐 MinTime/MaxTime/SpeedIndex） */
  function stepInterval() {
    const idx = Math.max(1, Math.min(5, Number(state.SpeedIndex) || 4));
    const t = Number(state.MinTime) + (5 - idx) * (Number(state.MaxTime) - Number(state.MinTime)) / 4;
    return Math.round(t);
  }

  AVC.theme = { INI, state, bgr, css, get, set, apply, arr1, stepInterval };
})(typeof window !== 'undefined' ? window : globalThis);
