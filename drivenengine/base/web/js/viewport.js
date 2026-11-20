/**
 * viewport.js -- 可视化视窗（V1/V3：单视窗 + 结构切换器）
 *
 * 设计要点（PLAN_VIEWPORT §4）：
 *   · 从一开始就是**可实例化组件** createViewport(opts)，V3 只建 1 个，V5 建 N 个并可拖拽
 *   · 工具条的"切换器"列出候选结构（来自 arbitrateAll），切换只重绘、不重跑 trace
 *   · 渲染区**只按 shape 分派**，绝不按结构名
 *   · 设置持久化：localStorage['avc.viewports']
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};
  const KEY = 'avc.viewports';

  function loadPref() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function savePref(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }

  /**
   * 组装切换器候选：仲裁结论（可能含静态未采集项）∪ 快照里实际有数据的数组/结构
   * 排序：有数据优先 → 来源优先级 → 置信度
   * @returns {Array} [{var, shape, label, source, conf, hasData, why}]
   */
  function buildCandidates(snap, arbItems) {
    const G = AVC.graph;
    const arrs = AVC.vmodel.groupArrays(snap);
    const lists = snap.lists || {};
    const nxm = snap.nxm || {};
    const hasNxm = (k) => !!(nxm[k] && nxm[k].length);
    /** 有 NE 事件 → 才可能是图/树；纯 N 序列当线性链画出 */
    const hasEdgeUnder = (A) => (A || []).some(e => e[0] === 'NE');
    const out = [];
    const seen = {};

    (arbItems || []).forEach(it => {
      if (!it || !it.name) return;
      const shape = G.shapeFromCatalog(it.templateId) || 'list';
      seen[it.name] = true;
      out.push({
        var: it.name, shape, label: it.name,
        source: it.source || 'none', conf: it.conf, why: it.why || '',
        hasData: !!(arrs[it.name] || lists[it.name] || hasNxm(it.name)),
      });
    });

    // 采集层产出的 N/E/M（STL 容器、邻接表等没有 lists 条目）
    for (const k in nxm) {
      if (seen[k] || !nxm[k].length) continue;
      seen[k] = true;
      out.push({
        var: k, shape: hasEdgeUnder(nxm[k]) ? 'graph' : 'list', label: k,
        source: 'runtime', conf: 0.9, why: '采集层 N/E/M', hasData: true,
      });
    }

    for (const k in lists) {
      if (seen[k]) continue;
      seen[k] = true;
      out.push({
        var: k, shape: lists[k].shape === 'tree' ? 'tree' : 'list', label: k,
        source: 'runtime', conf: 0.9, why: '运行时堆图采集到结点', hasData: true,
      });
    }
    for (const k in arrs) {
      if (seen[k]) continue;
      seen[k] = true;
      out.push({
        var: k, shape: 'seq', label: k,
        source: 'runtime', conf: 0.6, why: '运行时逐元素取值', hasData: true,
      });
    }

    const srcOrder = { manual: 0, 'ast+runtime': 1, runtime: 2, 'runtime(override ast)': 3, ast: 4, none: 5 };
    out.sort((a, b) =>
      (b.hasData - a.hasData) ||
      ((srcOrder[a.source] == null ? 9 : srcOrder[a.source]) - (srcOrder[b.source] == null ? 9 : srcOrder[b.source])) ||
      ((b.conf || 0) - (a.conf || 0)));
    return out;
  }

  /**
   * @param {object} opts {
   *   host:HTMLElement,          容器（.body）
   *   title?:string,
   *   onSelect?:fn(varName),     切换回调（外部可用于打点/联动）
   * }
   */
  function createViewport(opts) {
    opts = opts || {};
    const host = opts.host;
    const pref = loadPref();
    const state = {
      candidates: [],        // [{var, shape, label, source, conf}]
      active: pref.active || null,
      items: pref.items || {},   // var -> {shape?}
      lastSnapshot: null,
    };

    /* ---------------- DOM ---------------- */
    host.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'vp-bar';
    bar.style.cssText = 'display:flex;gap:6px;align-items:center;padding:2px 4px 6px;font:11px var(--ui);flex-wrap:wrap';

    const pick = document.createElement('select');
    pick.className = 'mini-select';
    pick.style.minWidth = '190px';

    const shapeTag = document.createElement('span');
    shapeTag.style.cssText = 'font:10px var(--mono);color:#7b8794';

    const statsTag = document.createElement('span');
    statsTag.style.cssText = 'margin-left:auto;font:10px var(--mono);color:#7b8794';

    bar.appendChild(pick);
    bar.appendChild(shapeTag);
    bar.appendChild(statsTag);
    host.appendChild(bar);

    const canvas = document.createElement('div');
    canvas.className = 'vp-canvas';
    canvas.style.cssText = 'min-height:120px';
    host.appendChild(canvas);

    /* ---------------- 候选与切换 ---------------- */
    function setCandidates(list) {
      state.candidates = list || [];
      pick.innerHTML = '';
      if (!state.candidates.length) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = '（本步无可视化结构）';
        pick.appendChild(o);
        state.active = null;
        renderEmpty('尚无候选结构：先按 F8 单步；STL 容器需要 V2 采集层支持');
        return;
      }
      state.candidates.forEach(c => {
        const o = document.createElement('option');
        o.value = c.var;
        const badge = AVC.arbitrate ? AVC.arbitrate.badge(c.source) : { text: c.source };
        o.textContent = c.label + ' · ' + c.shape + ' · ' + badge.text +
          (c.conf != null ? ' ' + Math.round(c.conf * 100) + '%' : '');
        pick.appendChild(o);
      });
      if (!state.candidates.some(c => c.var === state.active)) {
        state.active = state.candidates[0].var;
      }
      pick.value = state.active;
      shapeTag.textContent = 'shape: ' + shapeOf(state.active);
      saveActive();
    }

    function shapeOf(varName) {
      const c = state.candidates.find(x => x.var === varName);
      if (!c) return '-';
      const itemPref = state.items[varName];
      return (itemPref && itemPref.shape) || c.shape;
    }

    function saveActive() {
      const p = loadPref();
      p.active = state.active;
      p.items = state.items;
      savePref(p);
    }

    function renderEmpty(msg) {
      canvas.innerHTML = '<div class="empty">' + msg + '</div>';
      statsTag.textContent = '';
      shapeTag.textContent = 'shape: -';
    }

    /** 只按 shape 分派（契约 ②③） */
    function renderActive() {
      const v = state.active;
      if (!v) return;
      const shape = shapeOf(v);
      shapeTag.textContent = 'shape: ' + shape;
      const snap = state.lastSnapshot;

      try {
        if (shape === 'seq') {
          const arrs = AVC.vmodel ? AVC.vmodel.groupArrays(snap) : {};
          const arr = arrs[v];
          if (!arr) { renderEmpty('本步无 ' + v + ' 的数组数据（已识别为 seq，等待采集）'); return; }
          if (arr.twoD) AVC.arrayView.render2D(canvas, arr, { mode: 'bar' });
          else AVC.arrayView.render1D(canvas, arr, {});
          statsTag.textContent = 'dims=' + arr.dims.join('x') + ' · ' + arr.cells.length + ' 元素';
          return;
        }
        if (shape === 'stack' || shape === 'heap') {
          AVC.stackheap.renderDSStack(canvas, snap, null, { varName: v });
          statsTag.textContent = shape;
          return;
        }
        // list / tree / graph 都走统一图模型 → graphView
        const g = AVC.graph.fromSnapshot(snap, v, shape);
        if (!g) { renderEmpty('本步无 ' + v + ' 的结点数据（shape=' + shape + '，采集层待 V2 对接）'); return; }
        if (shape === 'tree') AVC.treeView.render(canvas, vobjOf(g), { emptyText: '树为空' });
        else if (shape === 'graph') AVC.linkView.paint(canvas, vobjOf(g), { gap: 22 });
        else AVC.linkView.paint(canvas, vobjOf(g), { gap: 26 });
        statsTag.textContent = AVC.graph.describe(g) + ' · 来源 ' + (findCand(v).source || '-');
      } catch (e) {
        renderEmpty('渲染失败：' + e.message);
      }
    }

    function findCand(v) { return state.candidates.find(x => x.var === v) || {}; }

    /** 图模型 → 渲染器要的 VObj（保持渲染器不认识结构名） */
    function vobjOf(g) {
      const nodes = g.nodes.map(n => ({
        kind: 'node', name: g.var + '#' + n.idx,
        valueText: n.value, keyName: 'key',
        fields: [], children: [],
        meta: Object.assign({ idx: n.idx }, n.meta, {
          left: g.shape === 'tree' ? (g.nodes.find(x => x.idx === 2 * n.idx + 1) || null) : null,
          right: g.shape === 'tree' ? (g.nodes.find(x => x.idx === 2 * n.idx + 2) || null) : null,
        }),
      }));
      return {
        kind: g.shape === 'tree' ? 'tree' : (g.shape === 'graph' ? 'graph' : 'list'),
        name: g.var, valueText: 'count=' + g.nodes.length,
        fields: [], children: nodes,
        // edges 必须交给渲染器：graph 形状按真实边画，不能退化成 i→i+1 的链
        meta: Object.assign({ count: g.nodes.length, shape: g.shape, edges: g.edges || [] }, g.meta),
      };
    }

    /* ---------------- 对外接口 ---------------- */
    pick.addEventListener('change', () => {
      state.active = pick.value;
      saveActive();
      shapeTag.textContent = 'shape: ' + shapeOf(state.active);
      renderActive();
      if (opts.onSelect) opts.onSelect(state.active);
    });

    return {
      setCandidates,
      /** 每步把快照喂进来，只重绘当前选中项（不重跑 trace） */
      update(snapshot) { state.lastSnapshot = snapshot; renderActive(); },
      getActive: () => state.active,
      setShape(varName, shape) {
        state.items[varName] = Object.assign({}, state.items[varName], { shape });
        saveActive();
        renderActive();
      },
      // V5 预留
      getRect() { const p = loadPref(); return (p.items[state.active] || {}).bound || null; },
      setRect(r) {
        state.items[state.active] = Object.assign({}, state.items[state.active], { bound: r });
        saveActive();
      },
    };
  }

  AVC.viewport = { create: createViewport, buildCandidates, KEY, loadPref };
})(typeof window !== 'undefined' ? window : globalThis);
