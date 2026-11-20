/**
 * viz-window.js -- 可视化窗口（**对齐 06 的画布模型**：每个 layer 一张 canvas 卡）
 *
 * 窗口外壳（标题条 / 时间轴 / transport / 全屏）沿用 add02 的契约与样式；
 * 画布部分改成 06（add01 viewer）的做法：
 *   `.stage`（纵向 grid）里，**每个 layer 一张 `.canvas-card`**，卡头写"标题 + 渲染器类名 · style · 格数/结点数"，
 *   卡内 canvas 固定 300px 高、宽度跟卡片，绘制走 `drawTween(ctx, rect, from, to, t)`。
 *
 * 06 没有缩放/平移（它的卡片是随页面滚动的），所以这里也不再劫持滚轮/拖拽，
 * 只保留"重新布局"按钮（重新量尺寸）——行为与 06 一致。
 */

import { createStage as createSvgStage, CARD_CANVAS_HEIGHT } from './svg-stage.js';
import { createStage as createCanvasStage } from './canvas-stage.js';
import { createStage as createHtmlStage } from './html-stage.js';

/**
 * 渲染机制开关
 *   · svg    —— **默认**：SVG 元素 + CSS 类（已验证数组/树/图都能正常显示）
 *   · canvas —— 旧的 canvas 2D 整帧重绘（对照用）
 *   · html   —— HTML div + .bsviz-* 契约（**实验态**：plus01&02 里没有宿主的 .bsviz-cell 样式，
 *               数组会没有格子尺寸、树的线段/文字会走形；加 ?render=html 才启用）
 */
export const RENDER_MODE = (() => {
  try {
    const q = new URLSearchParams((globalThis.location && globalThis.location.search) || '');
    const m = q.get('render');
    return m === 'canvas' || m === 'html' ? m : 'svg';
  } catch { return 'svg'; }
})();
const STAGE_IMPL = { html: createHtmlStage, svg: createSvgStage, canvas: createCanvasStage };
const createStage = (stageHost) => (STAGE_IMPL[RENDER_MODE] || createSvgStage)(stageHost);

const ICON = {
  reset: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="2.5" width="1.6" height="9"/><path d="M11 2.5 5.2 7 11 11.5z"/></svg>',
  prev: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M9.5 2.5 4 7l5.5 4.5z"/></svg>',
  play: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2.5 10.5 7 3.5 11.5z"/></svg>',
  next: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5 8.4 7 2.5 11.5z"/></svg>',
  last: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 2.5 6.8 7 1 11.5z"/><rect x="8.4" y="2.5" width="1.6" height="9"/></svg>',
};

const TEMPLATE = `
<div class="win-bar">
  <span class="win-dot" aria-hidden="true"></span>
  <span class="win-title">可视化</span>
  <span class="win-sub" data-win-sub>案例 · 变体</span>
  <span class="win-actions">
    <button class="win-action" type="button" data-viz-full aria-pressed="false" title="铺满整个屏幕（Esc 退出）">全屏</button>
  </span>
</div>
<div class="win-body-viz">
  <section class="viewport" aria-label="可视化演示">
    <div class="viewport-head">
      <span class="vh-actions">
        <button class="bl-btn" type="button" data-viz-relayout title="重新量一次画布尺寸">重新布局</button>
      </span>
    </div>
    <div class="viewport-body" data-viz-body aria-label="每层一张画布，纵向滚动">
      <div class="stage" data-viz-stage></div>
    </div>
    <div class="viewport-warn" data-viz-warn hidden></div>
    <div class="viewport-hint">每层一张画布（与 06 一致）· 卡片纵向滚动</div>
  </section>

  <section class="timeline" aria-label="播放控制">
    <div class="tl-transport" data-tl-transport>
      <button class="tl-btn" type="button" data-t="reset" title="回到第 1 步" aria-label="重置">${ICON.reset}</button>
      <button class="tl-btn" type="button" data-t="prev" title="上一步" aria-label="上一步">${ICON.prev}</button>
      <button class="tl-btn" type="button" id="playBtn" data-t="play" title="播放 / 暂停" aria-label="播放">${ICON.play}</button>
      <button class="tl-btn" type="button" data-t="next" title="下一步" aria-label="下一步">${ICON.next}</button>
      <button class="tl-btn" type="button" data-t="last" title="跳到末步" aria-label="跳到末步">${ICON.last}</button>
    </div>
    <span class="tl-count" data-tl-count aria-live="polite">0 / 0</span>
    <div class="tl-ruler" data-tl-ruler tabindex="0" role="slider"
         aria-label="步骤时间轴：点击、拖动或按左右方向键跳到某一步"
         aria-valuemin="1" aria-valuemax="1" aria-valuenow="1">
      <div class="tl-playhead" data-tl-playhead aria-hidden="true"></div>
    </div>
  </section>
</div>
`;

export function createVizWindow(host, { run = null, onSeek = null, onTransport = null, title = '', explainHost = null } = {}) {
  if (!host) throw new Error('createVizWindow 需要一个容器');

  const root = document.createElement('section');
  root.className = 'win vizwin';
  root.dataset.win = 'viz';
  root.innerHTML = TEMPLATE;
  host.append(root);

  const q = (sel) => root.querySelector(sel);
  const body = q('[data-viz-body]');
  const stageEl = q('[data-viz-stage]');
  const warn = q('[data-viz-warn]');
  const ruler = q('[data-tl-ruler]');
  const playhead = q('[data-tl-playhead]');
  const count = q('[data-tl-count]');
  const playBtn = q('#playBtn');
  const winSub = q('[data-win-sub]');
  const explain = explainHost || null;

  const stage = createStage(stageEl);
  const state = { stepIndex: -1, total: 0, playing: false };
  let current = null;
  let prevLayers = null;

  let roLastW = -1;
  const ro = new ResizeObserver(() => {
    /* 只对**宽度**变化重排：卡片高度是本窗口按内容自己设的，
       高度变化若再触发重排就会形成自回环（每圈 +14px —— 就是"按一次可视化变长一点"）。 */
    const w = body && body.getBoundingClientRect ? Math.round(body.getBoundingClientRect().width || 0) : 0;
    if (w === roLastW) return;
    roLastW = w;
    stage.resize();
    redraw();
  });
  ro.observe(body);

  function relayout() { stage.resize(); redraw(); }

  function redraw() {
    if (!current) { stage.clear(); return { cards: 0, prims: 0 }; }
    const m = stage.render(current.layers, { prevLayers, t: 1, bg: '#ffffff' });
    warn.hidden = m.prims > 0;
    if (m.prims === 0) warn.textContent = '这一步没有可画的图元（style=' + (m.styles.join('/') || '?') + '）';
    return m;
  }

  /* ---------------- 时间轴 ---------------- */
  function paintRuler() {
    const pct = state.total <= 1 ? 0 : (Math.max(0, state.stepIndex) / (state.total - 1)) * 100;
    playhead.style.left = Math.max(0, Math.min(100, pct)) + '%';
    ruler.setAttribute('aria-valuemin', '1');
    ruler.setAttribute('aria-valuemax', String(Math.max(1, state.total)));
    ruler.setAttribute('aria-valuenow', String(state.stepIndex + 1));
    count.textContent = (Math.max(0, state.stepIndex) + 1) + ' / ' + Math.max(1, state.total);
    if (playBtn) {
      playBtn.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
      playBtn.title = state.playing ? '暂停' : '播放';
      playBtn.setAttribute('aria-label', state.playing ? '暂停' : '播放');
    }
  }

  function seekFromClientX(clientX) {
    const r = ruler.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
    onSeek?.(Math.round(ratio * Math.max(0, state.total - 1)), { stop: true });
  }
  let rulerDrag = false;
  ruler.addEventListener('pointerdown', (e) => { rulerDrag = true; ruler.setPointerCapture(e.pointerId); seekFromClientX(e.clientX); });
  ruler.addEventListener('pointermove', (e) => { if (rulerDrag) seekFromClientX(e.clientX); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) ruler.addEventListener(t, () => { rulerDrag = false; });
  ruler.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onSeek?.(Math.max(0, state.stepIndex - 1), { stop: true }); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onSeek?.(Math.min(state.total - 1, state.stepIndex + 1), { stop: true }); }
    if (e.key === 'Home') { e.preventDefault(); onSeek?.(0, { stop: true }); }
    if (e.key === 'End') { e.preventDefault(); onSeek?.(state.total - 1, { stop: true }); }
  });

  q('[data-tl-transport]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-t]');
    if (!btn) return;
    const action = btn.dataset.t;
    if (action === 'prev') onSeek?.(Math.max(0, state.stepIndex - 1), { stop: true });
    else if (action === 'next') onSeek?.(Math.min(state.total - 1, state.stepIndex + 1), { stop: true });
    else onTransport?.(action);
  });
  q('[data-viz-relayout]').addEventListener('click', relayout);

  /* ---------------- 全屏 ---------------- */
  function setFull(on) {
    root.dataset.full = on ? 'true' : 'false';
    document.body.classList.toggle('is-viz-full', on);
    const btn = q('[data-viz-full]');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? '退出全屏' : '全屏';
    setTimeout(relayout, 30);
  }
  q('[data-viz-full]').addEventListener('click', () => setFull(root.dataset.full !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.dataset.full === 'true') setFull(false);
  });

  /* ---------------- 对外 API（与 add02 同名同义） ---------------- */
  function setStep(step, nextState = {}) {
    current = step || null;
    if (nextState.prevStep && nextState.prevStep.layers) prevLayers = nextState.prevStep.layers;
    else if (Number.isInteger(nextState.stepIndex) && nextState.stepIndex <= 0) prevLayers = null;
    state.stepIndex = Number.isInteger(nextState.stepIndex) ? nextState.stepIndex : (step ? state.stepIndex : -1);
    if (Number.isInteger(nextState.total)) state.total = nextState.total;
    state.playing = !!nextState.playing;
    redraw();
    paintRuler();
    if (explain) {
      const text = (step && (step.note || step.title)) || '';
      explain.textContent = text;
      explain.hidden = !text;
    }
  }

  function setRun(nextRun, meta = {}) {
    current = null;
    prevLayers = null;
    state.stepIndex = -1;
    state.total = nextRun?.steps?.length || 0;
    winSub.textContent = meta.subtitle || (title || '案例 · 变体');
    stage.clear();
    setStep(nextRun?.steps?.[0] ?? null, { stepIndex: nextRun ? 0 : -1, total: state.total, playing: false });
    setTimeout(relayout, 30);
  }

  stage.resize();
  setRun(run, { subtitle: title });

  return {
    el: root,
    setRun,
    setStep,
    fitView: relayout,
    replay: () => { onTransport?.('reset'); },
    relayout,
    redraw,
    metrics: () => stage.metrics(),
    cardCount: () => stage.cardCount(),
    destroy: () => {
      ro.disconnect();
      if (root.dataset.full === 'true') setFull(false);
      stage.clear();
      root.remove();
    },
  };
}

export { CARD_CANVAS_HEIGHT };
