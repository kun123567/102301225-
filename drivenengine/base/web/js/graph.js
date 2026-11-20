/**
 * graph.js -- N / E / M 统一图模型（V1：契约的唯一下游入口）
 *
 * 契约（PLAN_VIEWPORT §0.2）：
 *   ① 采集层产出 N / E / M 三类事件
 *   ② 渲染器只按 shape 选画法
 *   ③ 渲染器不认结构名
 *
 * 本模块职责：把 N/E/M 事件（或等价来源）整理成渲染器唯一可消费的模型：
 *   { var, shape, nodes:[{idx,value,meta}], edges:[{from,to,kind,label}], meta:{}, stats:{} }
 *
 * 渲染器**禁止**直接读 events / snapshot.lists。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  const SHAPES = ['list', 'tree', 'graph', 'seq', 'stack', 'heap'];

  /** 边的相邻关系：list 用 i→i+1；tree 用 2i+1 / 2i+2 */
  function chainEdges(nodes, kind) {
    const out = [];
    for (let i = 0; i + 1 < nodes.length; i++) {
      out.push({ from: nodes[i].idx, to: nodes[i + 1].idx, kind: kind || 'next' });
    }
    return out;
  }
  function treeEdges(nodes) {
    const out = [];
    const has = new Set(nodes.map(n => n.idx));
    for (const n of nodes) {
      const l = 2 * n.idx + 1, r = 2 * n.idx + 2;
      if (has.has(l)) out.push({ from: n.idx, to: l, kind: 'left' });
      if (has.has(r)) out.push({ from: n.idx, to: r, kind: 'right' });
    }
    return out;
  }

  /** 环检测（有向图，三色法） */
  function detectCycle(nodes, edges) {
    const adj = {};
    nodes.forEach(n => { adj[n.idx] = []; });
    edges.forEach(e => { (adj[e.from] = adj[e.from] || []).push(e.to); });
    const color = {};
    let cyclic = false;
    const dfs = (u) => {
      if (cyclic) return;
      color[u] = 1;
      for (const v of (adj[u] || [])) {
        if (color[v] === 1) { cyclic = true; return; }
        if (!color[v]) dfs(v);
      }
      color[u] = 2;
    };
    nodes.forEach(n => { if (!color[n.idx]) dfs(n.idx); });
    return cyclic;
  }

  function finalize(g) {
    const adj = {};
    g.nodes.forEach(n => { adj[n.idx] = { in: 0, out: 0 }; });
    g.edges.forEach(e => {
      if (adj[e.from]) adj[e.from].out++;
      if (adj[e.to]) adj[e.to].in++;
    });
    g.nodes.forEach(n => { n.meta = Object.assign({}, n.meta, adj[n.idx] || { in: 0, out: 0 }); });
    const cyclic = detectCycle(g.nodes, g.edges);
    g.stats = {
      nodeCount: g.nodes.length,
      edgeCount: g.edges.length,
      cyclic,
      maxOut: g.nodes.reduce((m, n) => Math.max(m, n.meta.out || 0), 0),
      roots: g.nodes.filter(n => (n.meta.in || 0) === 0).map(n => n.idx).slice(0, 8),
    };
    g.meta = Object.assign({}, g.meta, { cyclic });
    return g;
  }

  /**
   * 邻接矩阵 → 图模型（顶点 + 边）
   * 之前只有"矩阵窗"，画不出"顶点 + 边"的图；这里把 m[i][j] != 0 变成 i→j 的边。
   * @param {object} arr vmodel.groupArrays 的二维数组项 {name, dims:[r,c], cells:[{i,j,value}]}
   * @returns {object|null} 统一图模型
   */
  function fromMatrix(arr) {
    if (!arr || !arr.twoD) return null;
    const rows = arr.dims[0] || 0, cols = arr.dims[1] || 0;
    const n = Math.max(rows, cols);
    const nodes = [];
    for (let i = 0; i < n; i++) {
      // 顶点值 = 该行非零元个数（度数），便于渲染器直接显示
      let deg = 0;
      for (let j = 0; j < cols; j++) {
        const c = (arr.cells || []).find(x => x.i === i && x.j === j);
        if (c && parseFloat(c.value) !== 0) deg++;
      }
      nodes.push({ idx: i, value: 'v' + i, meta: { idx: i, degree: deg } });
    }
    const edges = [];
    for (const c of (arr.cells || [])) {
      if (c.j == null) continue;
      const v = parseFloat(c.value);
      if (!v) continue;
      edges.push({ from: c.i, to: c.j, kind: 'adj', label: String(c.value) });
    }
    const g = { var: arr.name, shape: 'graph', nodes, edges, meta: { count: String(n), dims: (arr.dims || []).join('x'), source: 'matrix' } };
    return finalize(g);
  }

  /**
   * 双亲数组 → 森林模型（并查集 / 双亲表示法）
   * parent[i] == i（或 -1）为根，其余 i → parent[i] 连边。
   * @param {object} arr 一维数组项 {name, dims:[n], cells:[{i,value}]}
   */
  function fromParent(arr) {
    if (!arr || arr.twoD) return null;
    const cells = arr.cells || [];
    const n = arr.dims[0] || cells.length;
    if (!n) return null;
    const parent = new Array(n).fill(-1);
    for (const c of cells) if (c.i < n) parent[c.i] = parseInt(c.value, 10);
    const nodes = [], edges = [];
    for (let i = 0; i < n; i++) {
      nodes.push({ idx: i, value: String(isFinite(parent[i]) ? parent[i] : ''), meta: { idx: i, parent: parent[i] } });
      const p = parent[i];
      if (isFinite(p) && p >= 0 && p < n && p !== i) edges.push({ from: p, to: i, kind: 'parent' });
    }
    const g = { var: arr.name, shape: 'forest', nodes, edges, meta: { count: String(n), source: 'parent' } };
    return finalize(g);
  }

  /**
   * 从 N/E/M 事件流建图（V2 之后采集层就走这条路）
   * @param {Array} events 形如 ['N',var,idx,value] / ['E',var,from,to,kind,label] / ['M',var,'len=4']
   * @param {string} varName
   * @param {string} shapeHint
   */
  function fromEvents(events, varName, shapeHint) {
    const g = { var: varName, shape: shapeHint || 'list', nodes: [], edges: [], meta: {} };
    // 结点按 idx 去重，**后到的覆盖先到的**：外部传入的事件数组可能是多轮累积的，
    // 若保留首次出现（早期轮次），画面会永远停在最初的值。
    const byIdx = new Map();
    const edgeSeen = new Set();
    const metaByIdx = new Map();       // NM 事件可能先于或晚于 N 到达，先攒再并
    for (const e of (events || [])) {
      if (!e || e[1] !== varName) continue;
      switch (e[0]) {
        case 'N':
          byIdx.set(e[2], { idx: e[2], value: e[3] == null ? '' : String(e[3]), meta: {} });
          break;
        /* NM：结点语义属性（color / ltag）*/
        case 'NM': {
          const kv = String(e[3] || '');
          const i = kv.indexOf('=');
          if (i > 0) {
            const m = metaByIdx.get(e[2]) || {};
            m[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
            metaByIdx.set(e[2], m);
          }
          break;
        }
        case 'E':
        case 'NE': {
          // 同一条边只保留一份（防"事件数组多轮累积 → 边数爆炸"）
          const key = e[2] + '>' + e[3] + ':' + (e[4] || 'next');
          if (!edgeSeen.has(key)) {
            edgeSeen.add(key);
            g.edges.push({ from: e[2], to: e[3], kind: e[4] || 'next', label: e[5] || '' });
          }
          break;
        }
        case 'M': {
          const kv = String(e[2] || '').split(';');
          for (const pair of kv) {
            const i = pair.indexOf('=');
            if (i > 0) g.meta[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
          }
          break;
        }
        default: break;
      }
    }
    byIdx.forEach(n => g.nodes.push(n));
    byIdx.forEach(n => { const m = metaByIdx.get(n.idx); if (m) n.meta = Object.assign({}, n.meta, m); });
    g.nodes.sort((a, b) => a.idx - b.idx);
    return finalize(g);
  }

  /**
   * 兼容通道（V1 临时）：把 session 快照里的 lists[] 映射成 N/E/M 等价模型
   * —— 目的：后端还没发 N/E/M 时，先用它验证"图模型 + shape 分派"这条链正确。
   *   V2 后端接入 N/E/M 后，本函数退化为兜底。
   */
  function fromSnapshot(snapshot, varName, shapeHint) {
    // 首选：采集层直接产出的 N/NE/M（V2 起的正路）
    const A = snapshot && snapshot.nxm ? snapshot.nxm[varName] : null;
    if (A && A.length) return fromEvents(A, varName, shapeHint);
    const L = (snapshot && snapshot.lists) ? snapshot.lists[varName] : null;
    if (!L) return null;
    const shape = shapeHint || (L.shape === 'tree' ? 'tree' : 'list');
    const nodes = (L.nodes || []).map(n => ({
      idx: n.idx, value: n.key == null ? '' : String(n.key),
      meta: { ptr: n.ptr, more: n.more ? 1 : 0 },
    }));
    const edges = shape === 'tree' ? treeEdges(nodes) : chainEdges(nodes, 'next');
    const g = {
      var: varName, shape, nodes, edges,
      meta: { count: String(L.count != null ? L.count : nodes.length), total: String((L.nodes || []).length) },
    };
    return finalize(g);
  }

  /** 数组类：V 事件聚合 → seq 模型（N + M(len)） */
  function fromArray(arr, shapeHint) {
    if (!arr) return null;
    const g = {
      var: arr.name,
      shape: shapeHint || 'seq',
      nodes: (arr.cells || []).map(c => ({
        idx: c.j == null ? c.i : (c.i * 1000 + c.j),   // 二维用合成 idx（渲染器只用于排序）
        value: String(c.value),
        meta: { i: c.i, j: c.j, name: c.name },
      })),
      edges: [],
      meta: { len: String((arr.cells || []).length), dims: (arr.dims || []).join('x') },
    };
    return finalize(g);
  }

  /**
   * dsCatalog 模板 → shape（渲染器只认 shape，模板只影响 meta 角标）
   * 这里是"26 项 → 6 shape"的唯一登记点：新增结构只加一行。
   */
  function shapeFromCatalog(tplId) {
    const cat = AVC.dsCatalog;
    if (!cat) return null;
    const tpl = cat.byId(tplId) || (cat.PROTOS || []).find(x => x.id === tplId) || null;
    if (!tpl) return null;
    if (tpl.renderer === 'dsStack') return 'stack';
    if (tpl.renderer === 'dsHeap') return 'heap';
    if (tpl.renderer === 'arrayView') return 'seq';
    if (tpl.logical === 'graph') return 'graph';
    if (tpl.logical === 'tree') return 'tree';
    if (tpl.logical === 'set') return tpl.renderer === 'treeView' ? 'tree' : 'list';
    return 'list';
  }

  /** 供 UI 展示"为什么这么判" */
  function describe(g) {
    if (!g) return '';
    const s = g.stats;
    const bits = [s.nodeCount + ' 结点'];
    if (s.edgeCount) bits.push(s.edgeCount + ' 边');
    if (s.cyclic) bits.push('含环');
    if (s.maxOut > 2) bits.push('最大出度 ' + s.maxOut);
    return bits.join(' / ');
  }

  AVC.graph = {
    SHAPES, fromEvents, fromSnapshot, fromArray, fromMatrix, fromParent, finalize, describe,
    detectCycle, treeEdges, chainEdges, shapeFromCatalog,
  };
})(typeof window !== 'undefined' ? window : globalThis);
