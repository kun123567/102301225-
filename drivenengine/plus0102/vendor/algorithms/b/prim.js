/**
 * B · Prim 最小生成树（3 个代表性不同实现）
 *
 * 三个变体是三条真实的技术路线，不是改名换汤：
 *   v1 朴素距离数组 O(V²)：lowcost[] + u 集合，每轮**线性扫**一遍 lowcost 找最小值，
 *      n 轮 × n 次扫描 = O(V²)，代价花在"找最小"上，堆版本不需要这样扫；
 *   v2 小根堆优先队列：候选**跨边**进堆，堆顶就是当前最轻候选；另一端已入树的条目
 *      出堆时惰性丢弃（不是删堆内元素），堆内容 = 候选跨边表；
 *   v3 边表扫描版：不维护 lowcost，每轮**扫全部 m 条边**，只保留"恰好一端在树内"的跨边，
 *      两端同在树内的边被明确拒绝（会成环），总代价 O(V·E)。
 *
 * 契约（docs/04-轨迹契约.md）：每步完整快照、lineId 命中本变体 sourceLines、
 * 末步 done=true 且带 result；事件只用目录词表里的 init/select/relax/pick-edge/reject/
 * disconnected/done。
 */

import { trace, step, graphLayer, arrayLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'b/prim',
  variants: [
    { id: 'v1', name: '朴素距离数组 O(V²)' },
    { id: 'v2', name: '小根堆优先队列' },
    { id: 'v3', name: '边表扫描版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void prim_naive(MGraph *g, int s) {' },
    { lineId: 'init', text: '  for (v = 0; v < g->n; ++v) { lowcost[v] = INF; parent[v] = -1; in[v] = FALSE; }' },
    { lineId: 'mark-start', text: '  in[s] = TRUE;  lowcost[s] = 0;  count = 1;  sum = 0;' },
    { lineId: 'init-relax', text: '  for (w = 0; w < g->n; ++w) if (g->m[s][w] < INF) { lowcost[w] = g->m[s][w]; parent[w] = s; }' },
    { lineId: 'round', text: '  for (k = 1; k < g->n && count < g->n; ++k) {          /* 还要再收 n-1 个点 */' },
    { lineId: 'pick', text: '    best = INF; pos = -1;  for (v = 0; v < g->n; ++v) if (!in[v] && lowcost[v] < best) { best = lowcost[v]; pos = v; }   /* O(V²) 就在这里 */' },
    { lineId: 'no-edge', text: '    if (pos < 0) break;                                /* 全是 INF：再也吸不进点了 */' },
    { lineId: 'select', text: '    in[pos] = TRUE;  T = T ∪ {(parent[pos], pos)};  sum += best;  ++count;' },
    { lineId: 'relax', text: '    for (w = 0; w < g->n; ++w) if (!in[w] && g->m[pos][w] < lowcost[w]) { lowcost[w] = g->m[pos][w]; parent[w] = pos; }' },
    { lineId: 'reject', text: '    /* 反向：邻点已在 u 里 —— 那条边只会成环，lowcost 一律不动 */' },
    { lineId: 'ret', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void prim_heap(ALGraph *g, int s) {' },
    { lineId: 'init', text: '  InitHeap(&H);  for (v = 0; v < g->n; ++v) in[v] = FALSE;  count = 0;  sum = 0;' },
    { lineId: 'mark-start', text: '  in[s] = TRUE;  ++count;                              /* 起点先入树 */' },
    { lineId: 'push-start', text: '  for (p = g->vex[s].firstarc; p; p = p->next) HeapPush(&H, mk(p->adjvex, p->w, s));' },
    { lineId: 'while-h', text: '  while (!HeapEmpty(&H) && count < g->n) {' },
    { lineId: 'pop', text: '    e = HeapPop(&H);                                   /* 堆顶 = 当前最轻的候选跨边 */' },
    { lineId: 'lazy', text: '    if (in[e.to]) continue;                            /* 惰性删除：另一端早已入树，这条条目作废 */' },
    { lineId: 'select', text: '    in[e.to] = TRUE;  ++count;  sum += e.w;  T = T ∪ {(e.from, e.to)};' },
    { lineId: 'push-new', text: '    for (p = g->vex[e.to].firstarc; p; p = p->next) HeapPush(&H, mk(p->adjvex, p->w, e.to));' },
    { lineId: 'ret', text: '  }' },
  ],
  v3: [
    { lineId: 'fn', text: 'void prim_edgescan(EdgeSet *E, int n, int s) {' },
    { lineId: 'init', text: '  for (v = 0; v < n; ++v) in[v] = FALSE;  in[s] = TRUE;  count = 1;  sum = 0;' },
    { lineId: 'round', text: '  for (k = 1; k < n; ++k) {                          /* 每轮只收一个点 */' },
    { lineId: 'scan', text: '    /* 不维护 lowcost：直接扫全部 m 条边，只留"恰好一端在树内"的跨边 */' },
    { lineId: 'test', text: '    for (i = 0; i < E->m; ++i) { e = E->e[i]; if (in[e.from] == in[e.to]) continue; }' },
    { lineId: 'reject', text: '      /* 两端同在树内 → 加上必成环；两端同在树外 → 此刻还跨不过来，都不是候选 */' },
    { lineId: 'keep', text: '      if (e.w < best.w) best = e;                     /* 跨边里挑最轻的那条 */' },
    { lineId: 'pick', text: '    if (best == NONE) break;                          /* 一条跨边都没有 → 连通分量已穷尽 */' },
    { lineId: 'select', text: '    pos = in[best.from] ? best.to : best.from;  in[pos] = TRUE;  T = T ∪ {best};  sum += best.w;  ++count;' },
    { lineId: 'ret', text: '  }' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

const NODES = (ids) => ids.map((id) => ({ id, label: id }));
const WEDGES = (triples) => triples.map(([from, to, w]) => ({ from, to, w }));

// 任务单主样例：AB=1、BC=2、AC=4 → 取 AB、BC，权重 3（AC 是圈里最重的，不进树）
const G_NORMAL = {
  directed: false,
  nodes: NODES(['A', 'B', 'C']),
  edges: WEDGES([['A', 'B', 1], ['B', 'C', 2], ['A', 'C', 4]]),
};
// 边界：再加一个完全孤立的 D → 只能得到 A 所在分量的生成树
const G_DISCONNECTED = {
  directed: false,
  nodes: NODES(['A', 'B', 'C', 'D']),
  edges: WEDGES([['A', 'B', 1], ['B', 'C', 2], ['A', 'C', 4]]),
};
// 边界：单点图，无边可挑
const G_SINGLE = { directed: false, nodes: NODES(['A']), edges: [] };

export const samples = [
  {
    id: 'normal',
    label: 'AB=1, BC=2, AC=4，从 A 出发（期望 AB、BC，权重 3）',
    input: { graph: G_NORMAL, start: 'A' },
    expect: { edges: [['A', 'B'], ['B', 'C']], weight: 3, disconnected: false, vertices: ['A', 'B', 'C'] },
  },
  {
    id: 'edge-disconnected',
    label: '同图 + 孤立点 D（期望 disconnected=true，D 进不了树）',
    input: { graph: G_DISCONNECTED, start: 'A' },
    expect: {
      edges: [['A', 'B'], ['B', 'C']],
      weight: 3,
      disconnected: true,
      vertices: ['A', 'B', 'C'],
      unreached: ['D'],
    },
  },
  {
    id: 'edge-single',
    label: '单点图（只有 A，无边，期望 0 条树边、权重 0）',
    input: { graph: G_SINGLE, start: 'A' },
    expect: { edges: [], weight: 0, disconnected: false, vertices: ['A'], unreached: [] },
  },
];

/* ------------------------------------------------------------------ 输入归一 */

const str = (v) => String(v);

function normalizeGraph(input) {
  const raw = (input && input.graph) || {};
  const rawNodes = raw.nodes || [];
  // 同名顶点加 a/b 后缀：不能靠颜色区分两个 label 相同的点
  const shown = labelsOf(rawNodes.map((nd) => str(nd.label ?? nd.id)));
  const nodes = rawNodes.map((nd, i) => ({ id: str(nd.id), label: shown[i] }));
  const known = new Set(nodes.map((nd) => nd.id));
  const edges = [];
  for (const e of raw.edges || []) {
    const from = str(e.from);
    const to = str(e.to);
    if (!known.has(from) || !known.has(to)) continue;   // 指向不存在顶点的边忽略
    if (from === to) continue;                          // 自环对生成树无意义
    const w = Number.isFinite(Number(e.w)) ? Number(e.w) : 1;
    edges.push({ from, to, w });
  }
  return { directed: !!raw.directed, nodes, edges };
}

function indexOf(g) {
  const m = new Map();
  g.nodes.forEach((nd, i) => m.set(nd.id, i));
  return m;
}

function resolveStart(input, g, idx) {
  const wanted = input && input.start != null ? str(input.start) : g.nodes[0] ? g.nodes[0].id : null;
  return { startId: wanted, startIdx: wanted != null && idx.has(wanted) ? idx.get(wanted) : -1 };
}

function graphPanel(g, o = {}) {
  return graphLayer({
    id: 'graph',
    title: o.title || '图',
    name: o.name || '',
    layout: 'circle',
    directed: g.directed,
    weighted: true,
    nodes: g.nodes.map((nd, i) => ({
      id: nd.id,
      label: nd.label,
      sub: o.subOf ? o.subOf(i) : undefined,
      badge: o.badgeOf ? o.badgeOf(i) : undefined,
    })),
    edges: g.edges.map((e, i) => ({
      from: e.from,
      to: e.to,
      w: e.w,
      state: (o.edgeStates && o.edgeStates[i]) || 'idle',
      directed: g.directed,
    })),
    roles: o.roles || {},
  });
}

/** 无向邻接表（每条邻边带原边下标，便于给图上色） */
function adjacencyOf(g, idx) {
  const adj = g.nodes.map(() => []);
  g.edges.forEach((e, ei) => {
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    adj[a].push({ v: b, w: e.w, ei });
    if (!g.directed) adj[b].push({ v: a, w: e.w, ei });
  });
  adj.forEach((list) => list.sort((x, y) => (x.v - y.v) || (x.w - y.w)));
  return adj;
}

function makeHeap() {
  const a = [];
  const less = (x, y) => x.w < y.w || (x.w === y.w && x.ei < y.ei);
  const swap = (i, j) => { const t = a[i]; a[i] = a[j]; a[j] = t; };
  const up = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (!less(a[i], a[p])) break; swap(i, p); i = p; } };
  const down = (i) => {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < a.length && less(a[l], a[m])) m = l;
      if (r < a.length && less(a[r], a[m])) m = r;
      if (m === i) break;
      swap(i, m);
      i = m;
    }
  };
  return {
    a,
    push(item) { a.push(item); up(a.length - 1); },
    pop() { const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; down(0); } return top; },
    peek: () => a[0],
  };
}

/* ------------------------------------------------------------------ 变体 1（朴素距离数组 O(V²)） */

function runV1(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const idx = indexOf(g);
  const { startId, startIdx } = resolveStart(input, g, idx);
  const adj = adjacencyOf(g, idx);
  const L = LINES.v1;

  const inTree = new Array(n).fill(false);
  const low = new Array(n).fill(Infinity);
  const parent = new Array(n).fill(-1);
  const pEdge = new Array(n).fill(-1);
  const tag = new Array(n).fill(null);
  const treeEdges = [];      // {ei, pair}
  const treeSet = new Set();
  let sum = 0;
  let count = 0;
  const steps = [];

  const treeIdx = () => {
    const out = [];
    for (let i = 0; i < n; i++) if (inTree[i]) out.push(i);
    return out;
  };
  const treeIds = () => treeIdx().map((i) => g.nodes[i].id);
  const pendIdx = (pick) => {
    const out = [];
    for (let i = 0; i < n; i++) if (!inTree[i] && (pick === 'far' ? low[i] === Infinity : low[i] !== Infinity)) out.push(i);
    return out;
  };
  const edgeStates = (override = {}) => {
    const st = g.edges.map(() => 'idle');
    for (const ei of treeSet) st[ei] = 'tree';
    for (let v = 0; v < n; v++) {
      if (!inTree[v] && pEdge[v] >= 0 && st[pEdge[v]] === 'idle') st[pEdge[v]] = 'candidate';
    }
    for (const k of Object.keys(override)) st[Number(k)] = override[k];
    return st;
  };
  const lowPanel = (o = {}) => arrayLayer({
    id: 'lowcost',
    title: o.title || 'lowcost[]（树外点到 u 的最小边权）',
    name: 'int lowcost[n]',
    values: low.map((v) => (v === Infinity ? '∞' : v)),
    labels: g.nodes.map((nd) => nd.label),
    roles: o.roles || {},
  });
  const layers = (o = {}) => [
    graphPanel(g, {
      title: o.title || `图（${g.directed ? '有向' : '无向'} · 邻接矩阵）`,
      name: 'MGraph',
      roles: o.roles || {},
      edgeStates: edgeStates(o.override || {}),
      subOf: (i) => (inTree[i] ? '∈u' : low[i] === Infinity ? '∞' : `${low[i]}`),
      badgeOf: (i) => tag[i] || undefined,
    }),
    lowPanel({ roles: o.lowRoles || {} }),
  ];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '图为空：0 个顶点，没有可选的边，Prim 无事可做。'
      : `共 ${n} 个顶点、${g.edges.length} 条边。Prim 只维护一个已选点集 u 和一张 lowcost[]：lowcost[v] 记录"树外点 v 到 u 的最轻边权"，每轮把最小的那个点吸进来。`,
    vars: { start: startId ?? '—', n, edges: g.edges.length, 已选: 0, weight: 0 },
    layers: layers({ roles: startIdx >= 0 ? { focus1: [g.nodes[startIdx].id] } : {} }),
  }));

  if (n === 0 || startIdx < 0) {
    const result = {
      edges: [], weight: 0, vertices: [], disconnected: n > 0,
      unreached: g.nodes.map((nd) => nd.id),
    };
    steps.push(step({
      event: 'done', lineId: 'ret', done: true, result,
      note: n === 0 ? '空图：直接结束，树是空的。' : `起点 ${startId} 不在顶点集合里，连"把 s 放进 u"都做不到，直接结束。`,
      vars: { start: startId ?? '—', n, 已选: 0, weight: 0 },
      layers: layers(),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'prim-naive-v1', lines: L, steps, result });
  }

  inTree[startIdx] = true;
  count = 1;
  low[startIdx] = 0;
  tag[startIdx] = 'u';
  steps.push(step({
    event: 'init', lineId: 'mark-start',
    note: `起点 ${startId} 先进入 u。其它点的 lowcost 仍是 ∞——它们此刻"不可达"，要靠一次松弛才知道从树里走过去有多贵。`,
    vars: { start: startId, n, 已选: count, weight: sum, 树内: treeIds().join('、') },
    layers: layers({ roles: { done: treeIds() } }),
  }));

  if (adj[startIdx].length === 0) {
    steps.push(step({
      event: 'relax', lineId: 'init-relax',
      note: `起点 ${startId} 一条邻边都没有：lowcost 全停在 ∞。下一轮扫描找不到任何可选点，Prim 只能收下 ${startId} 一个点。`,
      vars: { start: startId, n, 已选: count, weight: sum, 树内: treeIds().join('、') },
      layers: layers({ roles: { done: treeIds() }, lowRoles: { done: [startIdx] } }),
    }));
  } else {
    for (const { v, w, ei } of adj[startIdx]) {
      low[v] = w;
      parent[v] = startIdx;
      pEdge[v] = ei;
      const vId = g.nodes[v].id;
      steps.push(step({
        event: 'relax', lineId: 'init-relax',
        note: `松弛 ${vId}：从树里到它只有边 ${startId}-${vId}（w=${w}）这一条路，于是 lowcost[${vId}] = ${w}、parent[${vId}] = ${startId}。这条边现在是候选跨边。`,
        vars: { start: startId, n, 已选: count, weight: sum, 松弛: `${vId}←${w}` },
        layers: layers({ roles: { done: treeIds(), focus1: [vId] } }),
      }));
    }
  }

  for (let k = 1; k < n && count < n; k++) {
    let best = Infinity;
    let pos = -1;
    for (let v = 0; v < n; v++) if (!inTree[v] && low[v] < best) { best = low[v]; pos = v; }
    if (pos < 0) break;

    const posId = g.nodes[pos].id;
    const parId = parent[pos] >= 0 ? g.nodes[parent[pos]].id : null;
    const candText = pendIdx().map((v) => `${g.nodes[v].id}:${low[v]}`).join('、');
    const eiPick = pEdge[pos];

    steps.push(step({
      event: 'pick-edge', lineId: 'pick',
      note: `第 ${k} 轮：线性扫 lowcost[]，树外候选是 ${candText || '（无）'}，最小的是 ${posId}（${best}），对应边 ${parId}-${posId}。O(V²) 的代价就出在这里——每轮都要把 n 个格子重扫一遍，而堆只需要看堆顶。`,
      vars: { start: startId, n, 轮次: k, 已选: count, pos: posId, lowcost: best, weight: sum, 树内: treeIds().join('、') },
      layers: layers({
        roles: { done: treeIds(), focus1: [parId], focus2: [posId] },
        lowRoles: { done: treeIdx(), focus1: [pos], pointers: [{ id: 'pos', label: 'pos', index: pos }], excluded: pendIdx('far') },
        override: eiPick >= 0 ? { [eiPick]: 'active' } : {},
      }),
    }));

    inTree[pos] = true;
    count++;
    sum += best;
    treeEdges.push({ ei: eiPick, pair: [parId, posId] });
    if (eiPick >= 0) treeSet.add(eiPick);
    tag[pos] = `+${best}`;

    steps.push(step({
      event: 'select', lineId: 'select',
      note: `把 ${posId} 并入 u，边 ${parId}-${posId}（w=${best}）成为第 ${treeEdges.length} 条树边，累计权重 ${sum}。加的是"跨边里最轻的一条"，所以之后不可能再有更便宜的方式把 ${posId} 接进树——这就是 Prim 的正确性来源。`,
      vars: { start: startId, n, 轮次: k, 已选: count, 新入: posId, weight: sum, 树边: treeEdges.map((t) => t.pair.join('')).join('、') },
      layers: layers({
        roles: { done: treeIds(), added: [posId] },
        lowRoles: { done: treeIdx(), pointers: [{ id: 'pos', label: 'pos', index: pos }], excluded: pendIdx('far') },
      }),
    }));

    for (const { v, w, ei } of adj[pos]) {
      const vId = g.nodes[v].id;
      if (inTree[v]) {
        if (treeSet.has(ei)) continue;      // 就是刚走的那条树边，不必再讲
        steps.push(step({
          event: 'reject', lineId: 'reject',
          note: `边 ${posId}-${vId}（w=${w}）的另一端 ${vId} 已经在 u 里：把它加进来只会成环，所以 lowcost 不动、parent 不改。Prim 从不回头看已入树的点。`,
          vars: { start: startId, n, 已选: count, weight: sum, 拒绝: `${posId}-${vId}` },
          layers: layers({
            roles: { done: treeIds(), focus1: [posId], focus2: [vId] },
            lowRoles: { done: treeIdx(), excluded: pendIdx('far') },
            override: { [ei]: 'reject' },
          }),
        }));
        continue;
      }
      const old = low[v];
      const better = w < old;
      if (better) {
        low[v] = w;
        parent[v] = pos;
        pEdge[v] = ei;
      }
      steps.push(step({
        event: 'relax', lineId: 'relax',
        note: better
          ? `松弛 ${vId}：新边 ${posId}-${vId}（w=${w}）比旧值 ${old === Infinity ? '∞' : old} 更轻，lowcost 改记 ${w}，parent 改指 ${posId}——以后要接 ${vId} 就从这个更便宜的入口走。`
          : `松弛 ${vId}：边 ${posId}-${vId}（w=${w}）不比旧值 ${old} 更轻，lowcost 保持 ${old}。已经有更便宜的入口了，这条边进不了候选表。`,
        vars: { start: startId, n, 已选: count, weight: sum, 松弛: `${vId}: ${old === Infinity ? '∞' : old} → ${low[v]}`, 更轻: better ? '是' : '否' },
        layers: layers({
          roles: { done: treeIds(), focus1: [posId], focus2: [vId] },
          lowRoles: { done: treeIdx(), focus1: [v], pointers: [{ id: 'w', label: 'w', index: v }], excluded: pendIdx('far') },
        }),
      }));
    }
  }

  const unreached = g.nodes.filter((_, i) => !inTree[i]).map((nd) => nd.id);
  if (count < n) {
    steps.push(step({
      event: 'disconnected', lineId: 'no-edge',
      note: `lowcost 里 ${unreached.join('、')} 全是 ∞：从 ${startId} 出发怎么走都到不了它们，扫描结果 pos = -1 → break。Prim 只能交出 ${startId} 所在分量的生成树。`,
      vars: { start: startId, n, 已选: count, weight: sum, 未到达: unreached.join('、') },
      layers: layers({
        roles: { done: treeIds(), excluded: unreached },
        lowRoles: { done: treeIdx(), excluded: pendIdx('far') },
      }),
    }));
  }

  const result = {
    edges: treeEdges.map((t) => t.pair.slice()),
    weight: sum,
    vertices: treeIds(),
    disconnected: count < n,
    unreached,
  };
  steps.push(step({
    event: 'done', lineId: 'ret', done: true, result,
    note: count === n
      ? `u 覆盖了全部 ${n} 个顶点，Prim 结束：${result.edges.length} 条树边、累计权重 ${sum}。`
      : `u 只覆盖 ${count}/${n} 个顶点，Prim 结束：得到 ${result.edges.length} 条边的最小生成森林（权重 ${sum}），${unreached.join('、')} 不在其中。`,
    vars: { start: startId, n, 已选: count, weight: sum, 树边: result.edges.map((p) => p.join('')).join('、') || '（无）', 未到达: unreached.join('、') || '—' },
    layers: layers({ roles: { done: treeIds(), excluded: unreached }, lowRoles: { done: treeIdx(), excluded: pendIdx('far') } }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'prim-naive-v1', lines: L, steps, result });
}

/* ------------------------------------------------------------------ 变体 2（小根堆优先队列） */

function runV2(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const idx = indexOf(g);
  const { startId, startIdx } = resolveStart(input, g, idx);
  const adj = adjacencyOf(g, idx);
  const L = LINES.v2;

  const inTree = new Array(n).fill(false);
  const tag = new Array(n).fill(null);
  const treeEdges = [];      // {ei, pair}
  const treeSet = new Set();
  const H = makeHeap();
  let sum = 0;
  let count = 0;
  const steps = [];

  const treeIds = () => g.nodes.filter((_, i) => inTree[i]).map((nd) => nd.id);
  const heapText = () => (H.a.length ? H.a.map((it) => `${it.from}-${it.to}:${it.w}`).join('、') : '（空）');
  const edgeStates = (override = {}) => {
    const st = g.edges.map(() => 'idle');
    for (const ei of treeSet) st[ei] = 'tree';
    for (const it of H.a) if (st[it.ei] === 'idle') st[it.ei] = 'candidate';
    for (const k of Object.keys(override)) st[Number(k)] = override[k];
    return st;
  };
  const heapPanel = (o = {}) => arrayLayer({
    id: 'heap',
    title: o.title || '小根堆（堆顶 = 最轻的候选跨边）',
    name: 'Heap H',
    values: H.a.map((it) => it.w),
    labels: H.a.map((it) => `${it.from}-${it.to}`),
    roles: o.roles || {},
  });
  const layers = (o = {}) => [
    graphPanel(g, {
      title: o.title || `图（${g.directed ? '有向' : '无向'} · 邻接表）`,
      name: 'ALGraph',
      roles: o.roles || {},
      edgeStates: edgeStates(o.override || {}),
      subOf: (i) => (inTree[i] ? '∈u' : H.a.some((it) => it.to === i) ? '堆中' : '—'),
      badgeOf: (i) => tag[i],
    }),
    heapPanel({ roles: o.heapRoles || {} }),
  ];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '图为空：堆里永远没有东西，直接结束。'
      : `共 ${n} 个顶点、${g.edges.length} 条边。堆版本不再维护 lowcost[]，而是把"候选跨边"本身压进小根堆：堆顶就是离 u 最近的那条边。`,
    vars: { start: startId ?? '—', n, edges: g.edges.length, 已选: 0, weight: 0, 堆: '（空）' },
    layers: layers({ roles: startIdx >= 0 ? { focus1: [g.nodes[startIdx].id] } : {} }),
  }));

  if (n === 0 || startIdx < 0) {
    const result = {
      edges: [], weight: 0, vertices: [], disconnected: n > 0,
      unreached: g.nodes.map((nd) => nd.id),
    };
    steps.push(step({
      event: 'done', lineId: 'ret', done: true, result,
      note: n === 0 ? '空图：直接结束，堆始终是空的。' : `起点 ${startId} 不在顶点集合里：连起点都放不进树，直接结束。`,
      vars: { start: startId ?? '—', n, 已选: 0, weight: 0 },
      layers: layers(),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'prim-heap-v1', lines: L, steps, result });
  }

  inTree[startIdx] = true;
  count = 1;
  tag[startIdx] = 'u';
  steps.push(step({
    event: 'init', lineId: 'mark-start',
    note: `起点 ${startId} 入树。堆版本和朴素版的第一个差别：树外点的"距离"不用数组存，只体现为堆里有没有一条指向它的边。`,
    vars: { start: startId, n, 已选: count, weight: sum, 堆: '（空）' },
    layers: layers({ roles: { done: treeIds() } }),
  }));

  for (const { v, w, ei } of adj[startIdx]) {
    H.push({ to: v, from: startIdx, w, ei });
  }
  steps.push(step({
    event: 'relax', lineId: 'push-start',
    note: adj[startIdx].length
      ? `把 ${startId} 的所有出边压成候选：${adj[startIdx].length} 条一组进堆，堆自动按权重排好，最轻的在堆顶。`
      : `起点 ${startId} 没有邻边：堆仍然是空的，while 循环一次都不会进。`,
    vars: { start: startId, n, 已选: count, weight: sum, 堆: heapText(), 堆大小: H.a.length },
    layers: layers({ roles: { done: treeIds() }, heapRoles: H.a.length ? { focus1: [0], pointers: [{ id: 'top', label: '堆顶', index: 0 }] } : {} }),
  }));

  while (H.a.length && count < n) {
    const top = H.peek();
    const topFrom = g.nodes[top.from].id;
    const topTo = g.nodes[top.to].id;
    const popped = H.pop();
    const lazy = inTree[popped.to];

    steps.push(step({
      event: 'pick-edge', lineId: 'pop',
      note: `弹出堆顶 ${topFrom}-${topTo}（w=${popped.w}）：堆里所有候选边都是"从树内伸到当时树外"的边，所以堆顶就是这一轮最轻的跨边候选。`,
      vars: { start: startId, n, 已选: count, weight: sum, 弹出: `${topFrom}-${topTo}:${popped.w}`, 堆: heapText() },
      layers: layers({
        roles: { done: treeIds(), focus1: [topFrom], focus2: [topTo] },
        heapRoles: H.a.length ? { focus1: [0], pointers: [{ id: 'top', label: '堆顶', index: 0 }] } : {},
        override: { [popped.ei]: 'active' },
      }),
    }));

    if (lazy) {
      steps.push(step({
        event: 'reject', lineId: 'lazy',
        note: `堆顶的另一端 ${topTo} 早在更早的轮次就入树了，这条边现在只会成环。堆不支持删中间元素，所以不删——出堆时发现端点在树内就丢掉，这叫惰性删除。堆里因此会积压一批废弃条目。`,
        vars: { start: startId, n, 已选: count, weight: sum, 作废: `${topFrom}-${topTo}`, 堆: heapText() },
        layers: layers({
          roles: { done: treeIds(), focus2: [topTo] },
          heapRoles: H.a.length ? { pointers: [{ id: 'top', label: '堆顶', index: 0 }] } : {},
          override: { [popped.ei]: 'reject' },
        }),
      }));
      continue;
    }

    inTree[popped.to] = true;
    count++;
    sum += popped.w;
    treeEdges.push({ ei: popped.ei, pair: [topFrom, topTo] });
    treeSet.add(popped.ei);
    tag[popped.to] = `+${popped.w}`;

    steps.push(step({
      event: 'select', lineId: 'select',
      note: `${topTo} 不在树内 → 收下它，边 ${topFrom}-${topTo}（w=${popped.w}）成为第 ${treeEdges.length} 条树边，累计权重 ${sum}。`,
      vars: { start: startId, n, 已选: count, 新入: topTo, weight: sum, 树边: treeEdges.map((t) => t.pair.join('')).join('、') },
      layers: layers({
        roles: { done: treeIds(), added: [topTo] },
        heapRoles: H.a.length ? { pointers: [{ id: 'top', label: '堆顶', index: 0 }] } : {},
      }),
    }));

    const fresh = adj[popped.to].filter(({ v }) => !inTree[v]);
    for (const { v, w, ei } of fresh) H.push({ to: v, from: popped.to, w, ei });
    steps.push(step({
      event: 'relax', lineId: 'push-new',
      note: fresh.length
        ? `${topTo} 的 ${fresh.length} 条出边里，${fresh.map(({ v, w }) => `${g.nodes[v].id}(${w})`).join('、')} 通向树外，全部入堆成为新候选。堆里变重不了：它只增不减，废弃条目留给惰性删除处理。`
        : `${topTo} 的邻点都已入树，没有新候选入堆。堆只会越来越小，接下来靠惰性删除排空。`,
      vars: { start: startId, n, 已选: count, weight: sum, 堆大小: H.a.length, 堆: heapText() },
      layers: layers({
        roles: { done: treeIds(), focus1: [topTo] },
        heapRoles: H.a.length ? { focus1: [0], pointers: [{ id: 'top', label: '堆顶', index: 0 }] } : {},
      }),
    }));
  }

  const unreached = g.nodes.filter((_, i) => !inTree[i]).map((nd) => nd.id);
  if (count < n) {
    steps.push(step({
      event: 'disconnected', lineId: 'ret',
      note: `堆空了但只收下 ${count}/${n} 个顶点：${unreached.join('、')} 从来没有被任何候选边指向过，堆里自然没有它们的条目 → 循环退出。`,
      vars: { start: startId, n, 已选: count, weight: sum, 未到达: unreached.join('、') },
      layers: layers({ roles: { done: treeIds(), excluded: unreached } }),
    }));
  }

  const result = {
    edges: treeEdges.map((t) => t.pair.slice()),
    weight: sum,
    vertices: treeIds(),
    disconnected: count < n,
    unreached,
  };
  steps.push(step({
    event: 'done', lineId: 'ret', done: true, result,
    note: count === n
      ? `堆空且 u 覆盖全部 ${n} 个顶点，Prim 结束：${result.edges.length} 条树边、累计权重 ${sum}。全程只看了 ${g.edges.length * 2} 条边的条目，没有做过一次"全表扫最小"。`
      : `堆空、只覆盖 ${count}/${n} 个顶点：得到 ${result.edges.length} 条边的最小生成森林（权重 ${sum}），${unreached.join('、')} 不在其中。`,
    vars: { start: startId, n, 已选: count, weight: sum, 树边: result.edges.map((p) => p.join('')).join('、') || '（无）', 未到达: unreached.join('、') || '—' },
    layers: layers({ roles: { done: treeIds(), excluded: unreached } }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'prim-heap-v1', lines: L, steps, result });
}

/* ------------------------------------------------------------------ 变体 3（边表扫描版） */

function runV3(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const idx = indexOf(g);
  const { startId, startIdx } = resolveStart(input, g, idx);
  const L = LINES.v3;

  const ends = g.edges.map((e) => [idx.get(e.from), idx.get(e.to)]);
  const inTree = new Array(n).fill(false);
  const tag = new Array(n).fill(null);
  const treeEdges = [];      // {ei, pair, w}
  const treeSet = new Set();
  let sum = 0;
  let count = 0;
  let scans = 0;
  const steps = [];

  const treeIds = () => g.nodes.filter((_, i) => inTree[i]).map((nd) => nd.id);
  const crossings = () => g.edges
    .map((e, ei) => ({ e, ei }))
    .filter(({ ei }) => !treeSet.has(ei) && inTree[ends[ei][0]] !== inTree[ends[ei][1]]);
  const cycleEdges = () => g.edges
    .map((e, ei) => ({ e, ei }))
    .filter(({ ei }) => !treeSet.has(ei) && inTree[ends[ei][0]] && inTree[ends[ei][1]]);
  const outsideEdges = () => g.edges
    .map((e, ei) => ({ e, ei }))
    .filter(({ ei }) => !inTree[ends[ei][0]] && !inTree[ends[ei][1]]);
  const edgeStates = (override = {}) => {
    const st = g.edges.map(() => 'idle');
    for (const ei of treeSet) st[ei] = 'tree';
    g.edges.forEach((e, ei) => {
      if (treeSet.has(ei)) return;
      if (inTree[ends[ei][0]] && inTree[ends[ei][1]]) st[ei] = 'reject';
      else if (inTree[ends[ei][0]] !== inTree[ends[ei][1]]) st[ei] = 'candidate';
    });
    for (const k of Object.keys(override)) st[Number(k)] = override[k];
    return st;
  };
  const allIdx = g.edges.map((_, i) => i);
  const edgePanel = (o = {}) => arrayLayer({
    id: 'edges',
    title: o.title || '边表（每轮整表扫一遍）',
    name: 'Edge e[m]',
    values: g.edges.map((e) => e.w),
    labels: g.edges.map((e) => `${e.from}-${e.to}`),
    roles: o.roles || {},
  });
  const layers = (o = {}) => [
    graphPanel(g, {
      title: o.title || `图（${g.directed ? '有向' : '无向'} · 边表）`,
      name: 'EdgeSet',
      roles: o.roles || {},
      edgeStates: edgeStates(o.override || {}),
      subOf: (i) => (inTree[i] ? '∈u' : '树外'),
      badgeOf: (i) => tag[i],
    }),
    edgePanel({ roles: o.edgeRoles || {} }),
  ];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '图为空：边表是空的，没有一条边可扫。'
      : `共 ${n} 个顶点、${g.edges.length} 条边。这个变体连 lowcost 都不维护：每轮把整张边表扫一遍，只留下"恰好一端在树内"的跨边，从中挑最轻的。`,
    vars: { start: startId ?? '—', n, edges: g.edges.length, 已选: 0, weight: 0, scans: 0 },
    layers: layers({ roles: startIdx >= 0 ? { focus1: [g.nodes[startIdx].id] } : {} }),
  }));

  if (n === 0 || startIdx < 0) {
    const result = {
      edges: [], weight: 0, vertices: [], disconnected: n > 0,
      unreached: g.nodes.map((nd) => nd.id),
    };
    steps.push(step({
      event: 'done', lineId: 'ret', done: true, result,
      note: n === 0 ? '空图：直接结束，一次扫描也没发生。' : `起点 ${startId} 不在顶点集合里，直接结束。`,
      vars: { start: startId ?? '—', n, 已选: 0, weight: 0, scans: 0 },
      layers: layers(),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'prim-edgescan-v1', lines: L, steps, result });
  }

  inTree[startIdx] = true;
  count = 1;
  tag[startIdx] = 'u';

  for (let k = 1; k < n && count < n; k++) {
    const crossBefore = crossings();
    scans += g.edges.length;

    steps.push(step({
      event: 'pick-edge', lineId: 'scan',
      note: `第 ${k} 轮：u = { ${treeIds().join('、')} }。开扫边表全部 ${g.edges.length} 条边，只有"一端在树内、一端在树外"的边才跨得过去；另外两类都不算候选。`,
      vars: { start: startId, n, 轮次: k, 已选: count, weight: sum, 跨边数: crossBefore.length, scans },
      layers: layers({
        roles: { done: treeIds() },
        edgeRoles: { done: allIdx.filter((ei) => treeSet.has(ei)) },
      }),
    }));

    // 两端都在树内的边：会被明确"拒绝"——这是边表版唯一能看清拒绝成因的地方
    const cyc = cycleEdges();
    for (const { e, ei } of cyc) {
      steps.push(step({
        event: 'reject', lineId: 'reject',
        note: `边 ${e.from}-${e.to}（w=${e.w}）：两端都已在树内，加进来立刻成环 → 拒绝。朴素版根本不会看到这类边（它在 lowcost 里查不到），边表版每轮都要为它们付扫描费。`,
        vars: { start: startId, n, 已选: count, weight: sum, 拒绝: `${e.from}-${e.to}`, scans },
        layers: layers({
          roles: { done: treeIds(), focus1: [e.from], focus2: [e.to] },
          edgeRoles: { done: allIdx.filter((x) => treeSet.has(x)), excluded: [ei], focus1: [ei] },
          override: { [ei]: 'reject' },
        }),
      }));
    }

    const outCnt = outsideEdges().length;
    if (outCnt) {
      steps.push(step({
        event: 'reject', lineId: 'test',
        note: `还有 ${outCnt} 条边的两端都在树外（${outsideEdges().map(({ e }) => `${e.from}-${e.to}`).join('、')}）：它们此刻既不跨边也无害，本轮跳过。之所以要记下来，是因为它们可能在后面变成跨边。`,
        vars: { start: startId, n, 已选: count, weight: sum, 树外边: outCnt, scans },
        layers: layers({
          roles: { done: treeIds() },
          edgeRoles: { done: allIdx.filter((x) => treeSet.has(x)), excluded: outsideEdges().map(({ ei }) => ei) },
        }),
      }));
    }

    if (!crossBefore.length) {
      steps.push(step({
        event: 'disconnected', lineId: 'pick',
        note: `整张边表扫完，跨边数为 0：树已经把这个连通分量吃干了，剩下的顶点和它们之间根本没有边 → break。`,
        vars: { start: startId, n, 已选: count, weight: sum, scans, 未到达: g.nodes.filter((_, i) => !inTree[i]).map((nd) => nd.id).join('、') },
        layers: layers({ roles: { done: treeIds() }, edgeRoles: { done: allIdx.filter((x) => treeSet.has(x)) } }),
      }));
      break;
    }

    let best = crossBefore[0];
    for (const it of crossBefore) if (it.e.w < best.e.w || (it.e.w === best.e.w && it.ei < best.ei)) best = it;
    const bestEi = best.ei;
    const posIdx = inTree[ends[bestEi][0]] ? ends[bestEi][1] : ends[bestEi][0];
    const posId = g.nodes[posIdx].id;
    const treeSideId = g.nodes[inTree[ends[bestEi][0]] ? ends[bestEi][0] : ends[bestEi][1]].id;

    steps.push(step({
      event: 'pick-edge', lineId: 'pick',
      note: `跨边共 ${crossBefore.length} 条（${crossBefore.map(({ e }) => `${e.from}-${e.to}:${e.w}`).join('、')}），最轻的是 ${best.e.from}-${best.e.to}（w=${best.e.w}）。注意：为了找出它，刚才把整张表 ${g.edges.length} 条边都过了一遍，非跨边白扫。`,
      vars: { start: startId, n, 已选: count, weight: sum, 本轮: `${best.e.from}-${best.e.to}`, 权重: best.e.w, scans },
      layers: layers({
        roles: { done: treeIds(), focus1: [treeSideId], focus2: [posId] },
        edgeRoles: { done: allIdx.filter((x) => treeSet.has(x)), focus1: [bestEi], pointers: [{ id: 'i', label: 'i', index: bestEi }] },
        override: { [bestEi]: 'active' },
      }),
    }));

    inTree[posIdx] = true;
    count++;
    sum += best.e.w;
    treeEdges.push({ ei: bestEi, pair: [treeSideId, posId], w: best.e.w });
    treeSet.add(bestEi);
    tag[posIdx] = `+${best.e.w}`;

    steps.push(step({
      event: 'select', lineId: 'select',
      note: `跨边的轻端在树内（${treeSideId}），所以把另一端 ${posId} 收进 u；边 ${best.e.from}-${best.e.to}（w=${best.e.w}）成为第 ${treeEdges.length} 条树边，累计权重 ${sum}。`,
      vars: { start: startId, n, 已选: count, 新入: posId, weight: sum, 树边: treeEdges.map((t) => t.pair.join('')).join('、'), scans },
      layers: layers({
        roles: { done: treeIds(), added: [posId] },
        edgeRoles: { done: allIdx.filter((x) => treeSet.has(x)), pointers: [{ id: 'i', label: 'i', index: bestEi }] },
      }),
    }));
  }

  const unreached = g.nodes.filter((_, i) => !inTree[i]).map((nd) => nd.id);
  const result = {
    edges: treeEdges.map((t) => t.pair.slice()),
    weight: sum,
    vertices: treeIds(),
    disconnected: count < n,
    unreached,
  };
  steps.push(step({
    event: 'done', lineId: 'ret', done: true, result,
    note: count === n
      ? `u 覆盖全部 ${n} 个顶点，Prim 结束：${result.edges.length} 条树边、累计权重 ${sum}。整场扫了 ${scans} 条边的条目（≈ 轮数 × m），明显比朴素版的全表扫描贵。`
      : `u 只覆盖 ${count}/${n} 个顶点：得到 ${result.edges.length} 条边的最小生成森林（权重 ${sum}），${unreached.join('、')} 不在其中。整场扫了 ${scans} 条边的条目。`,
    vars: { start: startId, n, 已选: count, weight: sum, scans, 树边: result.edges.map((p) => p.join('')).join('、') || '（无）', 未到达: unreached.join('、') || '—' },
    layers: layers({
      roles: { done: treeIds(), excluded: unreached },
      edgeRoles: { done: allIdx.filter((x) => treeSet.has(x)) },
    }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'prim-edgescan-v1', lines: L, steps, result, meta: { scans } });
}

const RUNNERS = { v1: runV1, v2: runV2, v3: runV3 };

export function run(variantId, input) {
  const fn = RUNNERS[variantId];
  if (!fn) throw new Error(`未知变体：${variantId}`);
  return fn(input || {});
}

export function sourceLines(variantId) {
  return LINES[variantId] || LINES.v1;
}
