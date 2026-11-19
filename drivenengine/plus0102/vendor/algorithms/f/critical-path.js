/**
 * F · 关键路径（AOE 网，3 个代表性、彼此不同的实现）
 *
 * 三个变体算的是同一件事（ve / vl / 时差 / 关键活动 / 关键路径），差别在**推进方式**：
 *   v1 拓扑序 ve + 逆拓扑 vl —— 先把拓扑序整个算出来，再正着一遍求 ve、倒着一遍求 vl；
 *   v2 DFS 记忆化最长路       —— 不显式拓扑排序：沿入边递归求"最长前驱路径"当 ve，
 *                                memo 命中即复用；灰色回边 = 有环。再做一次对后继的递归反推 vl；
 *   v3 AOE 表 + 关键路径枚举  —— 先算 ve/vl，然后把**活动表**（工期 w、最早开始 e、最迟开始 l、
 *                                时差 l-e）整张表摊开，最后枚举出所有时差为 0 的路径（多条都列出）。
 *
 * 契约（docs/04-轨迹契约.md）：每步都是完整快照；step.lineId 命中本变体自己的 sourceLines；
 * 最后一步 done=true 且 result 与样例 expect 深比较一致。
 * 约定：工期（duration）记在**边**上；事件（顶点）只有发生时间 ve/vl。
 */

import { trace, step, graphLayer, arrayLayer, gridLayer } from '../../engine/model.js';

export const meta = {
  id: 'f/critical-path',
  variants: [
    { id: 'v1', name: '拓扑序 ve + 逆拓扑 vl', note: '正序求最早发生时间，逆序求最迟发生时间，时差为 0 的活动即关键活动' },
    { id: 'v2', name: 'DFS 记忆化最长路', note: '记忆化求每个事件的最长前驱路径长度作为 ve，再反推 vl' },
    { id: 'v3', name: 'AOE 表 + 关键路径枚举', note: '输出活动表并枚举所有时差为 0 的路径（多条关键路径都要列出）' },
  ],
};

const NORMAL = {
  nodes: ['A', 'B', 'C', 'D'],
  edges: [['A', 'B', 2], ['A', 'C', 2], ['B', 'D', 3], ['C', 'D', 3]],
};

const CYCLE = {
  nodes: ['A', 'B', 'C'],
  edges: [['A', 'B', 2], ['B', 'C', 2], ['C', 'A', 2]],
};

const SINGLE = {
  nodes: ['A', 'B'],
  edges: [['A', 'B', 5]],
};

export const samples = [
  {
    id: 'normal',
    label: 'A→B(2)、A→C(2)、B→D(3)、C→D(3)：总工期 5，两条关键路径',
    input: NORMAL,
    expect: { duration: 5, critical: [['A', 'B', 'D'], ['A', 'C', 'D']], cycle: false },
  },
  {
    id: 'edge-cycle',
    label: 'A→B→C→A 成环（AOE 网必须无环，拓扑排序失败）',
    input: CYCLE,
    expect: { cycle: true },
  },
  {
    id: 'edge-single',
    label: '单活动图 A→B(5)：工期全由这一条边决定',
    input: SINGLE,
    expect: { duration: 5, critical: [['A', 'B']], cycle: false },
  },
];

/* ------------------------------------------------------------------ 展示代码 */

const LINES = {
  v1: [
    { lineId: 'fn', text: 'Status CriticalPath(ALGraph *G) {' },
    { lineId: 'init', text: '  InitStack(&S);' },
    { lineId: 'indeg', text: '  for (v = 0; v < G->vexnum; ++v) {  indegree[v] = 入度;  ve[v] = 0; }' },
    { lineId: 'push0', text: '  for (v = 0; v < G->vexnum; ++v) if (indegree[v] == 0) Push(&S, v);' },
    { lineId: 'topo', text: '  while (!StackEmpty(&S)) {                    /* ① 先算拓扑序列 */' },
    { lineId: 'pop', text: '    v = Pop(&S);  topo[++m] = v;' },
    { lineId: 've', text: '    for each 弧 <v,w>:  if (ve[v] + dut(<v,w>) > ve[w]) ve[w] = ve[v] + dut(<v,w>);' },
    { lineId: 'dec', text: '    --indegree[w];  if (indegree[w] == 0) Push(&S, w);' },
    { lineId: 'topoEnd', text: '  }                                            /* ve[] 全部就绪 */' },
    { lineId: 'cycle', text: '  if (m < G->vexnum) return ERROR;             /* 有环：不存在拓扑序列 */' },
    { lineId: 'rev', text: '  for (i = m - 1; i >= 0; --i) {  v = topo[i];  /* ② 逆拓扑求 vl */' },
    { lineId: 'vl', text: '    for each 弧 <u,v>:  if (vl[v] - dut(<u,v>) < vl[u]) vl[u] = vl[v] - dut(<u,v>);' },
    { lineId: 'revEnd', text: '  }' },
    { lineId: 'slack', text: '  for each 弧 a = <u,v>:  e = ve[u];  l = vl[v] - dut(a);  /* 时差 l - e */' },
    { lineId: 'critical', text: '    if (e == l) 输出关键活动 a;              /* 关键活动串起来 = 关键路径 */' },
    { lineId: 'done', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'int Ve(int v) {                       /* 记忆化：v 的最长前驱路径长度 */' },
    { lineId: 'gray', text: '  if (state[v] == GRAY) { cyclic = TRUE; return 0; }   /* 回边 → 有环 */' },
    { lineId: 'memo', text: '  if (state[v] == BLACK) return ve[v];              /* memo 命中，不再递归 */' },
    { lineId: 'white', text: '  state[v] = GRAY;  ve[v] = 0;' },
    { lineId: 'loop', text: '  for each 弧 <u,v>:                              /* 只沿入边递归 */' },
    { lineId: 'rec', text: '    t = Ve(u) + dut(<u,v>);' },
    { lineId: 'upd', text: '    if (t > ve[v]) ve[v] = t;' },
    { lineId: 'blk', text: '  state[v] = BLACK;  return ve[v];                /* 结果被记住 */' },
    { lineId: 'fnEnd', text: '}' },
    { lineId: 'vlFn', text: 'int Vl(int u) {                       /* 对后继记忆化反推最迟发生时间 */' },
    { lineId: 'vlLoop', text: '  for each 弧 <u,v>:  t = Vl(v) - dut(<u,v>);' },
    { lineId: 'vlUpd', text: '    if (t < vl[u]) vl[u] = t;                   /* vl 初值 = 总工期 */' },
    { lineId: 'vlEnd', text: '  return vl[u]; }' },
    { lineId: 'slack', text: '/* main: 每个活动 e = ve[tail]、l = vl[head] - w，时差 = l - e */' },
    { lineId: 'critical', text: '/* 时差 0 的活动是关键活动；沿它们从源走到汇即关键路径 */' },
  ],
  v3: [
    { lineId: 'fn', text: 'Status AOE_CriticalPaths(ALGraph *G) {' },
    { lineId: 'topo', text: '  TopoSort(G, topo);  if (m < G->vexnum) return ERROR;   /* 有环直接失败 */' },
    { lineId: 've', text: '  for (i = 0; i < m; ++i) for each 弧 <v,w> from topo[i]: ve[w] = max(ve[w], ve[v] + w);' },
    { lineId: 'revTopo', text: '  for each v: vl[v] = ve[汇点] = 总工期;          /* 逆拓扑的初值 */' },
    { lineId: 'vl', text: '  for (i = m - 1; i >= 0; --i) for each 弧 <u,v> into topo[i]: vl[u] = min(vl[u], vl[v] - w);' },
    { lineId: 'table', text: '  /* 建活动表：活动 a | 起点 | 终点 | 工期 w | 最早开始 e=ve[tail] | 最迟开始 l=vl[head]-w */' },
    { lineId: 'slack', text: '  for each 活动 a:  d[a] = l[a] - e[a];            /* 时差 */' },
    { lineId: 'critical', text: '  if (d[a] == 0) 标为关键活动（画面上 edges[].state = "path"）' },
    { lineId: 'enum', text: '  for each 源事件 s（无关键入边）: DFS(s)，只走 d == 0 的弧' },
    { lineId: 'paths', text: '    走到没有出弧的事件即得一条完整关键路径；多条都要输出' },
    { lineId: 'cycle', text: '  /* 若 TopoSort 只排出 m < vexnum 个事件：网中有环，关键路径无定义 */' },
    { lineId: 'done', text: '}' },
  ],
};

/* ------------------------------------------------------------------ 输入归一 / 公共结构 */

const str = (v) => String(v);
const fmt = (x) => (x == null || !Number.isFinite(Number(x)) ? '—' : Number(x));
const EPS = 1e-9;

/** 输入归一：nodes 可为 ['A','B'] 或 [{id,label}]，edges 可为 [from,to,w] 或 {from,to,w} */
function normGraph(input) {
  const raw = input || {};
  const sub = raw.graph || {};
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : (Array.isArray(sub.nodes) ? sub.nodes : []);
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : (Array.isArray(sub.edges) ? sub.edges : []);

  const ids = [];
  const addId = (id) => {
    const s = str(id);
    if (!s || s === 'undefined' || s === 'null' || ids.includes(s) || ids.length >= 8) return;
    ids.push(s);
  };
  for (const nd of rawNodes) addId(nd && typeof nd === 'object' ? (nd.id ?? nd.label) : nd);

  const pick = (e, k, alt) => (Array.isArray(e) ? e[k] : (e?.[alt] ?? e?.[k]));
  const edges = [];
  for (const e of rawEdges) {
    const from = str(pick(e, 0, 'from'));
    const to = str(pick(e, 1, 'to'));
    const wRaw = Array.isArray(e) ? e[2] : (e.w ?? e.weight ?? e.duration);
    if (!from || !to) continue;
    if (!ids.length) addId(from);
    if (!ids.includes(from) || !ids.includes(to)) continue;
    let w = Number(wRaw);
    if (!Number.isFinite(w)) w = 1;
    if (w < 0) w = 0;                                     // 工期不能为负：夹到 0，交给画面显示
    edges.push({ from, to, w });
  }
  return { ids, edges };
}

function structOf(g) {
  const idx = new Map(g.ids.map((id, i) => [id, i]));
  const out = g.ids.map(() => []);
  const inn = g.ids.map(() => []);
  g.edges.forEach((e, ei) => {
    out[idx.get(e.from)].push(ei);
    inn[idx.get(e.to)].push(ei);
  });
  return { idx, out, inn };
}

function topoOf(g, s) {
  const indeg = g.ids.map((_, i) => s.inn[i].length);
  const queue = g.ids.map((_, i) => i).filter((i) => indeg[i] === 0);
  const order = [];
  while (queue.length) {
    const u = queue.shift();
    order.push(u);
    for (const ei of s.out[u]) {
      const v = s.idx.get(g.edges[ei].to);
      indeg[v] -= 1;
      if (indeg[v] === 0) queue.push(v);
    }
  }
  return { order, cyclic: order.length < g.ids.length };
}

/** 关键活动集合 → 所有关键路径（源事件出发，只走时差为 0 的边，多条全列，顺序稳定） */
function criticalPathsOf(g, s, critSet) {
  const outs = g.ids.map(() => []);
  const ins = g.ids.map(() => []);
  for (const ei of critSet) {
    outs[s.idx.get(g.edges[ei].from)].push(ei);
    ins[s.idx.get(g.edges[ei].to)].push(ei);
  }
  const starts = g.ids.map((_, i) => i).filter((i) => ins[i].length === 0 && outs[i].length > 0);
  const paths = [];
  const walk = [];
  const dfs = (u) => {
    if (!outs[u].length) {
      paths.push(walk.map((i) => g.ids[i]));
      return;
    }
    for (const ei of outs[u]) {
      const v = s.idx.get(g.edges[ei].to);
      walk.push(v);
      dfs(v);
      walk.pop();
    }
  };
  for (const st of starts) {
    walk.length = 0;
    walk.push(st);
    dfs(st);
  }
  return paths.sort((a, b) => a.join('→').localeCompare(b.join('→')));
}

/* ------------------------------------------------------------------ 变体 1：拓扑序 ve + 逆拓扑 vl */

function runV1(input) {
  const g = normGraph(input);
  const L = LINES.v1;
  const steps = [];
  const s = structOf(g);
  const n = g.ids.length;

  const ve = g.ids.map(() => null);
  const vl = g.ids.map(() => null);
  const critSet = [];
  let order = [];
  let cyclic = false;
  let duration = 0;

  const graphOf = (edgeStates = {}, roles = {}) => graphLayer({
    id: 'graph',
    title: 'AOE 网（工期在边上）',
    name: 'ALGraph · 有向无环图',
    directed: true,
    weighted: true,
    layout: 'circle',
    nodes: g.ids.map((id, i) => ({
      id,
      label: id,
      sub: `ve=${fmt(ve[i])} vl=${fmt(vl[i])}`,
      badge: critSet.length && g.edges.some((e, ei) => critSet.includes(ei) && (e.from === id || e.to === id)) ? '★' : undefined,
    })),
    edges: g.edges.map((e, i) => ({ from: e.from, to: e.to, w: e.w, directed: true, state: edgeStates[i] || 'idle' })),
    roles,
  });

  const arr = (vals, o = {}) => arrayLayer({
    id: o.id || 've',
    title: o.title || 've[]（事件最早发生时间）',
    name: o.name || 'int ve[n]',
    values: vals.map((v) => fmt(v)),
    labels: g.ids.slice(),
    roles: o.roles || {},
  });

  const panels = (edgeStates, roles, o = {}) => [
    graphOf(edgeStates, roles),
    arr(ve, { id: 've', title: 've[]（事件最早发生时间）', roles: o.veRoles || {} }),
    arr(vl, { id: 'vl', title: 'vl[]（事件最迟发生时间，未算先显示 —）', roles: o.vlRoles || {} }),
  ];

  const vars = (extra = {}) => ({
    顶点数: n,
    活动数: g.edges.length,
    总工期: ve.some((v) => v != null) ? Math.max(0, ...ve.filter((v) => v != null)) : '—',
    拓扑序: order.length ? order.map((i) => g.ids[i]).join(' → ') : '—',
    关键活动: critSet.length ? critSet.map((ei) => `${g.edges[ei].from}${g.edges[ei].to}`).join(',') : '—',
    ...extra,
  });

  steps.push(step({
    event: 'init',
    lineId: 'fn',
    note: `AOE 网：**工期记在边上**，顶点只是"事件"。共 ${n} 个事件 / ${g.edges.length} 个活动。两条流水线并行时，完成时间由最慢的那条决定 —— 这就是关键路径。先把入度算出来、ve 全部归零。`,
    vars: vars({ m: 0 }),
    layers: panels({}, { pointers: s.out.length && g.ids[0] ? [{ id: 'v', label: 'v', node: g.ids[0] }] : [] }),
  }));

  const topo = topoOf(g, s);
  order = topo.order;
  cyclic = topo.cyclic;

  // ① 拓扑序 + 正序求 ve
  const shows = g.ids.map((_, i) => ({ id: g.ids[i], indeg: s.inn[i].length }));
  steps.push(step({
    event: 'init',
    lineId: 'indeg',
    note: `入度为 0 的事件先入栈：${shows.filter((x) => x.indeg === 0).map((x) => x.id).join('、') || '（没有，说明有环）'}。从它们出发才能保证求 ve 时前驱已经算完。`,
    vars: vars({ 入度: shows.map((x) => `${x.id}:${x.indeg}`).join(' ') }),
    layers: panels({}, { excluded: [], pointers: shows.filter((x) => x.indeg === 0).map((x) => ({ id: 'src', label: '源事件', node: x.id })) }),
  }));

  const indegLeft = g.ids.map((_, i) => s.inn[i].length);
  const queue = g.ids.map((_, i) => i).filter((i) => indegLeft[i] === 0);
  ve.forEach((_, i) => { ve[i] = 0; });
  const varTopo = [];

  while (queue.length) {
    const u = queue.shift();
    varTopo.push(u);
    steps.push(step({
      event: 'topo',
      lineId: 'pop',
      note: `出栈 ${g.ids[u]}（拓扑序第 ${varTopo.length} 个）：它的所有前驱都已经算完，ve[${g.ids[u]}] = ${fmt(ve[u])} 就是最终值了。`,
      vars: vars({ u: g.ids[u] }),
      layers: panels({}, {
        focus1: [g.ids[u]],
        pointers: [{ id: 'v', label: 'v', node: g.ids[u] }],
      }, { veRoles: { done: varTopo.map((i) => i) } }),
    }));

    for (const ei of s.out[u]) {
      const e = g.edges[ei];
      const v = s.idx.get(e.to);
      const cand = ve[u] + e.w;
      const better = cand > ve[v];
      if (better) ve[v] = cand;
      steps.push(step({
        event: 've',
        lineId: 've',
        note: `看活动 ${e.from}→${e.to}（工期 ${e.w}）：ve[${e.from}] + ${e.w} = ${cand} ${better ? `> ve[${e.to}]，把 ve[${e.to}] 抬到 ${cand}（最长的那条前驱路径才算数）` : `≤ ve[${e.to}] = ${fmt(ve[v])}，保持不变（还有更长的前驱路径）`}。`,
        vars: vars({ 活动: `${e.from}→${e.to}`, w: e.w, 候选: cand }),
        layers: panels({ [ei]: 'active' }, {
          focus1: [e.from],
          focus2: [e.to],
          pointers: [{ id: 'u', label: 'u', node: e.from }, { id: 'v', label: 'v', node: e.to }],
        }),
      }));
      indegLeft[v] -= 1;
      if (indegLeft[v] === 0) queue.push(v);
      steps.push(step({
        event: 'topo',
        lineId: 'dec',
        note: `入度(${e.to}) 减到 ${indegLeft[v]}${indegLeft[v] === 0 ? ' → 入栈，等会儿处理它' : ' → 还有前驱没算完，先搁着'}。`,
        vars: vars({ 入度: `${e.to}:${indegLeft[v]}` }),
        layers: panels({ [ei]: 'tree' }, { focus1: [e.to], pointers: [{ id: 'v', label: 'v', node: e.to }] }),
      }));
    }
  }

  if (cyclic) {
    const left = g.ids.filter((_, i) => !varTopo.includes(i));
    steps.push(step({
      event: 'cycle',
      lineId: 'cycle',
      note: `拓扑序列只排出 ${varTopo.length} 个事件，还剩 ${left.join('、')} 排不进来 —— 它们互相等待，这就是环。有环的 AOE 网没有"最早发生时间"，关键路径无定义。`,
      vars: vars({ m: varTopo.length, 环上事件: left.join('、') }),
      layers: panels({}, { excluded: left, pointers: left.map((id) => ({ id: 'cyc', label: '卡在环里', node: id })) }),
    }));
    duration = 0;
    const result = { duration: 0, critical: [], cycle: true, topo: varTopo.map((i) => g.ids[i]) };
    steps.push(step({
      event: 'done',
      lineId: 'done',
      done: true,
      result,
      note: '有环 → CriticalPath 直接返回 ERROR：先把网修正成 DAG 才能谈关键路径。',
      vars: vars({ 拓扑序: varTopo.map((i) => g.ids[i]).join(' → ') || '（空）' }),
      layers: panels({}, { excluded: left }),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'critical-path-topo-v1', lines: L, steps, result, meta: { cyclic: true } });
  }

  steps.push(step({
    event: 'topo',
    lineId: 'topoEnd',
    note: `拓扑序列排完：${varTopo.map((i) => g.ids[i]).join(' → ')}。ve[] 全部就绪，总工期 = max(ve) = ${fmt(Math.max(0, ...ve))}（汇点事件的最早发生时间）。`,
    vars: vars({ 总工期: Math.max(0, ...ve) }),
    layers: panels({}, { done: varTopo.map((i) => g.ids[i]) }, { veRoles: { done: varTopo.map((i) => i) } }),
  }));

  // ② 逆拓扑求 vl
  duration = Math.max(0, ...ve);
  vl.forEach((_, i) => { vl[i] = duration; });
  const revOrder = [...varTopo].reverse();
  steps.push(step({
    event: 'reverse-topo',
    lineId: 'rev',
    note: `倒着走拓扑序（${revOrder.map((i) => g.ids[i]).join(' ← ')}）：所有 vl 先都设成总工期 ${duration}，再从每个事件的**出边**把它往前压。`,
    vars: vars({ 总工期: duration }),
    layers: panels({}, { pointers: [{ id: 'v', label: 'v', node: g.ids[revOrder[0]] }] }, {
      veRoles: { done: varTopo.map((i) => i) },
      vlRoles: { added: g.ids.map((_, i) => i) },
    }),
  }));

  for (const v of revOrder) {
    for (const ei of s.out[v]) {
      const e = g.edges[ei];
      const to = s.idx.get(e.to);
      const cand = vl[to] - e.w;
      const better = cand < vl[v];
      if (better) vl[v] = cand;
      steps.push(step({
        event: 'vl',
        lineId: 'vl',
        note: `活动 ${e.from}→${e.to}：vl[${e.to}] - ${e.w} = ${cand} ${better ? `< vl[${e.from}]，说明 ${e.from} 最晚只能拖到 ${cand}` : `≥ vl[${e.from}] = ${fmt(vl[v])}，不构成更紧的约束`}。`,
        vars: vars({ 活动: `${e.from}→${e.to}`, w: e.w, 候选: cand }),
        layers: panels({ [ei]: 'active' }, {
          focus1: [e.from],
          focus2: [e.to],
          pointers: [{ id: 'u', label: 'u', node: e.from }, { id: 'v', label: 'v', node: e.to }],
        }),
      }));
    }
    steps.push(step({
      event: 'reverse-topo',
      lineId: 'revEnd',
      note: `${g.ids[v]} 的 vl 定下来：${fmt(vl[v])}。它若等于 ve[${g.ids[v]}] = ${fmt(ve[v])}，说明这个事件一刻也不能拖。`,
      vars: vars({ 事件: g.ids[v], vl: vl[v] }),
      layers: panels({}, { focus1: [g.ids[v]], pointers: [{ id: 'v', label: 'v', node: g.ids[v] }] }, {
        vlRoles: { done: revOrder.slice(revOrder.indexOf(v)).map((i) => i) },
      }),
    }));
  }

  // ③ 时差 → 关键活动
  for (let ei = 0; ei < g.edges.length; ei++) {
    const e = g.edges[ei];
    const u = s.idx.get(e.from);
    const v = s.idx.get(e.to);
    const es = ve[u];
    const ls = vl[v] - e.w;
    const slack = ls - es;
    const isCrit = Math.abs(slack) < EPS;
    if (isCrit) critSet.push(ei);
    steps.push(step({
      event: 'slack',
      lineId: 'slack',
      note: `活动 ${e.from}→${e.to}（w=${e.w}）：最早开始 e = ve[${e.from}] = ${fmt(es)}，最迟开始 l = vl[${e.to}] - ${e.w} = ${fmt(ls)}，时差 = ${fmt(slack)}。${isCrit ? '时差 0 → **关键活动**，早一天晚一天都直接拖总工期。' : '时差 > 0 → 有一定活动余地，可以晚开工。'}`,
      vars: vars({ 活动: `${e.from}→${e.to}`, e: es, l: ls, 时差: slack }),
      layers: panels({ [ei]: isCrit ? 'path' : 'reject' }, {
        focus1: [e.from],
        focus2: [e.to],
        pointers: [{ id: 'u', label: 'u', node: e.from }, { id: 'v', label: 'v', node: e.to }],
      }),
    }));
  }

  const critical = criticalPathsOf(g, s, critSet);
  for (const p of critical) {
    steps.push(step({
      event: 'critical-edge',
      lineId: 'critical',
      note: `关键路径 ${p.join(' → ')}：这条路上的每个活动时差都是 0，串起来总长恰好等于总工期 ${duration}。${critical.length > 1 ? `注意本轮共有 ${critical.length} 条关键路径——任何一条上的活动被拖延都会推迟整个工程。` : '它是唯一一条关键路径。'}`,
      vars: vars({ 关键路径: p.join(' → '), 条数: critical.length }),
      layers: panels(
        Object.fromEntries(critSet.map((ei) => [ei, 'path'])),
        { focus1: p, pointers: [{ id: 'cp', label: `关键路径 ${p[0]}→${p[p.length - 1]}`, node: p[0] }] },
      ),
    }));
  }

  const result = { duration, critical, cycle: false, topo: varTopo.map((i) => g.ids[i]) };
  steps.push(step({
    event: 'done',
    lineId: 'done',
    done: true,
    result,
    note: `完成：总工期 ${duration}，关键路径 ${critical.length} 条${critical.length ? `（${critical.map((p) => p.join('→')).join('、')}）` : ''}。正序一遍得 ve、逆序一遍得 vl，两遍都是 O(V+E)。`,
    vars: vars({ 关键路径: critical.map((p) => p.join('→')).join('、') || '（无）' }),
    layers: panels(Object.fromEntries(critSet.map((ei) => [ei, 'path'])), {
      done: g.ids.slice(),
      pointers: critical.map((p, i) => ({ id: `cp${i}`, label: `关键路径${i + 1}`, node: p[0] })),
    }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'critical-path-topo-v1', lines: L, steps, result, meta: { duration, criticalCount: critical.length } });
}

/* ------------------------------------------------------------------ 变体 2：DFS 记忆化最长路 */

function runV2(input) {
  const g = normGraph(input);
  const L = LINES.v2;
  const steps = [];
  const s = structOf(g);
  const n = g.ids.length;

  const ve = g.ids.map(() => null);
  const vl = g.ids.map(() => null);
  const critSet = [];
  let cyclic = false;
  let duration = 0;

  const graphOf = (edgeStates = {}, roles = {}) => graphLayer({
    id: 'graph',
    title: 'AOE 网（DFS 记忆化）',
    name: 'ALGraph · 有向无环图',
    directed: true,
    weighted: true,
    layout: 'circle',
    nodes: g.ids.map((id, i) => ({
      id,
      label: id,
      sub: `ve=${fmt(ve[i])} vl=${fmt(vl[i])}`,
      badge: critSet.length && g.edges.some((e, ei) => critSet.includes(ei) && (e.from === id || e.to === id)) ? '★' : undefined,
    })),
    edges: g.edges.map((e, i) => ({ from: e.from, to: e.to, w: e.w, directed: true, state: edgeStates[i] || 'idle' })),
    roles,
  });

  const arr = (vals, o = {}) => arrayLayer({
    id: o.id || 've',
    title: o.title,
    name: o.name,
    values: vals.map((v) => fmt(v)),
    labels: g.ids.slice(),
    roles: o.roles || {},
  });

  const panels = (edgeStates, roles, o = {}) => [
    graphOf(edgeStates, roles),
    arr(ve, { id: 've', title: 've[]（= 记忆化 DFS 的返回值）', name: 'int ve[n]', roles: o.veRoles || {} }),
    arr(vl, { id: 'vl', title: 'vl[]（对后继再记忆化一次）', name: 'int vl[n]', roles: o.vlRoles || {} }),
  ];

  const vars = (extra = {}) => ({
    顶点数: n,
    活动数: g.edges.length,
    总工期: duration || (ve.some((v) => v != null) ? Math.max(0, ...ve.filter((v) => v != null)) : '—'),
    关键活动: critSet.length ? critSet.map((ei) => `${g.edges[ei].from}${g.edges[ei].to}`).join(',') : '—',
    ...extra,
  });

  steps.push(step({
    event: 'init',
    lineId: 'fn',
    note: `与 v1 的差别：**不显式做拓扑排序**。ve[v] 直接定义成"到 v 的最长前驱路径长度"，用记忆化递归求它；某个顶点会被很多后继共享，算过一次就存进 ve[] 不再重算。灰色回边一旦出现就说明有环。`,
    vars: vars({ 调用: 'Ve(每个未访问顶点)' }),
    layers: panels({}, { pointers: g.ids.length ? [{ id: 's', label: '起点扫描', node: g.ids[0] }] : [] }),
  }));

  // ① 记忆化 DFS 求 ve
  const state = g.ids.map(() => 0); // 0 白 / 1 灰 / 2 黑
  const dfsVe = (v) => {
    if (state[v] === 1) {
      cyclic = true;
      steps.push(step({
        event: 'cycle',
        lineId: 'gray',
        note: `递归要再次进入 ${g.ids[v]}，但它还在灰色（当前递归链上）——这是一条回边，说明存在环。环里的"最长路"会无限增长，AOE 无定义。`,
        vars: vars({ 环: g.ids[v] }),
        layers: panels({}, { focus1: [g.ids[v]], pointers: [{ id: 'back', label: '回边指回', node: g.ids[v] }] }),
      }));
      return 0;
    }
    if (state[v] === 2) {
      steps.push(step({
        event: 've',
        lineId: 'memo',
        note: `Ve(${g.ids[v]}) 命中记忆：ve[${g.ids[v]}] 已经算过是 ${fmt(ve[v])}，直接返回，不再展开它的前驱。这就是记忆化省的重复活。`,
        vars: vars({ 记忆命中: g.ids[v], ve: ve[v] }),
        layers: panels({}, { focus1: [g.ids[v]], done: g.ids.filter((_, i) => state[i] === 2), pointers: [{ id: 'v', label: 'v', node: g.ids[v] }] }, { veRoles: { added: [v] } }),
      }));
      return ve[v];
    }
    state[v] = 1;
    ve[v] = 0;
    steps.push(step({
      event: 've',
      lineId: 'white',
      note: `进入 Ve(${g.ids[v]})：染灰（在递归链上），ve 先置 0，然后逐个前驱递归下去。`,
      vars: vars({ 当前: g.ids[v], 递归链: g.ids.filter((_, i) => state[i] === 1).join(' → ') }),
      layers: panels({}, { focus1: [g.ids[v]], pointers: [{ id: 'v', label: 'v', node: g.ids[v] }] }),
    }));

    for (const ei of s.inn[v]) {
      const e = g.edges[ei];
      const u = s.idx.get(e.from);
      steps.push(step({
        event: 've',
        lineId: 'loop',
        note: `沿入边 ${e.from}→${e.to}（w=${e.w}）递归求前驱 ${e.from} 的最长路。`,
        vars: vars({ 活动: `${e.from}→${e.to}`, w: e.w }),
        layers: panels({ [ei]: 'active' }, {
          focus1: [e.from],
          focus2: [e.to],
          pointers: [{ id: 'u', label: 'u', node: e.from }, { id: 'v', label: 'v', node: e.to }],
        }),
      }));
      if (cyclic) return 0;
      const t = dfsVe(u) + e.w;
      if (cyclic) return 0;
      const better = t > ve[v];
      if (better) ve[v] = t;
      steps.push(step({
        event: 've',
        lineId: 'upd',
        note: `返回 ${e.from} 的 ve = ${fmt(ve[u])}，加这条边的工期 ${e.w} 得 ${t}：${better ? `比当前的 ${fmt(ve[v])} 大 → ve[${g.ids[v]}] 取 ${t}（最长者胜出）` : `不大于当前的 ${fmt(ve[v])}，保留原值`}。`,
        vars: vars({ 候选: t, 当前ve: ve[v] }),
        layers: panels({ [ei]: 'tree' }, {
          focus1: [g.ids[v]],
          pointers: [{ id: 'v', label: 'v', node: g.ids[v] }, { id: 'from', label: `来自 ${e.from}`, node: e.from }],
        }),
      }));
    }

    state[v] = 2;
    steps.push(step({
      event: 've',
      lineId: 'blk',
      note: `Ve(${g.ids[v]}) = ${fmt(ve[v])}，染黑写进记忆——以后再有人问它就直接返回。`,
      vars: vars({ 返回: g.ids[v], ve: ve[v] }),
      layers: panels({}, { focus1: [g.ids[v]], done: g.ids.filter((_, i) => state[i] === 2), pointers: [{ id: 'v', label: 'v', node: g.ids[v] }] }, { veRoles: { done: [v] } }),
    }));
    return ve[v];
  };

  for (let v = 0; v < n && !cyclic; v++) {
    if (state[v] === 0) dfsVe(v);
  }

  if (cyclic) {
    duration = 0;
    const result = { duration: 0, critical: [], cycle: true, topo: [] };
    steps.push(step({
      event: 'done',
      lineId: 'fnEnd',
      done: true,
      result,
      note: '检测到环 → 关键路径无定义，直接收尾（v1/v3 用拓扑排序发现同一个环，这里靠递归栈的灰色标记更早发现）。',
      vars: vars({ 结论: '有环' }),
      layers: panels({}),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'critical-path-dfsmemo-v1', lines: L, steps, result, meta: { cyclic: true } });
  }

  duration = Math.max(0, ...ve);
  steps.push(step({
    event: 'topo',
    lineId: 'fnEnd',
    note: `所有 Ve 都算完了：ve = [${ve.map(fmt).join(', ')}]，总工期 = max(ve) = ${duration}。接下来反推 vl：把 vl 全部设成 ${duration}，再对后继递归取 min。`,
    vars: vars({ 总工期: duration }),
    layers: panels({}, { done: g.ids.slice() }, { veRoles: { done: g.ids.map((_, i) => i) } }),
  }));

  // ② 对后继记忆化反推 vl
  vl.forEach((_, i) => { vl[i] = duration; });
  const state2 = g.ids.map(() => 0);
  const dfsVl = (u) => {
    if (state2[u]) return vl[u];
    state2[u] = 1;
    steps.push(step({
      event: 'reverse-topo',
      lineId: 'vlFn',
      note: `进入 Vl(${g.ids[u]})：vl 初值先按总工期 ${duration} 顶着，再沿出边往回收。`,
      vars: vars({ 当前: g.ids[u], vl: vl[u] }),
      layers: panels({}, { focus1: [g.ids[u]], pointers: [{ id: 'v', label: 'v', node: g.ids[u] }] }, { vlRoles: { focus1: [u] } }),
    }));
    for (const ei of s.out[u]) {
      const e = g.edges[ei];
      const v = s.idx.get(e.to);
      const t = dfsVl(v) - e.w;
      const better = t < vl[u];
      if (better) vl[u] = t;
      steps.push(step({
        event: 'vl',
        lineId: 'vlUpd',
        note: `后继 ${e.to} 的 vl = ${fmt(vl[v])}，减去工期 ${e.w} 得 ${t}：${better ? `比当前 ${fmt(vl[u])} 更紧 → vl[${g.ids[u]}] 收到 ${t}` : `不比当前 ${fmt(vl[u])} 更紧，保持`}。`,
        vars: vars({ 活动: `${e.from}→${e.to}`, 候选: t }),
        layers: panels({ [ei]: 'active' }, {
          focus1: [g.ids[u]],
          focus2: [e.to],
          pointers: [{ id: 'u', label: 'u', node: g.ids[u] }, { id: 'v', label: 'v', node: e.to }],
        }, { vlRoles: { focus1: [u] } }),
      }));
    }
    state2[u] = 2;
    return vl[u];
  };

  for (let u = 0; u < n; u++) if (!state2[u]) dfsVl(u);

  // ③ 时差 → 关键活动 → 路径
  for (let ei = 0; ei < g.edges.length; ei++) {
    const e = g.edges[ei];
    const u = s.idx.get(e.from);
    const v = s.idx.get(e.to);
    const es = ve[u];
    const ls = vl[v] - e.w;
    const slack = ls - es;
    const isCrit = Math.abs(slack) < EPS;
    if (isCrit) critSet.push(ei);
    steps.push(step({
      event: 'slack',
      lineId: 'slack',
      note: `活动 ${e.from}→${e.to}：e = ve[${e.from}] = ${fmt(es)}，l = vl[${e.to}] - ${e.w} = ${fmt(ls)}，时差 ${fmt(slack)}${isCrit ? ' → 关键活动（一刻也不能拖）' : ' → 有活动余地'}。`,
      vars: vars({ 活动: `${e.from}→${e.to}`, 时差: slack }),
      layers: panels({ [ei]: isCrit ? 'path' : 'reject' }, {
        focus1: [e.from],
        focus2: [e.to],
        pointers: [{ id: 'u', label: 'u', node: e.from }, { id: 'v', label: 'v', node: e.to }],
      }),
    }));
  }

  const critical = criticalPathsOf(g, s, critSet);
  for (const p of critical) {
    steps.push(step({
      event: 'critical-edge',
      lineId: 'critical',
      note: `关键路径 ${p.join(' → ')}：一路时差为 0，长度正好是总工期 ${duration}${critical.length > 1 ? `；这样的路径共有 ${critical.length} 条，任一条被拖都会推迟工程` : ''}。`,
      vars: vars({ 关键路径: p.join(' → '), 条数: critical.length }),
      layers: panels(Object.fromEntries(critSet.map((ei) => [ei, 'path'])), {
        focus1: p,
        pointers: [{ id: 'cp', label: `关键路径 ${p[0]}→${p[p.length - 1]}`, node: p[0] }],
      }),
    }));
  }

  const result = { duration, critical, cycle: false, topo: [] };
  steps.push(step({
    event: 'done',
    lineId: 'critical',
    done: true,
    result,
    note: `完成：记忆化 DFS 一次遍历求 ve，再对后继递归求 vl，都是 O(V+E)。总工期 ${duration}，关键路径 ${critical.length} 条${critical.length ? `（${critical.map((p) => p.join('→')).join('、')}）` : ''}。`,
    vars: vars({ 关键路径: critical.map((p) => p.join('→')).join('、') || '（无）' }),
    layers: panels(Object.fromEntries(critSet.map((ei) => [ei, 'path'])), {
      done: g.ids.slice(),
      pointers: critical.map((p, i) => ({ id: `cp${i}`, label: `关键路径${i + 1}`, node: p[0] })),
    }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'critical-path-dfsmemo-v1', lines: L, steps, result, meta: { duration, criticalCount: critical.length } });
}

/* ------------------------------------------------------------------ 变体 3：AOE 表 + 关键路径枚举 */

function runV3(input) {
  const g = normGraph(input);
  const L = LINES.v3;
  const steps = [];
  const s = structOf(g);
  const n = g.ids.length;

  const ve = g.ids.map(() => null);
  const vl = g.ids.map(() => null);
  const critSet = [];
  let order = [];
  let cyclic = false;
  let duration = 0;

  const graphOf = (edgeStates = {}, roles = {}) => graphLayer({
    id: 'graph',
    title: 'AOE 网（关键边标 path）',
    name: 'ALGraph · 有向无环图',
    directed: true,
    weighted: true,
    layout: 'circle',
    nodes: g.ids.map((id, i) => ({
      id,
      label: id,
      sub: `ve=${fmt(ve[i])} vl=${fmt(vl[i])}`,
      badge: critSet.length && g.edges.some((e, ei) => critSet.includes(ei) && (e.from === id || e.to === id)) ? '★' : undefined,
    })),
    edges: g.edges.map((e, i) => ({ from: e.from, to: e.to, w: e.w, directed: true, state: edgeStates[i] || 'idle' })),
    roles,
  });

  const arr = (vals, o = {}) => arrayLayer({
    id: o.id,
    title: o.title,
    name: o.name,
    values: vals.map((v) => fmt(v)),
    labels: g.ids.slice(),
    roles: o.roles || {},
  });

  /** style 6：活动表（AOE 的"表"形态，正是 v3 与 v1/v2 画面上的最大差别） */
  const tableOf = (rows, o = {}) => gridLayer({
    id: 'aoe',
    title: o.title || '活动表（AOE）',
    name: 'int a[活动数][4]',
    rowLabels: rows.map((r) => r.a),
    colLabels: ['工期 w', '最早开始 e', '最迟开始 l', '时差 l-e'],
    values: rows.map((r) => [r.w, fmt(r.e), fmt(r.l), fmt(r.slack)]),
    roles: o.roles || {},
  });

  const tableRows = () => g.edges.map((e, ei) => {
    const u = s.idx.get(e.from);
    const v = s.idx.get(e.to);
    const es = ve[u];
    const ls = vl[v] == null ? null : vl[v] - e.w;
    return {
      a: `a${ei + 1}:${e.from}→${e.to}`,
      w: e.w,
      e: es,
      l: ls,
      slack: es == null || ls == null ? null : ls - es,
    };
  });

  const panels = (edgeStates, roles, o = {}) => {
    const out = [
      graphOf(edgeStates, roles),
      arr(ve, { id: 've', title: 've[]（最早发生时间）', name: 'int ve[n]', roles: o.veRoles || {} }),
      arr(vl, { id: 'vl', title: 'vl[]（最迟发生时间）', name: 'int vl[n]', roles: o.vlRoles || {} }),
    ];
    if (o.table !== false) out.push(tableOf(tableRows(), { title: o.tableTitle, roles: o.tableRoles }));
    return out;
  };

  const vars = (extra = {}) => ({
    事件数: n,
    活动数: g.edges.length,
    总工期: duration || (ve.some((v) => v != null) ? Math.max(0, ...ve.filter((v) => v != null)) : '—'),
    关键活动数: critSet.length,
    ...extra,
  });

  steps.push(step({
    event: 'init',
    lineId: 'fn',
    note: `v3 的重点是**活动表**：每个活动一行，记 w / e / l / 时差。先把拓扑序算出来——表里的 e 要用 ve（正序），l 要用 vl（逆序）。共 ${n} 个事件、${g.edges.length} 个活动。`,
    vars: vars({ 阶段: '拓扑排序' }),
    layers: panels({}, { pointers: g.ids.length ? [{ id: 'v', label: 'v', node: g.ids[0] }] : [] }, { tableTitle: '活动表（时差待算）' }),
  }));

  const topo = topoOf(g, s);
  order = topo.order;
  cyclic = topo.cyclic;
  ve.forEach((_, i) => { ve[i] = 0; });

  for (const u of order) {
    steps.push(step({
      event: 'topo',
      lineId: 'topo',
      note: `拓扑序第 ${order.indexOf(u) + 1} 个事件 ${g.ids[u]}：此刻它的所有前驱都已就绪，可以安全地把 ve 推给它的出边。`,
      vars: vars({ v: g.ids[u] }),
      layers: panels({}, { focus1: [g.ids[u]], pointers: [{ id: 'v', label: 'v', node: g.ids[u] }] }, {
        tableTitle: '活动表（时差待算）',
      }),
    }));
    for (const ei of s.out[u]) {
      const e = g.edges[ei];
      const v = s.idx.get(e.to);
      const cand = ve[u] + e.w;
      const better = cand > ve[v];
      if (better) ve[v] = cand;
      steps.push(step({
        event: 've',
        lineId: 've',
        note: `活动 a${ei + 1}（${e.from}→${e.to}, w=${e.w}）把它记进表：e 候选 = ve[${e.from}] + ${e.w} = ${cand}，${better ? `抬到 ve[${e.to}] = ${cand}` : `不超过 ve[${e.to}] = ${fmt(ve[v])}`}。`,
        vars: vars({ 活动: `a${ei + 1}`, 候选: cand }),
        layers: panels({ [ei]: 'tree' }, {
          focus1: [e.from],
          focus2: [e.to],
          pointers: [{ id: 'u', label: 'u', node: e.from }, { id: 'v', label: 'v', node: e.to }],
        }, { tableTitle: '活动表（e 列随 ve 更新）' }),
      }));
    }
  }

  if (cyclic) {
    const left = g.ids.filter((_, i) => !order.includes(i));
    steps.push(step({
      event: 'cycle',
      lineId: 'cycle',
      note: `TopoSort 只排出 ${order.length}/${n} 个事件，${left.join('、')} 互相等待 → 有环。活动表里的 e/l 无从谈起，关键路径无定义。`,
      vars: vars({ 环上事件: left.join('、'), 阶段: '发现环' }),
      layers: panels({}, { excluded: left, pointers: left.map((id) => ({ id: 'cyc', label: '卡在环里', node: id })) }, { tableTitle: '活动表（无定义）' }),
    }));
    duration = 0;
    const result = { duration: 0, critical: [], cycle: true, topo: order.map((i) => g.ids[i]) };
    steps.push(step({
      event: 'done',
      lineId: 'done',
      done: true,
      result,
      note: '有环 → 返回 ERROR。AOE 网必须是 DAG，这是关键路径存在的前提。',
      vars: vars({ 结论: '有环' }),
      layers: panels({}, { excluded: left }, { tableTitle: '活动表（无定义）' }),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'critical-path-aoe-v1', lines: L, steps, result, meta: { cyclic: true } });
  }

  duration = Math.max(0, ...ve);
  vl.forEach((_, i) => { vl[i] = duration; });
  const rev = [...order].reverse();

  steps.push(step({
    event: 'reverse-topo',
    lineId: 'revTopo',
    note: `ve 全部就绪，总工期 = ${duration}。逆拓扑序 ${rev.map((i) => g.ids[i]).join(' → ')} 逐个回收 vl：每个事件的最迟发生时间由它的出边决定。`,
    vars: vars({ 总工期: duration, 阶段: '逆拓扑 vl' }),
    layers: panels({}, {}, { veRoles: { done: order.map((i) => i) }, vlRoles: { added: g.ids.map((_, i) => i) }, tableTitle: '活动表（e 已知，l 待算）' }),
  }));

  for (const v of rev) {
    for (const ei of s.out[v]) {
      const e = g.edges[ei];
      const to = s.idx.get(e.to);
      const cand = vl[to] - e.w;
      const better = cand < vl[v];
      if (better) vl[v] = cand;
      steps.push(step({
        event: 'vl',
        lineId: 'vl',
        note: `活动 a${ei + 1}（${e.from}→${e.to}, w=${e.w}）：vl[${e.to}] - ${e.w} = ${cand}，${better ? `把 vl[${e.from}] 收到 ${cand}` : `不紧于 vl[${e.from}] = ${fmt(vl[v])}`}。`,
        vars: vars({ 活动: `a${ei + 1}`, 候选: cand }),
        layers: panels({ [ei]: 'active' }, {
          focus1: [e.from],
          focus2: [e.to],
          pointers: [{ id: 'u', label: 'u', node: e.from }, { id: 'v', label: 'v', node: e.to }],
        }, { tableTitle: '活动表（l 列随 vl 更新）' }),
      }));
    }
  }

  // 活动表 + 时差
  const rows = tableRows();
  for (let ei = 0; ei < g.edges.length; ei++) {
    const r = rows[ei];
    const isCrit = Math.abs(r.slack) < EPS;
    if (isCrit) critSet.push(ei);
    steps.push(step({
      event: 'slack',
      lineId: 'slack',
      note: `活动 a${ei + 1}（${g.edges[ei].from}→${g.edges[ei].to}）：表里填 e = ${fmt(r.e)}、l = ${fmt(r.l)}，时差 = ${fmt(r.slack)}。${isCrit ? '时差 0 → 关键活动，edges[].state 标成 path。' : '时差 > 0 → 非关键活动。'}`,
      vars: vars({ 活动: `a${ei + 1}`, e: r.e, l: r.l, 时差: r.slack }),
      layers: panels({ [ei]: isCrit ? 'path' : 'reject' }, {
        focus1: [g.edges[ei].from],
        focus2: [g.edges[ei].to],
        pointers: [{ id: 'a', label: `a${ei + 1}`, node: g.edges[ei].from }],
      }, {
        tableRoles: { focus1: [ei] },
        tableTitle: '活动表（时差算完）',
      }),
    }));
    steps.push(step({
      event: 'critical-edge',
      lineId: 'critical',
      note: isCrit
        ? `a${ei + 1} 时差为 0，登记为关键活动：它一旦拖延，总工期立刻变成 ${fmt(duration + 1)} 这个量级。`
        : `a${ei + 1} 时差 ${fmt(r.slack)}，不进关键活动集合：它最多可以晚开工 ${fmt(r.slack)} 而不影响总工期。`,
      vars: vars({ 活动: `a${ei + 1}`, 关键: isCrit ? '是' : '否' }),
      layers: panels(Object.fromEntries(critSet.map((k) => [k, 'path'])), {}, {
        tableRoles: { focus1: [ei] },
        tableTitle: '活动表（关键列）',
      }),
    }));
  }

  const critical = criticalPathsOf(g, s, critSet);

  // 枚举：源事件出发，只走时差 0 的边
  const critOut = g.ids.map(() => []);
  for (const ei of critSet) critOut[s.idx.get(g.edges[ei].from)].push(ei);
  const critInCount = g.ids.map(() => 0);
  for (const ei of critSet) critInCount[s.idx.get(g.edges[ei].to)] += 1;
  const starts = g.ids.map((_, i) => i).filter((i) => critInCount[i] === 0 && critOut[i].length > 0);

  steps.push(step({
    event: 'critical-edge',
    lineId: 'enum',
    note: `关键活动共 ${critSet.length} 个。从每个"没有关键入边"的源事件出发（${starts.map((i) => g.ids[i]).join('、') || '无'}），只沿时差 0 的边 DFS，走到没有关键出边的事件就是一条完整关键路径 —— 这样能把多条关键路径全部列出来。`,
    vars: vars({ 源事件: starts.map((i) => g.ids[i]).join('、') || '无' }),
    layers: panels(Object.fromEntries(critSet.map((ei) => [ei, 'path'])), {
      pointers: starts.map((i) => ({ id: `s${i}`, label: '源事件', node: g.ids[i] })),
    }, { tableTitle: '活动表（关键列）' }),
  }));

  for (const p of critical) {
    steps.push(step({
      event: 'critical-edge',
      lineId: 'paths',
      note: `枚举得到关键路径 ${p.join(' → ')}：串起来正好是总工期 ${duration}${critical.length > 1 ? `。注意关键路径不必唯一，本图共 ${critical.length} 条，它们共享总工期。` : '。'}`,
      vars: vars({ 关键路径: p.join(' → '), 条数: critical.length }),
      layers: panels(Object.fromEntries(critSet.map((ei) => [ei, 'path'])), {
        focus1: p,
        pointers: [{ id: 'cp', label: `关键路径 ${p[0]}→${p[p.length - 1]}`, node: p[0] }],
      }, { tableTitle: '活动表（关键列）' }),
    }));
  }

  const result = { duration, critical, cycle: false, topo: order.map((i) => g.ids[i]) };
  steps.push(step({
    event: 'done',
    lineId: 'done',
    done: true,
    result,
    note: `完成：总工期 ${duration}，关键活动 ${critSet.length} 个，关键路径 ${critical.length} 条${critical.length ? `（${critical.map((p) => p.join('→')).join('、')}）` : ''}。活动表把 e/l/时差摊开，一眼能看出哪些活动腾不出时间。`,
    vars: vars({ 关键路径: critical.map((p) => p.join('→')).join('、') || '（无）' }),
    layers: panels(Object.fromEntries(critSet.map((ei) => [ei, 'path'])), {
      done: g.ids.slice(),
      pointers: critical.map((p, i) => ({ id: `cp${i}`, label: `关键路径${i + 1}`, node: p[0] })),
    }, { tableTitle: '活动表（最终）' }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'critical-path-aoe-v1', lines: L, steps, result, meta: { duration, criticalCount: critical.length } });
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
