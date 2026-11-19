/**
 * 严格版假 canvas context —— 模拟真实浏览器会**抛异常**的那些情况。
 *
 * 为什么需要它：之前的假 ctx 对任何参数都默默接受，于是 `setLineDash(true)`、
 * 负半径 `arc()` 这类会让真实浏览器抛错并中断整帧的问题，测试里全都"通过"。
 * 真实浏览器（Chrome/Edge/Firefox 一致）会抛：
 *   · setLineDash(非数字序列)         → TypeError: cannot be converted to a sequence
 *   · arc()/arcTo()/ellipse() 负半径  → IndexSizeError
 *   · createRadialGradient 负半径     → IndexSizeError
 * 这里逐条复刻，并额外把「非有限数值」「负宽高」记成错误。
 */

export const PATH_METHODS = ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'fill', 'stroke',
  'fillRect', 'strokeRect', 'setTransform', 'translate', 'scale', 'clearRect', 'quadraticCurveTo', 'bezierCurveTo'];

const KNOWN_FILL = /^(#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(|hsla?\(|[a-z]+$)/i;

export function strictCtx(label = 'ctx') {
  const errors = [];
  const calls = [];
  const fail = (method, msg) => {
    const e = new Error(`[${label}] ${method}: ${msg}`);
    errors.push(e.message);
    throw e;
  };
  const checkNum = (method, name, v, { min = -Infinity } = {}) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(method, `${name} 不是有限数值：${v}`);
    if (v < min) fail(method, `${name} 小于 ${min}：${v}`);
  };

  const ctx = {
    calls,
    errors,
    canvas: { width: 1200, height: 600 },
    _fillStyle: '#000',
    _strokeStyle: '#000',
    _dash: [],
    get fillStyle() {
      return ctx._fillStyle;
    },
    set fillStyle(v) {
      calls.push(['fillStyle', v]);
      if (typeof v !== 'string' || !KNOWN_FILL.test(v.trim())) {
        errors.push(`[${label}] fillStyle 非法值（浏览器会静默保留上一次颜色，导致整块被填黑）：${JSON.stringify(v)}`);
        return; // 浏览器行为：忽略非法值
      }
      ctx._fillStyle = v;
    },
    get strokeStyle() {
      return ctx._strokeStyle;
    },
    set strokeStyle(v) {
      calls.push(['strokeStyle', v]);
      if (typeof v !== 'string' || !KNOWN_FILL.test(v.trim())) {
        errors.push(`[${label}] strokeStyle 非法值：${JSON.stringify(v)}`);
        return;
      }
      ctx._strokeStyle = v;
    },
    set lineWidth(v) {
      calls.push(['lineWidth', v]);
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errors.push(`[${label}] lineWidth 非法：${v}`);
    },
    set globalAlpha(v) {
      calls.push(['globalAlpha', v]);
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
        errors.push(`[${label}] globalAlpha 非法（浏览器会忽略，帧会保持上一帧透明度）：${v}`);
      }
    },
    set font(v) {
      calls.push(['font', v]);
      if (typeof v !== 'string' || !/\d+\s*px/.test(v)) errors.push(`[${label}] font 非法：${JSON.stringify(v)}`);
    },
    set textAlign(v) {
      calls.push(['textAlign', v]);
    },
    set textBaseline(v) {
      calls.push(['textBaseline', v]);
    },
    setLineDash(segments) {
      calls.push(['setLineDash', segments]);
      if (!Array.isArray(segments)) {
        // 正是用户在真实浏览器里看到的那个报错
        fail('setLineDash', `The provided value cannot be converted to a sequence（收到 ${typeof segments}: ${JSON.stringify(segments)}）`);
      }
      for (const n of segments) checkNum('setLineDash', '段长', n, { min: 0 });
    },
    getLineDash() {
      return [];
    },
    measureText(t) {
      calls.push(['measureText', t]);
      return { width: String(t ?? '').length * 6.2 };
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      checkNum('createRadialGradient', 'r0', r0, { min: 0 });
      checkNum('createRadialGradient', 'r1', r1, { min: 0 });
      return { addColorStop() {} };
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
  };

  for (const m of PATH_METHODS) {
    ctx[m] = (...args) => {
      calls.push([m, args]);
      args.forEach((a, i) => {
        if (typeof a === 'number' && !Number.isFinite(a)) fail(m, `第 ${i} 个参数不是有限数值：${a}`);
      });
    };
  }

  // 这些方法在浏览器里对"负半径"是硬抛错的
  ctx.arc = (cx, cy, r, a0, a1) => {
    calls.push(['arc', [cx, cy, r]]);
    checkNum('arc', 'r', r, { min: 0 });
  };
  ctx.arcTo = (x1, y1, x2, y2, r) => {
    calls.push(['arcTo', [x1, y1, x2, y2, r]]);
    checkNum('arcTo', 'r', r, { min: 0 });
  };
  ctx.ellipse = (cx, cy, rx, ry) => {
    calls.push(['ellipse', [cx, cy, rx, ry]]);
    checkNum('ellipse', 'rx', rx, { min: 0 });
    checkNum('ellipse', 'ry', ry, { min: 0 });
  };
  ctx.fillText = (text, x, y) => {
    calls.push(['fillText', [text, x, y]]);
    checkNum('fillText', 'x', x);
    checkNum('fillText', 'y', y);
    if (typeof text !== 'string') errors.push(`[${label}] fillText 收到非字符串：${JSON.stringify(text)}（浏览器会画成 "undefined"）`);
  };
  ctx.fillRect = (x, y, w, h) => {
    calls.push(['fillRect', [x, y, w, h]]);
    checkNum('fillRect', 'x', x);
    checkNum('fillRect', 'y', y);
    checkNum('fillRect', 'w', w);
    checkNum('fillRect', 'h', h);
  };
  return ctx;
}

/** 图元字段级检查（在交给 ctx 之前就能发现的问题） */
export const PRIM_NUM_FIELDS = ['x', 'y', 'w', 'h', 'r', 'cx', 'cy', 'x1', 'y1', 'x2', 'y2', 'sw', 'size', 'opacity'];
export const PRIM_KINDS = new Set(['rect', 'text', 'line', 'poly', 'circle', 'chip']);

export function checkPrim(p, where) {
  const problems = [];
  if (!p || typeof p !== 'object') return [`${where}: 图元不是对象`];
  if (!PRIM_KINDS.has(p.kind)) problems.push(`${where}: 未知 kind=${p.kind}`);
  for (const f of PRIM_NUM_FIELDS) {
    if (p[f] !== undefined && (typeof p[f] !== 'number' || !Number.isFinite(p[f]))) {
      problems.push(`${where}: ${f} 不是有限数值（${p[f]}）`);
    }
  }
  if (p.r !== undefined && p.r < 0) problems.push(`${where}: 半径 r 为负（${p.r}）浏览器会抛 IndexSizeError`);
  if (p.w !== undefined && p.w < 0) problems.push(`${where}: 宽 w 为负（${p.w}）`);
  if (p.h !== undefined && p.h < 0) problems.push(`${where}: 高 h 为负（${p.h}）`);
  if (p.opacity !== undefined && (p.opacity < 0 || p.opacity > 1)) problems.push(`${where}: opacity 超出 [0,1]（${p.opacity}）`);
  if (p.dash !== undefined && p.dash !== null) {
    if (!Array.isArray(p.dash)) problems.push(`${where}: dash 不是数组（${JSON.stringify(p.dash)}）→ setLineDash 会抛错`);
    else if (p.dash.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) problems.push(`${where}: dash 含非法段长 ${JSON.stringify(p.dash)}`);
  }
  if (p.fill !== undefined && p.fill !== null && typeof p.fill !== 'string') problems.push(`${where}: fill 不是字符串`);
  if (p.stroke !== undefined && p.stroke !== null && typeof p.stroke !== 'string') problems.push(`${where}: stroke 不是字符串`);
  if (p.kind === 'poly') {
    if (!Array.isArray(p.pts)) problems.push(`${where}: poly 缺 pts 数组`);
    else for (const [x, y] of p.pts) if (!Number.isFinite(x) || !Number.isFinite(y)) problems.push(`${where}: poly 顶点非法（${x},${y}）`);
  }
  if (p.kind === 'text' && typeof p.text !== 'string') problems.push(`${where}: text 不是字符串`);
  return problems;
}
