/**
 * main.js -- plus01&02 装配层
 *
 * 分工：
 *   壳（窗口/时间轴/transport/缩放平移/全屏） → app/viz-window.js（沿用 add02 的窗口契约与样式）
 *   画（9 个渲染器 / 9 种图层契约）           → vendor/engine/**（add01 原样）
 *   目录 / 结构-样式换算 / 全部内置案例        → vendor/catalog/**、vendor/app/adapt.js、vendor/algorithms/**（add01 原样）
 *   本文件只做"选什么 → 跑出 trace → 换算成目标 style → 交给窗口逐步画"。
 */

import { ITEMS, ITEM_BY_UID, PACKAGES, DATA_STRUCTURES, DS_BY_ID, RENDERERS, resolveStyle, styleOptions, TOTALS } from '../vendor/catalog/index.js';
import { adaptStepLayers } from '../vendor/app/adapt.js';
import { createVizWindow } from './viz-window.js';

const S = {
  uid: 'a/insertion-sort',
  variantId: 'v1',
  sampleId: null,
  dsId: null,
  styleOverride: null,
  module: null,
  trace: null,
  styled: [],
  index: 0,
  playing: false,
  speed: 3,
  timer: null,
};

const $ = (sel) => document.querySelector(sel);

/* ---------------- 目录（7 包 / 54 案例） ---------------- */
function buildCatalog() {
  const box = $('#pkg-list');
  box.innerHTML = '';
  for (const pkg of PACKAGES) {
    const group = document.createElement('div');
    group.className = 'pkg';
    group.innerHTML = '<h3>' + pkg.id + ' · ' + pkg.name + ' <span>' + pkg.items.length + ' 条</span></h3>';
    for (const it of pkg.items) {
      const uid = pkg.id.toLowerCase() + '/' + it.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'item' + (uid === S.uid ? ' active' : '');
      btn.textContent = it.title;
      btn.title = uid + ' · ' + it.focus + ' · 结构 ' + it.ds.join('/') + ' · 默认 style ' + it.style;
      btn.dataset.uid = uid;
      btn.addEventListener('click', () => selectItem(uid));
      group.appendChild(btn);
    }
    box.appendChild(group);
  }
  $('#catalog-total').textContent = TOTALS.items + ' 案例 / ' + TOTALS.variants + ' 变体 / ' + TOTALS.dataStructures + ' 族';
}

function filterCatalog(q) {
  const kw = q.trim().toLowerCase();
  for (const btn of document.querySelectorAll('#pkg-list .item')) {
    const it = ITEM_BY_UID[btn.dataset.uid] || {};
    const hit = !kw
      || btn.textContent.toLowerCase().includes(kw)
      || btn.dataset.uid.includes(kw)
      || (it.ds || []).some((d) => d.includes(kw) || (DS_BY_ID[d]?.name || '').toLowerCase().includes(kw));
    btn.hidden = !hit;
  }
}

/* ---------------- 选中一个案例 ---------------- */
async function selectItem(uid) {
  const item = ITEM_BY_UID[uid];
  if (!item) return;
  stop();
  S.uid = uid;
  S.variantId = item.variants[0].id;
  S.sampleId = null;
  S.dsId = (item.ds && item.ds[0]) || null;
  S.styleOverride = null;
  for (const b of document.querySelectorAll('#pkg-list .item')) b.classList.toggle('active', b.dataset.uid === uid);

  $('#crumb').textContent = item.pkg + ' · ' + item.title;
  $('#crumb-sub').textContent = item.pkgName + ' · ' + item.focus;

  S.module = await import(new URL('../vendor/' + item.path, import.meta.url).href);
  renderVariants(item);
  renderSamples();
  renderDsAndStyle(item);
  await runTrace();
}

/* ---------------- 变体 / 样例 ---------------- */
function renderVariants(item) {
  const box = $('#variants');
  box.innerHTML = '';
  for (const v of item.variants) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (v.id === S.variantId ? ' active' : '');
    b.textContent = v.name;
    b.title = v.id + ' · ' + (v.note || '');
    b.addEventListener('click', async () => {
      S.variantId = v.id;
      renderVariants(item);
      await runTrace();
    });
    box.appendChild(b);
  }
}

function renderSamples() {
  const box = $('#samples');
  box.innerHTML = '';
  const samples = S.module?.samples || [];
  if (!samples.length) { box.textContent = '（该案例没有样例声明）'; return; }
  if (!S.sampleId) S.sampleId = samples[0].id;
  for (const s of samples) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (s.id === S.sampleId ? ' active' : '');
    b.textContent = s.label || s.id;
    b.title = 'input = ' + JSON.stringify(s.input);
    b.addEventListener('click', async () => { S.sampleId = s.id; renderSamples(); await runTrace(); });
    box.appendChild(b);
  }
}

/* ---------------- 数据结构 / 画法（style） ---------------- */
/** 06 的"画法开关"分组（add01/src/app/viewer.js L96-137，逐条照抄） */
function drawModeGroups(style) {
  const s = Number(style);
  if (s === 1 || s === 5) {
    return [
      { label: '矩形框（ArrOneShape=0）', props: { shape: 0 } },
      { label: '点（ArrOneShape=1）', props: { shape: 1 } },
      { label: '矩形 + 网格', props: { shape: 0, showGrid: true, showLine: false } },
      { label: '矩形 + 连线', props: { shape: 0, showGrid: false, showLine: true } },
      { label: '矩形 + 网格 + 连线', props: { shape: 0, showGrid: true, showLine: true } },
      { label: '点 + 连线', props: { shape: 1, showGrid: false, showLine: true } },
    ];
  }
  if (s === 2) {
    return [
      { label: 'DrawMode 0 · 圆柱', props: { drawMode: 0 } },
      { label: 'DrawMode 1 · 柱状', props: { drawMode: 1 } },
      { label: 'DrawMode 2 · 球', props: { drawMode: 2 } },
      { label: 'DrawMode 3 · 曲面线框', props: { drawMode: 3 } },
    ];
  }
  if (s === 3) {
    return [
      { label: '直角节点 + 先画点', props: { roundShape: false, linkFirst: false } },
      { label: '圆角节点 + 先画线（LinkLinkFirst=1）', props: { roundShape: true, linkFirst: true } },
    ];
  }
  if (s === 9) {
    return [
      { label: 'canvas 后端（可看节点移动）', props: { layout: 'canvas' } },
      { label: 'TTreeView 后端（缩进 + StateIndex 14/15）', props: { layout: 'treeview' } },
    ];
  }
  if (s === 10) {
    return [
      { label: '圆周布局', props: { layout: 'circle' } },
      { label: '直线布局', props: { layout: 'line' } },
    ];
  }
  return [{ label: '该渲染器没有额外画法开关', props: {} }];
}

function renderDrawModeSel(style) {
  const sel = $('#drawmode');
  if (!sel) return;
  const groups = drawModeGroups(style);
  sel.innerHTML = '';
  groups.forEach((g, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = g.label;
    sel.appendChild(o);
  });
  sel.disabled = groups.length <= 1;
  // 切 style 后重置为默认画法（06 的行为：groups[0]）
  S.drawProps = groups[0].props;
  sel.value = '0';
  sel.onchange = () => {
    S.drawProps = groups[Number(sel.value)]?.props || {};
    applyStyle();
  };
}

function renderDsAndStyle(item) {
  const dsSel = $('#ds-select');
  dsSel.innerHTML = '';
  for (const d of item.ds) {
    const o = document.createElement('option');
    o.value = d;
    o.textContent = (DS_BY_ID[d]?.name || d) + '（' + d + '）';
    dsSel.appendChild(o);
  }
  dsSel.value = S.dsId;
  dsSel.onchange = () => { S.dsId = dsSel.value; S.styleOverride = null; S.drawProps = {}; renderStyleSel(item); renderDrawModeSel(resolveStyle(S.dsId, S.styleOverride)); applyStyle(); };

  renderStyleSel(item);
  renderDrawModeSel(resolveStyle(S.dsId, S.styleOverride));
}

function renderStyleSel(item) {
  const styleSel = $('#style-select');
  styleSel.innerHTML = '';
  const styles = styleOptions(S.dsId);
  for (const st of styles) {
    const o = document.createElement('option');
    o.value = String(st);
    // 只显示画法名（"一维数组 / 二维矩阵 / 链表…"）；style 编号与渲染器类名只在右栏"渲染信息"出现一次
    o.textContent = RENDERERS[st]?.label || ('style ' + st);
    o.title = 'style ' + st + ' · ' + (RENDERERS[st]?.cls || '');
    styleSel.appendChild(o);
  }
  styleSel.value = String(resolveStyle(S.dsId, S.styleOverride));
  styleSel.onchange = () => {
    S.styleOverride = Number(styleSel.value);
    // 换 style 就换成对应的"画法开关"分组（06 的行为：重填下拉并回到 groups[0]）
    renderDrawModeSel(resolveStyle(S.dsId, S.styleOverride));
    applyStyle();
  };
}

/* ---------------- 跑轨迹 + 换算 ---------------- */
async function runTrace() {
  const sample = (S.module.samples || []).find((s) => s.id === S.sampleId) || (S.module.samples || [])[0];
  try {
    S.trace = S.module.run(S.variantId, sample ? sample.input : {});
  } catch (e) {
    showError('生成轨迹失败：' + e.message);
    return;
  }
  hideError();
  applyStyle(true);
}

function applyStyle(resetIndex = false) {
  const style = resolveStyle(S.dsId, S.styleOverride);
  const drawProps = S.drawProps || {};
  let converted = 0;
  S.styled = (S.trace.steps || []).map((step) => {
    // 与 06 一致：先按目标 style 换算图层，再把"画法开关"的 props 合并进每一层
    const { layers, converted: cv } = adaptStepLayers(step, style, { props: drawProps });
    if (cv) converted++;
    return { ...step, layers: layers.map((l) => ({ ...l, props: { ...l.props, ...drawProps } })) };
  });
  const item = ITEM_BY_UID[S.uid];
  // 去重后每个事实只有一处出处：
  //   案例名   → #crumb
  //   变体/样例 → 窗口 .win-sub
  //   结构/画法 → 两个下拉（唯一的"可读当前值"）
  //   style + 渲染器类名 → 右栏"渲染信息"（唯一的技术细节处）
  $('#engine-meta').textContent = (RENDERERS[style]?.cls || '?') + ' · style ' + style +
    ' · backend ' + (RENDERERS[style]?.backend || '?');
  $('#convert-note').textContent = converted
    ? '有损换算 ' + converted + ' / ' + S.styled.length + ' 步（数组没有指针、树没有顺序，只影响显示）'
    : '原始画法，无换算';
  if (item) renderStyleSel(item);

  const sample = (S.module.samples || []).find((s) => s.id === S.sampleId) || (S.module.samples || [])[0];
  vw.setRun({ ...S.trace, steps: S.styled }, {
    subtitle: (item?.variants.find((v) => v.id === S.variantId)?.name || S.variantId) +
      (sample ? ' · ' + (sample.label || sample.id) : ''),
  });
  buildCode();
  if (resetIndex) goto(0); else goto(Math.min(S.index, S.styled.length - 1));
}

/* ---------------- 步进 / 播放 ---------------- */
function goto(i) {
  if (!S.styled.length) return;
  S.index = Math.max(0, Math.min(i, S.styled.length - 1));
  const step = S.styled[S.index];
  const prevStep = S.index > 0 ? S.styled[S.index - 1] : null;   // 06 的 drawTween 需要 from/to
  vw.setStep(step, { stepIndex: S.index, total: S.styled.length, playing: S.playing, prevStep });
  paintVars(step);
  highlightCode(step.lineId);
}

function paintVars(step) {
  $('#vars').textContent = step.vars ? JSON.stringify(step.vars, null, 0) : '—';
  $('#event').textContent = step.event || '—';
}


/** 源码面板：优先用模块导出的 sourceLines(variantId)（每个案例都自带真正的 C 代码），
    其次用 trace 里带的；两者都没有才显示占位。 */
function sourceLinesOf() {
  const fromTrace = S.trace && S.trace.sourceLines;
  if (Array.isArray(fromTrace) && fromTrace.length) return fromTrace;
  try {
    const fn = S.module && S.module.sourceLines;
    const fromModule = typeof fn === 'function' ? fn(S.variantId) : fn;
    if (Array.isArray(fromModule) && fromModule.length) return fromModule;
  } catch (e) { void e; }
  return [];
}

function buildCode() {
  const lines = sourceLinesOf();
  $('#code').innerHTML = lines.length
    ? lines.map((l) => '<li data-line="' + l.lineId + '"><span class="ln">' + (l.no ?? '') + '</span><span>' + escapeHtml(l.text) + '</span></li>').join('')
    : '<li class="empty">（该案例没有 sourceLines）</li>';
}

function highlightCode(lineId) {
  for (const li of document.querySelectorAll('#code li')) li.classList.toggle('active', li.dataset.line === lineId);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function dur() { return [1200, 900, 650, 450, 300][Math.max(1, Math.min(5, S.speed)) - 1]; }

function play() {
  if (S.playing || !S.styled.length) return;
  S.playing = true;
  S.timer = setInterval(() => {
    if (S.index >= S.styled.length - 1) { stop(); return; }
    goto(S.index + 1);
  }, dur());
  // 播放态同步给窗口（播放按钮的强调色/aria 由窗口自己画）
  vw?.setStep(S.styled[S.index], { stepIndex: S.index, total: S.styled.length, playing: true, prevStep: S.index > 0 ? S.styled[S.index - 1] : null });
}
function stop() {
  S.playing = false;
  if (S.timer) { clearInterval(S.timer); S.timer = null; }
  if (vw && S.styled.length) vw.setStep(S.styled[S.index], { stepIndex: S.index, total: S.styled.length, playing: false, prevStep: S.index > 0 ? S.styled[S.index - 1] : null });
}
function togglePlay() { S.playing ? stop() : play(); }

function showError(msg) {
  const el = $('#error');
  el.hidden = false;
  el.textContent = msg;
}
function hideError() { const el = $('#error'); if (el) el.hidden = true; }

/* ---------------- 窗口（add02 壳 + canvas 引擎） ---------------- */
let vw = null;
function mountWindow() {
  vw = createVizWindow($('#viz-host'), {
    run: null,
    explainHost: $('#explain'),          // 本步解释落在右栏，不再压在画布上
    onSeek: (i, opt) => { if (opt && opt.stop) stop(); goto(i); },
    onTransport: (action) => {
      if (action === 'play') togglePlay();   // 播放键是**开关**（窗口只发 play，状态由这里裁决）
      else if (action === 'pause') stop();
      else if (action === 'reset') { stop(); goto(0); }
      else if (action === 'last') { stop(); goto(S.styled.length - 1); }
    },
  });
}

/* ---------------- 启动 ---------------- */
function boot() {
  // ?debug=1：卡头右侧显示真实"宽x高"（排查卡片高度棘轮用；默认关闭，视觉不变）
  try {
    if (new URLSearchParams(location.search).get('debug') === '1') document.body.classList.add('is-debug');
  } catch (e) { void e; }
  buildCatalog();
  mountWindow();
  $('#search').addEventListener('input', (e) => filterCatalog(e.target.value));
  // 播放控制只在窗口时间轴里有一套（reset/prev/play/next/last），页面不再重复一套按钮
  $('#speed').addEventListener('input', (e) => {
    S.speed = Number(e.target.value);
    $('#speed-val').textContent = S.speed;
    if (S.playing) { stop(); play(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); stop(); goto(S.index + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); stop(); goto(S.index - 1); }
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    if (e.key === 'Home') { e.preventDefault(); stop(); goto(0); }
    if (e.key === 'End') { e.preventDefault(); stop(); goto(S.styled.length - 1); }
  });
  selectItem(S.uid);

  // 调试/自检钩子（无副作用）：供 headless 自检读状态、数画布卡片
  if (typeof window !== 'undefined') {
    window.__plus = { state: S, get window() { return vw; }, items: ITEMS };
  }
}

boot();
