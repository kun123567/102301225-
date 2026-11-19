/**
 * 播放与动画层（02「统一动画与播放」+ anyview.ini [Main] 复原）
 *
 * 复原要点：
 *  · AnyviewC 是"每次单步 → 重建全部可视化对象 → 整幅重绘"，
 *    所以这里的动画是 **同 key 图元的补间**（位置/尺寸/透明度），不是增量更新；
 *  · 单步时长由 SpeedIndex 1..5 在 MinTime(50ms)–MaxTime(2000ms) 之间插值，
 *    并按元素规模做补偿（theme.stepDuration）；
 *  · 代码行、画面、说明三者永远取自同一个 step —— 这是「根据代码运行进度出动画」的硬约束。
 */

import { dispatch, drawLayer } from './dispatch.js';
import { clearAll, paint2D } from './prims.js';
import { stepDuration } from './theme.js';

/** 补间：同 key 的图元在两步之间插值 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function interpPrim(a, b, t) {
  const out = { ...b };
  const fields = ['x', 'y', 'w', 'h'];
  for (const f of fields) {
    if (typeof a[f] === 'number' && typeof b[f] === 'number') out[f] = lerp(a[f], b[f], t);
  }
  for (const f of ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r']) {
    if (typeof a[f] === 'number' && typeof b[f] === 'number') out[f] = lerp(a[f], b[f], t);
  }
  if (Array.isArray(a.pts) && Array.isArray(b.pts) && a.pts.length === b.pts.length) {
    out.pts = b.pts.map((p, i) => [lerp(a.pts[i][0], p[0], t), lerp(a.pts[i][1], p[1], t)]);
  }
  const ao = a.opacity ?? 1;
  const bo = b.opacity ?? 1;
  out.opacity = lerp(ao, bo, t);
  // 文字内容不会补间：切换瞬间显示新文字，但透明度跟着补间，避免"字卡住"
  return out;
}

/**
 * 把「上一步图层」和「本步图层」混合绘制（t=0 完全是上一步，t=1 完全是本步）。
 */
export function drawTween(ctx, rect, fromLayer, toLayer, t, env = {}) {
  clearAll(ctx, rect, env.bg || '#ffffff');
  if (!toLayer) return { nodes: new Map() };
  const toRes = dispatch(toLayer.style).instance.layout(toLayer, rect, env);
  if (!fromLayer || t >= 1) {
    paint2D(ctx, toRes.prims);
    return toRes;
  }
  const fromRes = dispatch(fromLayer.style).instance.layout(fromLayer, rect, env);
  const fromMap = new Map(fromRes.prims.map((p) => [p.key, p]));
  const toKeys = new Set(toRes.prims.map((p) => p.key));
  const merged = [];
  for (const p of toRes.prims) {
    const q = fromMap.get(p.key);
    merged.push(q ? interpPrim(q, p, t) : { ...p, opacity: (p.opacity ?? 1) * Math.min(1, t * 1.6) });
  }
  for (const q of fromRes.prims) {
    if (!toKeys.has(q.key)) merged.push({ ...q, opacity: (q.opacity ?? 1) * Math.max(0, 1 - t * 1.8) });
  }
  paint2D(ctx, merged);
  return toRes;
}

/** 单面板绘制（无补间，用于首帧 / 单步立即落位） */
export function drawStatic(ctx, rect, layer, env = {}) {
  return drawLayer(ctx, rect, layer, env);
}

/**
 * 播放会话：纯状态机，不碰 DOM。
 * 事件：onStep(stepIndex, step, prevStep) / onTick(t) / onState(state)
 */
export function createPlayer(trace, opt = {}) {
  const steps = trace.steps;
  let index = opt.start ?? 0;
  let speed = opt.speed ?? 4;
  let playing = false;
  let raf = null;
  let t0 = 0;
  let tween = 1;
  const listeners = { step: [], state: [], tick: [] };

  const duration = () => stepDuration(speed, countElements(steps[index]));

  function countElements(step) {
    let n = 0;
    for (const l of step.layers) {
      if (Array.isArray(l.data.values)) n += l.data.values.length;
      else if (Array.isArray(l.data.cells)) n += l.data.cells.length;
      else if (Array.isArray(l.data.nodes)) n += l.data.nodes.length;
      else if (Array.isArray(l.data.tree)) n += l.data.tree.length;
    }
    return n;
  }

  function emit(type, ...args) {
    for (const fn of listeners[type]) fn(...args);
  }

  function snapshot(prevIndex) {
    emit('step', index, steps[index], steps[prevIndex] ?? null);
  }

  function frame(now) {
    if (!playing) return;
    const d = duration();
    const p = Math.min(1, (now - t0) / d);
    tween = p;
    emit('tick', p);
    if (p >= 1) {
      if (index >= steps.length - 1) {
        playing = false;
        tween = 1;
        emit('state', state());
        emit('tick', 1);
        return;
      }
      const prev = index;
      index += 1;
      t0 = now;
      tween = 0;
      snapshot(prev);
    }
    raf = requestAnimationFrame(frame);
  }

  function state() {
    return { index, total: steps.length, playing, speed, tween, done: steps[index]?.done || false };
  }

  const api = {
    get trace() {
      return trace;
    },
    get index() {
      return index;
    },
    step(i = index) {
      return steps[Math.max(0, Math.min(steps.length - 1, i))];
    },
    prevStep(i = index) {
      return i > 0 ? steps[i - 1] : null;
    },
    state,
    on(type, fn) {
      (listeners[type] ||= []).push(fn);
      return () => {
        listeners[type] = listeners[type].filter((f) => f !== fn);
      };
    },
    go(i, { animate = false } = {}) {
      const target = Math.max(0, Math.min(steps.length - 1, i));
      const prev = index;
      index = target;
      tween = animate ? 0 : 1;
      t0 = performance.now();
      snapshot(prev);
      emit('tick', tween);
      emit('state', state());
    },
    next() {
      if (index < steps.length - 1) api.go(index + 1, { animate: true });
    },
    prev() {
      if (index > 0) api.go(index - 1, { animate: true });
    },
    first() {
      api.go(0);
    },
    last() {
      api.go(steps.length - 1);
    },
    reset() {
      api.pause();
      api.go(0);
    },
    play() {
      if (playing) return;
      if (index >= steps.length - 1) api.go(0);
      playing = true;
      t0 = performance.now() - duration() * (tween >= 1 ? 0 : 0);
      tween = 0;
      emit('state', state());
      raf = requestAnimationFrame(frame);
    },
    pause() {
      playing = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      tween = 1;
      emit('state', state());
      emit('tick', 1);
    },
    toggle() {
      playing ? api.pause() : api.play();
    },
    setSpeed(v) {
      speed = Math.max(1, Math.min(5, v));
      emit('state', state());
    },
    getSpeed() {
      return speed;
    },
    /** 播放器把"当前 t"交给渲染层：viewer 在 rAF 里调用 */
    getTween() {
      return tween;
    },
  };
  return api;
}

export { stepDuration };
